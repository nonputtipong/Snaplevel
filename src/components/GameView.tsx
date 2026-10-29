"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as Phaser from "phaser";
import type { Level } from "@/lib/level";
import { LevelScene } from "@/game/LevelScene";

export default function GameView({ level }: { level: Level }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<LevelScene | null>(null);
  const [won, setWon] = useState(false);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }
    const scene = new LevelScene(level, { onWin: () => setWon(true) });
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: level.width,
      height: level.height,
      backgroundColor: "#0f172a",
      physics: {
        default: "matter",
        matter: { gravity: { x: 0, y: 1 } },
      },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [scene],
      disableContextMenu: true,
    });
    return () => {
      game.destroy(true);
      sceneRef.current = null;
    };
  }, [level]);

  const playAgain = () => {
    setWon(false);
    sceneRef.current?.restartLevel();
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2">
      <div ref={hostRef} className="relative flex min-h-0 w-full flex-1 items-center justify-center [&>canvas]:rounded-lg" />
      {won && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-4 rounded-xl bg-slate-900 px-10 py-8 shadow-xl">
            <p className="text-2xl font-semibold text-slate-100">You win!</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={playAgain}
                className="rounded-full bg-emerald-500 px-5 py-2 font-medium text-slate-950 hover:bg-emerald-400"
              >
                Play again
              </button>
              <Link
                href="/"
                className="rounded-full border border-slate-600 px-5 py-2 font-medium text-slate-100 hover:bg-slate-800"
              >
                New photo
              </Link>
            </div>
          </div>
        </div>
      )}
      <p className="text-sm text-slate-400">
        Arrows / A move · Space / W jump · R restart · D outlines
      </p>
    </div>
  );
}
