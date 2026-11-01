"use client";

import { useEffect } from "react";
import {
  holdDown,
  queueJump,
  releasePointer,
  releaseTouch,
  type HoldFlag,
} from "@/game/touchInput";

const BUTTON =
  "flex h-16 w-16 touch-none items-center justify-center rounded-full bg-slate-800/80 text-2xl text-slate-100 select-none active:bg-slate-600 [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]";

/** Capture the pointer so a drifting finger (or a second touch) keeps
 * delivering to this button instead of firing leave. Synthetic events
 * have no active pointer, so capture failure is ignored. */
function capture(event: React.PointerEvent): void {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // ignore: no active pointer (synthetic event)
  }
}

function hold(flag: HoldFlag) {
  return {
    onPointerDown: (event: React.PointerEvent) => {
      event.preventDefault();
      capture(event);
      holdDown(flag, event.pointerId);
    },
    onPointerUp: (event: React.PointerEvent) => {
      releasePointer(event.pointerId);
    },
    onPointerCancel: (event: React.PointerEvent) => {
      releasePointer(event.pointerId);
    },
    onPointerLeave: (event: React.PointerEvent) => {
      releasePointer(event.pointerId);
    },
  };
}

/**
 * Touch controls, coarse pointers only. Each pointer owns its button's
 * flag, so holding Right while tapping Jump works (multi-touch). Held
 * flags drive the same per-frame poll as the keyboard; Jump queues one
 * frame-guaranteed hop. Never stuck: each pointer's up/cancel/leave
 * releases only its own flag, and global exits release everything.
 */
export default function TouchControls({ onRestart }: { onRestart: () => void }) {
  useEffect(() => {
    const release = () => releaseTouch();
    const onVisibility = () => {
      if (document.hidden) {
        releaseTouch();
      }
    };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVisibility);
      releaseTouch();
    };
  }, []);

  return (
    <div
      className="hidden w-full pb-[env(safe-area-inset-bottom)] [@media(pointer:coarse)]:flex [@media(pointer:coarse)]:items-center [@media(pointer:coarse)]:justify-between"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex gap-3">
        <button type="button" aria-label="Move left" className={BUTTON} {...hold("left")}>
          ◀
        </button>
        <button type="button" aria-label="Move right" className={BUTTON} {...hold("right")}>
          ▶
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Restart level"
          onClick={onRestart}
          className="flex h-12 w-12 touch-none items-center justify-center rounded-full bg-slate-800/80 text-xl text-slate-100 select-none active:bg-slate-600 [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]"
        >
          ⟳
        </button>
        <button
          type="button"
          aria-label="Jump"
          className={`${BUTTON} h-20 w-20 font-bold`}
          onPointerDown={(event) => {
            event.preventDefault();
            capture(event);
            queueJump();
          }}
          onPointerUp={(event) => {
            releasePointer(event.pointerId);
          }}
          onPointerCancel={(event) => {
            releasePointer(event.pointerId);
          }}
          onPointerLeave={(event) => {
            releasePointer(event.pointerId);
          }}
        >
          ▲
        </button>
      </div>
    </div>
  );
}
