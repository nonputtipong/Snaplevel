"use client";

import { useEffect, useState } from "react";
import type { MaskMatch, SegmentPhraseResult } from "@/lib/pipeline/segment";
import { resizeImage } from "@/lib/image";

const COLORS = [
  "#ff3b30",
  "#34c759",
  "#007aff",
  "#ffcc00",
  "#af52de",
  "#ff9500",
  "#5ac8fa",
  "#ff2d55",
];

interface Props {
  photos: string[];
  photo: string;
  imageDataUrl: string;
}

function MatchShape({
  match,
  color,
  showOrigin,
  label,
}: {
  match: MaskMatch;
  color: string;
  showOrigin: boolean;
  label: string;
}) {
  const [x1, y1, x2, y2] = match.box;
  return (
    <g>
      {showOrigin && (
        <path
          d={match.svgPath}
          fill="none"
          stroke="white"
          strokeWidth={2}
          strokeDasharray="6 4"
          opacity={0.9}
        />
      )}
      <g transform={`translate(${x1} ${y1})`}>
        <path d={match.svgPath} fill={color} fillOpacity={0.45} stroke={color} strokeWidth={2} />
      </g>
      <rect
        x={x1}
        y={y1}
        width={x2 - x1}
        height={y2 - y1}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <text x={x1} y={Math.max(12, y1 - 4)} fill={color} fontSize={14} fontWeight="bold">
        {label}
      </text>
    </g>
  );
}

export function MasksClient({ photos, photo, imageDataUrl }: Props) {
  const [phrases, setPhrases] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<SegmentPhraseResult[] | null>(null);
  const [totalMs, setTotalMs] = useState(0);
  const [showOrigin, setShowOrigin] = useState(true);
  const [sized, setSized] = useState<{ url: string; width: number; height: number } | null>(null);

  // Downscale to the same max-1024 JPEG the upload flow sends, so the overlay
  // verifies the exact pixels SAM sees.
  useEffect(() => {
    if (!imageDataUrl) {
      return;
    }
    let cancelled = false;
    setSized(null);
    setResults(null);
    (async () => {
      const blob = await (await fetch(imageDataUrl)).blob();
      const resized = await resizeImage(blob);
      const bitmap = await createImageBitmap(resized);
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error("Could not read the photo."));
        reader.readAsDataURL(resized);
      });
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      if (!cancelled) {
        setSized({ url, width, height });
      }
    })().catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [imageDataUrl]);

  async function run() {
    const list = phrases
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (list.length === 0 || !sized) {
      return;
    }
    setRunning(true);
    setError("");
    setResults(null);
    const started = Date.now();
    try {
      const res = await fetch("/api/debug/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: sized.url,
          phrases: list,
          width: sized.width,
          height: sized.height,
        }),
      });
      const body = (await res.json()) as { results?: SegmentPhraseResult[]; error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `Request failed with status ${res.status}.`);
      }
      setTotalMs(Date.now() - started);
      setResults(body.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-4">
      <h1 className="text-xl font-bold">SAM mask overlay (local debug)</h1>
      <div className="mt-2 flex flex-wrap gap-2">
        {photos.map((name) => (
          <a
            key={name}
            href={`?photo=${encodeURIComponent(name)}`}
            className={`rounded border px-2 py-1 text-sm ${name === photo ? "bg-black text-white" : ""}`}
          >
            {name}
          </a>
        ))}
      </div>
      {sized && (
        <div className="mt-4">
          <div className="relative">
            <img src={sized.url} alt={photo} className="block w-full" />
            {results && (
              <svg
                viewBox={`0 0 ${sized.width} ${sized.height}`}
                className="absolute inset-0 h-full w-full"
              >
                {results.map((result, index) =>
                  result.kept ? (
                    <MatchShape
                      key={result.phrase}
                      match={result.kept}
                      color={COLORS[index % COLORS.length]}
                      showOrigin={showOrigin}
                      label={`${index + 1}. ${result.phrase}`}
                    />
                  ) : null,
                )}
              </svg>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {sized.width}×{sized.height} px sent to SAM
          </p>
        </div>
      )}
      <div className="mt-4 flex flex-col gap-2">
        <label className="text-sm font-semibold">
          Phrases (one per line, max 8)
          <textarea
            value={phrases}
            onChange={(event) => setPhrases(event.target.value)}
            rows={4}
            placeholder={"wooden desk\nceramic mug"}
            className="mt-1 block w-full rounded border p-2 font-normal"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showOrigin}
            onChange={(event) => setShowOrigin(event.target.checked)}
          />
          Show origin-placed outlines (dashed white) to test the offset
        </label>
        <button
          onClick={run}
          disabled={running || phrases.trim().length === 0}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {running ? "Segmenting…" : "Segment"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      {results && (
        <div className="mt-4">
          <p className="text-sm font-semibold">Total wall time: {totalMs} ms</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {results.map((result, index) => (
              <li key={result.phrase}>
                <span
                  className="mr-2 inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                {result.phrase}: {result.latencyMs} ms, {result.matches.length} match(es)
                {result.kept
                  ? `, kept area ${result.kept.area} px`
                  : result.matches.length > 0
                    ? ", all dropped under 1%"
                    : ", zero matches (skipped)"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
