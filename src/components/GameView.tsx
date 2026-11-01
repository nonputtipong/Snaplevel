"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as Phaser from "phaser";
import type { Level } from "@/lib/level";
import { LevelScene } from "@/game/LevelScene";
import { GRAVITY_Y } from "@/game/physics";
import { isSfxEnabled, setSfxEnabled } from "@/game/sfx";
import TouchControls from "./TouchControls";

const HUD_BUTTON =
  "rounded-full bg-slate-800/80 px-3 py-1.5 text-sm text-slate-100 select-none hover:bg-slate-700 active:bg-slate-600";

export default function GameView({ level }: { level: Level }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<LevelScene | null>(null);
  const [won, setWon] = useState(false);
  const [soundOn, setSoundOn] = useState(false);

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
        matter: { gravity: { x: 0, y: GRAVITY_Y } },
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

  const toggleSound = () => {
    const next = !isSfxEnabled();
    setSfxEnabled(next);
    setSoundOn(next);
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={playAgain}
          title="Restart (R)"
          aria-label="Restart level"
          className={HUD_BUTTON}
        >
          ⟳ Restart
        </button>
        <Link
          href="/"
          title="Back to upload a new photo"
          aria-label="New photo"
          className={HUD_BUTTON}
        >
          ＋ New photo
        </Link>
        <button
          type="button"
          onClick={() => sceneRef.current?.toggleOutlines()}
          title="Toggle role outlines (D)"
          aria-label="Toggle outlines"
          className={HUD_BUTTON}
        >
          ◇ Outlines
        </button>
        <button
          type="button"
          onClick={toggleSound}
          title={soundOn ? "Mute sound" : "Unmute sound"}
          aria-label={soundOn ? "Mute sound" : "Unmute sound"}
          aria-pressed={soundOn}
          className={HUD_BUTTON}
        >
          {soundOn ? "🔊 Sound" : "🔇 Sound"}
        </button>
      </div>
      <div ref={hostRef} className="relative flex min-h-0 w-full flex-1 touch-none items-center justify-center select-none [&>canvas]:rounded-lg" />
      {won && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 px-4">
          <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-emerald-500/30 bg-slate-900 px-8 py-8 text-center shadow-xl">
            <p className="text-4xl">🏆</p>
            <p className="text-2xl font-bold text-slate-100">You win!</p>
            <p className="text-sm text-slate-400">
              Snap another photo to play a new level.
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-3">
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
      <TouchControls onRestart={playAgain} />
      <p className="hidden text-xs text-slate-500 [@media(pointer:fine)]:block">
        ← → / A move · Space / W jump · R restart · D outlines
      </p>
      {level.hint && <p className="text-sm text-amber-200">{level.hint}</p>}
    </div>
  );
}
