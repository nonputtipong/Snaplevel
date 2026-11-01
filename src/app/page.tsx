import Link from "next/link";
import UploadFlow from "@/components/UploadFlow";
import { validateLevel } from "@/lib/level";
import level1 from "../../fixtures/level-1.json";
import level2 from "../../fixtures/level-2.json";
import level3 from "../../fixtures/level-3.json";

const EXAMPLES = [
  { index: 0, title: "Desk", raw: level1 },
  { index: 1, title: "Room", raw: level2 },
  { index: 2, title: "Street", raw: level3 },
];

export default function Home() {
  const examples = EXAMPLES.flatMap(({ index, title, raw }) => {
    const result = validateLevel(raw);
    return result.ok ? [{ index, title, level: result.level }] : [];
  });

  return (
    <main className="flex min-h-dvh flex-col items-center gap-8 bg-gradient-to-b from-slate-950 via-slate-950 to-emerald-950/40 px-4 py-10 text-slate-100 sm:gap-10">
      <div className="flex max-w-2xl flex-col items-center gap-3 text-center sm:gap-4">
        <p className="text-5xl">📸</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Snaplevel
        </h1>
        <p className="text-lg text-slate-300">
          Snap a photo of anything and play it as a game level.
        </p>
      </div>

      <UploadFlow
        mockMode={process.env.MOCK_MODE === "1"}
        sampleLevel={examples[0]?.level ?? null}
      />

      <p className="max-w-md text-center text-sm text-slate-400">
        Your photo is processed by Meta&apos;s models to build the level. We
        don&apos;t store it.
      </p>

      <div className="flex w-full max-w-4xl flex-col gap-4">
        <h2 className="text-xl font-semibold">Play an example level</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {examples.map(({ index, title, level }) => (
            <Link
              key={index}
              href={`/play?fixture=${index}`}
              className="overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-slate-800 hover:bg-slate-800 hover:ring-emerald-500/50"
            >
              <img
                src={level.image}
                alt={`${title} example level`}
                className="h-40 w-full object-cover"
              />
              <p className="px-4 py-3 font-medium">
                {title} <span className="text-slate-400">· Play</span>
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
