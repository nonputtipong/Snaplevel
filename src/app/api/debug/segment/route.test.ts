import { expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { POST } from "./route";

function postProduction(): Promise<Response> {
  const env = process.env as Record<string, string | undefined>;
  const saved = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    return POST(
      new NextRequest("http://localhost/api/debug/segment", { method: "POST" }),
    );
  } finally {
    if (saved === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = saved;
    }
  }
}

test("debug segment route 404s in production", async () => {
  const res = await postProduction();
  expect(res.status).toBe(404);
});

test("debug segment route is live outside production", async () => {
  const res = await POST(
    new NextRequest("http://localhost/api/debug/segment", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  );
  // Bad body reaches validation (400), not the production guard (404).
  expect(res.status).toBe(400);
});
