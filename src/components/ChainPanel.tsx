"use client";

import type { Level, LevelObject } from "@/lib/level";
import { roleToBodyOptions } from "@/game/roles";
import { cssColor, timingRows } from "@/lib/chainView";

function roleColor(object: LevelObject): string {
  return cssColor(roleToBodyOptions(object.role).debugColor);
}

function ObjectRow({ object }: { object: LevelObject }) {
  const color = roleColor(object);
  return (
    <li className="flex items-start gap-2 py-1">
      <span
        aria-hidden
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0">
        <p className="text-sm text-slate-100">
          {object.label}{" "}
          <span className="text-slate-400">· “{object.phrase}”</span>{" "}
          <span className="font-medium" style={{ color }}>
            {object.role}
          </span>
        </p>
        <p className="text-xs text-slate-400">{object.reason}</p>
      </div>
    </li>
  );
}

export default function ChainPanel({
  level,
  onClose,
}: {
  level: Level;
  onClose: () => void;
}) {
  const timings = timingRows(level);
  return (
    <div
      role="dialog"
      aria-label="Model chain"
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 px-4 py-4 select-text [-webkit-touch-callout:default]"
      onContextMenu={(event) => event.stopPropagation()}
    >
      <div className="flex max-h-[85dvh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">How this level was made</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close model chain"
            className="inline-flex min-h-[44px] touch-manipulation items-center rounded-full bg-slate-800 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-700"
          >
            ✕ Close
          </button>
        </div>

        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-100">Original photo</h3>
          <img src={level.image} alt="Original photo" className="w-full rounded-lg" />
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-100">
            Objects found <span className="font-normal text-slate-400">· Muse Spark (vision + structure)</span>
          </h3>
          {level.objects.length === 0 ? (
            <p className="text-sm text-slate-400">No objects — generated layout.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {level.objects.map((object) => (
                <ObjectRow key={object.id} object={object} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-100">
            Masks <span className="font-normal text-slate-400">· SAM 3.1 (masks)</span>
          </h3>
          <div className="relative w-full">
            <img src={level.image} alt="Masks overlaid on the photo" className="w-full rounded-lg" />
            <svg
              viewBox={`0 0 ${level.width} ${level.height}`}
              className="absolute inset-0 h-full w-full"
              aria-hidden
            >
              {level.objects.map((object) =>
                object.parts.map((part, i) => (
                  <polygon
                    key={`${object.id}-${i}`}
                    points={part.map(([x, y]) => `${x},${y}`).join(" ")}
                    fill={roleColor(object)}
                    fillOpacity={0.45}
                    stroke={roleColor(object)}
                    strokeWidth={2}
                  />
                )),
              )}
            </svg>
          </div>
        </section>

        {level.restyledImage && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-slate-100">Restyled</h3>
            <img src={level.restyledImage} alt="Restyled level art" className="w-full rounded-lg" />
          </section>
        )}

        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-100">Step timings</h3>
          {timings.length === 0 ? (
            <p className="text-sm text-slate-400">No timings recorded.</p>
          ) : (
            <dl className="text-sm">
              {timings.map((row) => (
                <div key={row.label} className="flex justify-between gap-4 py-0.5">
                  <dt className="text-slate-400">{row.label}</dt>
                  <dd className="font-medium text-slate-100 tabular-nums">{row.text}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {level.notes && level.notes.length > 0 && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-slate-100">Notes</h3>
            <ul className="list-disc pl-5 text-xs text-slate-400">
              {level.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-xs text-slate-500">Played with Phaser + Matter (game).</p>
      </div>
    </div>
  );
}
