import Link from "next/link";
import { notFound } from "next/navigation";
import GameViewLoader from "@/components/GameViewLoader";
import { validateLevel } from "@/lib/level";
import level1 from "../../../fixtures/level-1.json";
import level2 from "../../../fixtures/level-2.json";
import level3 from "../../../fixtures/level-3.json";

const FIXTURES = [level1, level2, level3];

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>;
}) {
  const { fixture } = await searchParams;
  const index = Number(fixture ?? "0");
  const raw = Number.isInteger(index) ? FIXTURES[index] : undefined;
  if (!raw) {
    notFound();
  }
  const result = validateLevel(raw);
  if (!result.ok) {
    notFound();
  }

  return (
    <main className="flex h-dvh flex-col items-center gap-2 overflow-hidden bg-slate-950 px-4 py-3 text-slate-100">
      <div className="flex w-full max-w-5xl items-center justify-between">
        <h1 className="text-lg font-semibold">Snaplevel</h1>
        <nav className="flex touch-manipulation items-center gap-3 text-sm select-none [-webkit-touch-callout:none]">
          {["Workbench", "Living Room", "Patio"].map((name, n) => (
            <Link
              key={n}
              href={`/play?fixture=${n}`}
              className={`inline-flex min-h-[44px] touch-manipulation items-center rounded-full px-3 py-1 whitespace-nowrap ${
                n === index
                  ? "bg-slate-100 font-medium text-slate-950"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {name}
            </Link>
          ))}
        </nav>
      </div>
      <GameViewLoader level={result.level} />
    </main>
  );
}
