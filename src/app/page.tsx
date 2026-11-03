import Link from "next/link";
import AuroraBackground from "@/components/AuroraBackground";
import UploadFlow from "@/components/UploadFlow";
import { CameraIcon, PlayIcon } from "@/components/icons";
import { validateLevel } from "@/lib/level";
import level1 from "../../fixtures/level-1.json";
import level2 from "../../fixtures/level-2.json";
import level3 from "../../fixtures/level-3.json";

const EXAMPLES = [
  { index: 0, title: "Workbench", raw: level1 },
  { index: 1, title: "Living Room", raw: level2 },
  { index: 2, title: "Patio", raw: level3 },
];

export default function Home() {
  const examples = EXAMPLES.flatMap(({ index, title, raw }) => {
    const result = validateLevel(raw);
    return result.ok ? [{ index, title, level: result.level }] : [];
  });

  return (
    <main className="flex min-h-dvh flex-col items-center gap-8 px-4 py-10 text-slate-100 sm:gap-10">
      <AuroraBackground />
      <div className="anim-rise flex max-w-2xl flex-col items-center gap-3 text-center sm:gap-4">
        <p className="text-teal-400">
          <CameraIcon size={56} />
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Snaplevel
        </h1>
        <p className="text-lg text-slate-300">
          Snap a photo of anything and play it as{" "}
          <span className="font-semibold text-teal-300">a game level</span>.
        </p>
      </div>

      <div className="anim-rise flex w-full flex-col items-center" style={{ animationDelay: "80ms" }}>
        <UploadFlow
          mockMode={process.env.MOCK_MODE === "1"}
          sampleLevel={examples[0]?.level ?? null}
        />
      </div>

      <p className="max-w-md text-center text-sm text-slate-400">
        Your photo is processed by Meta&apos;s models to build the level. We
        don&apos;t store it.
      </p>

      <div className="anim-rise flex w-full max-w-4xl flex-col gap-4" style={{ animationDelay: "160ms" }}>
        <h2 className="text-xl font-semibold">Play an example level</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {examples.map(({ index, title, level }) => (
            <Link
              key={index}
              href={`/play?fixture=${index}`}
              className="overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-slate-800 transition-all duration-200 touch-manipulation motion-safe:hover:-translate-y-1 hover:bg-slate-800 hover:shadow-xl hover:shadow-teal-500/10 hover:ring-teal-500/50 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98]"
            >
              <img
                src={level.image}
                alt={`${title} example level`}
                className="h-40 w-full object-cover"
              />
              <p className="flex items-center gap-1.5 px-4 py-3 font-medium">
                {title}{" "}
                <span className="inline-flex items-center gap-1 text-sm text-slate-400">
                  <PlayIcon size={14} /> Play
                </span>
              </p>
            </Link>
          ))}
        </div>
      </div>

      <ol className="anim-rise flex w-full max-w-4xl flex-col gap-2 text-sm text-slate-400 sm:flex-row sm:gap-6" style={{ animationDelay: "240ms" }}>
        {[
          ["1", "Snap a photo of any desk, room, or street."],
          ["2", "Muse Spark and SAM 3.1 turn objects into platforms."],
          ["3", "Play it instantly — run, jump, reach the goal."],
        ].map(([n, text]) => (
          <li key={n} className="flex flex-1 items-start gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-xs font-bold text-teal-300">
              {n}
            </span>
            {text}
          </li>
        ))}
      </ol>
    </main>
  );
}
