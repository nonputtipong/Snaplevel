"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as Phaser from "phaser";
import type { Level } from "@/lib/level";
import { LevelScene } from "@/game/LevelScene";
import { GRAVITY_Y } from "@/game/physics";
import { isSfxEnabled, setSfxEnabled } from "@/game/sfx";
import ChainPanel from "./ChainPanel";
import TouchControls from "./TouchControls";
import {
  ChainIcon,
  OutlinesIcon,
  PlusIcon,
  RestartIcon,
  SoundOffIcon,
  SoundOnIcon,
  TrophyIcon,
} from "./icons";

const CONFETTI = [
  { left: "18%", delay: "0ms", color: "bg-teal-400" },
  { left: "26%", delay: "120ms", color: "bg-cyan-300" },
  { left: "34%", delay: "60ms", color: "bg-emerald-400" },
  { left: "42%", delay: "200ms", color: "bg-amber-300" },
  { left: "50%", delay: "0ms", color: "bg-teal-300" },
  { left: "58%", delay: "150ms", color: "bg-cyan-400" },
  { left: "66%", delay: "80ms", color: "bg-emerald-300" },
  { left: "74%", delay: "220ms", color: "bg-teal-400" },
  { left: "82%", delay: "40ms", color: "bg-amber-200" },
  { left: "30%", delay: "260ms", color: "bg-cyan-200" },
  { left: "54%", delay: "300ms", color: "bg-teal-200" },
  { left: "70%", delay: "320ms", color: "bg-emerald-200" },
];

const HUD_BUTTON =
  "inline-flex min-h-[44px] touch-manipulation items-center justify-center gap-1.5 rounded-full bg-slate-800/80 px-3 py-1.5 text-sm text-slate-100 transition-all duration-150 select-none hover:bg-slate-700 motion-safe:hover:-translate-y-0.5 active:bg-slate-600 motion-safe:active:translate-y-0 motion-safe:active:scale-95";

export default function GameView({
  level,
  onNewPhoto,
}: {
  level: Level;
  /** When set, New photo controls reset the embedding flow instead of
   * linking home (same-URL links are a no-op inside UploadFlow). */
  onNewPhoto?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<LevelScene | null>(null);
  const [won, setWon] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [showChain, setShowChain] = useState(false);
  const [chainClosing, setChainClosing] = useState(false);
  const chainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (chainTimer.current) {
        clearTimeout(chainTimer.current);
      }
    };
  }, []);

  const closeChain = () => {
    setChainClosing(true);
    chainTimer.current = setTimeout(() => {
      setShowChain(false);
      setChainClosing(false);
    }, 150);
  };

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
    <div
      className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 select-none [-webkit-user-select:none] [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={playAgain}
          title="Restart (R)"
          aria-label="Restart level"
          className={HUD_BUTTON}
        >
          <RestartIcon /> Restart
        </button>
        {onNewPhoto ? (
          <button
            type="button"
            onClick={onNewPhoto}
            title="Back to upload a new photo"
            aria-label="New photo"
            className={HUD_BUTTON}
          >
            <PlusIcon /> New photo
          </button>
        ) : (
          <Link
            href="/"
            title="Back to upload a new photo"
            aria-label="New photo"
            className={HUD_BUTTON}
          >
            <PlusIcon /> New photo
          </Link>
        )}
        <button
          type="button"
          onClick={() => sceneRef.current?.toggleOutlines()}
          title="Toggle role outlines (D)"
          aria-label="Toggle outlines"
          className={HUD_BUTTON}
        >
          <OutlinesIcon /> Outlines
        </button>
        <button
          type="button"
          onClick={() => (showChain ? closeChain() : setShowChain(true))}
          title="Show how this level was made"
          aria-label="Toggle model chain"
          aria-pressed={showChain}
          className={HUD_BUTTON}
        >
          <ChainIcon /> Chain
        </button>
        <button
          type="button"
          onClick={toggleSound}
          title={soundOn ? "Mute sound" : "Unmute sound"}
          aria-label={soundOn ? "Mute sound" : "Unmute sound"}
          aria-pressed={soundOn}
          className={HUD_BUTTON}
        >
          {soundOn ? <SoundOnIcon /> : <SoundOffIcon />} Sound
        </button>
      </div>
      <div ref={hostRef} className="relative flex min-h-0 w-full flex-1 touch-none items-center justify-center select-none [&>canvas]:rounded-lg" />
      {won && (
        <div className="fixed inset-0 z-20 flex items-center justify-center overflow-hidden bg-black/60 px-4">
          {CONFETTI.map((piece, i) => (
            <span
              key={i}
              aria-hidden
              className={`anim-fall absolute top-1/4 h-2 w-2 rounded-sm ${piece.color}`}
              style={{ left: piece.left, animationDelay: piece.delay }}
            />
          ))}
          <div className="anim-pop flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-emerald-500/30 bg-slate-900 px-8 py-8 text-center shadow-xl">
            <p className="text-teal-400">
              <TrophyIcon size={44} />
            </p>
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
              {onNewPhoto ? (
                <button
                  type="button"
                  onClick={onNewPhoto}
                  aria-label="New photo"
                  className="inline-flex min-h-[44px] touch-manipulation items-center rounded-full border border-slate-600 px-5 py-2 font-medium text-slate-100 hover:bg-slate-800"
                >
                  New photo
                </button>
              ) : (
                <Link
                  href="/"
                  aria-label="New photo"
                  className="inline-flex min-h-[44px] touch-manipulation items-center rounded-full border border-slate-600 px-5 py-2 font-medium text-slate-100 hover:bg-slate-800"
                >
                  New photo
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
      {showChain && (
        <ChainPanel
          level={level}
          closing={chainClosing}
          onClose={closeChain}
        />
      )}
      <TouchControls onRestart={playAgain} />
      <p className="hidden w-full text-center text-xs text-slate-500 [@media(pointer:fine)]:block">
        ← → / A move · Space / W jump · R restart · D outlines
      </p>
      {level.hint && <p className="text-sm text-amber-200">{level.hint}</p>}
    </div>
  );
}
