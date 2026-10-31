import { expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { MAX_UPLOAD_BYTES } from "@/lib/image";
import { POST } from "./route";

const PNG_3X2 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x03,
  0x00, 0x00, 0x00, 0x02,
]);

/** Run with mock mode off and no model key, restoring both afterwards. */
async function withoutMockOrKey(fn: () => Promise<void>): Promise<void> {
  const env = process.env as Record<string, string | undefined>;
  const savedMock = env.MOCK_MODE;
  const savedKey = env.MODEL_API_KEY;
  delete env.MOCK_MODE;
  delete env.MODEL_API_KEY;
  try {
    await fn();
  } finally {
    if (savedMock !== undefined) {
      env.MOCK_MODE = savedMock;
    }
    if (savedKey !== undefined) {
      env.MODEL_API_KEY = savedKey;
    }
  }
}

async function postPhoto(file: File | null): Promise<Response> {
  const form = new FormData();
  if (file) {
    form.append("photo", file);
  }
  return POST(
    new NextRequest("http://localhost/api/build-level", {
      method: "POST",
      body: form,
    }),
  );
}

test("live mode rejects a missing photo", async () => {
  await withoutMockOrKey(async () => {
    const res = await postPhoto(null);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Upload a photo to build a level.",
    );
  });
});

test("live mode rejects a non-image upload", async () => {
  await withoutMockOrKey(async () => {
    const res = await postPhoto(
      new File(["hello"], "note.txt", { type: "text/plain" }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Please choose a JPEG, PNG or WebP photo.",
    );
  });
});

test("live mode rejects an oversize upload", async () => {
  await withoutMockOrKey(async () => {
    const res = await postPhoto(
      new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.jpg", {
        type: "image/jpeg",
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Please choose a photo smaller than 5 MB.",
    );
  });
});

test("live mode reports a missing model key", async () => {
  await withoutMockOrKey(async () => {
    const res = await postPhoto(
      new File([PNG_3X2], "tiny.png", { type: "image/png" }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("The server is missing its model key.");
    expect(body.error).not.toContain("sk-");
  });
});

test("mock mode streams the documented progress sequence", async () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = env.MOCK_MODE;
  env.MOCK_MODE = "1";
  try {
    const form = new FormData();
    form.append("photo", new File([PNG_3X2], "tiny.png", { type: "image/png" }));
    const res = await POST(
      new NextRequest("http://localhost/api/build-level?fixture=0", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    const frames = text
      .split("\n\n")
      .filter((block) => block.includes("data: "))
      .map((block) => {
        const event = block.split("\n")[0].replace("event: ", "");
        const data = JSON.parse(
          block.split("\n")[1].replace("data: ", ""),
        ) as Record<string, unknown>;
        return { event, data };
      });
    expect(frames[0]).toEqual({
      event: "progress",
      data: { step: "find_objects", status: "done" },
    });
    const segments = frames.filter(
      (f) => f.event === "progress" && f.data.step === "segment",
    );
    expect(segments.length).toBeGreaterThan(0);
    expect(segments[segments.length - 1].data).toMatchObject({
      status: "done",
      total: segments.length,
    });
    expect(frames[frames.length - 2]).toEqual({
      event: "progress",
      data: { step: "design_level", status: "done" },
    });
    expect(frames[frames.length - 1].event).toBe("complete");
  } finally {
    if (saved !== undefined) {
      env.MOCK_MODE = saved;
    } else {
      delete env.MOCK_MODE;
    }
  }
});
