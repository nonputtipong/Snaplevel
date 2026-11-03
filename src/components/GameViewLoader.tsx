"use client";

import dynamic from "next/dynamic";
import type { Level } from "@/lib/level";

const GameView = dynamic(() => import("./GameView"), {
  ssr: false,
  loading: () => <p className="text-slate-400">Loading game…</p>,
});

export default function GameViewLoader({
  level,
  onNewPhoto,
}: {
  level: Level;
  onNewPhoto?: () => void;
}) {
  return <GameView level={level} onNewPhoto={onNewPhoto} />;
}
