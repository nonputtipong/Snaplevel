"use client";

import { useEffect, useState } from "react";
import {
  holdDown,
  holdJump,
  releasePointer,
  releaseTouch,
  type HoldFlag,
} from "@/game/touchInput";

const BUTTON =
  "flex h-16 w-16 touch-none items-center justify-center rounded-full bg-slate-800/80 text-2xl text-slate-100 transition-transform duration-75 select-none active:bg-slate-600 [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]";

const PRESSED = "scale-90 brightness-150";

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

type Control = HoldFlag | "jump" | "restart";

/**
 * Touch controls, coarse pointers only. Each pointer owns its button's
 * flag, so holding Right while tapping Jump works (multi-touch). Held
 * flags drive the same per-frame poll as the keyboard; holding Jump
 * re-jumps on every landing. Never stuck: each pointer's up/cancel/leave
 * releases only its own flag, and global exits release everything.
 */
export default function TouchControls({ onRestart }: { onRestart: () => void }) {
  const [pressed, setPressed] = useState<Record<Control, boolean>>({
    left: false,
    right: false,
    jump: false,
    restart: false,
  });
  const set = (control: Control, value: boolean) => {
    setPressed((prev) => (prev[control] === value ? prev : { ...prev, [control]: value }));
  };

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

  function hold(flag: HoldFlag) {
    return {
      onPointerDown: (event: React.PointerEvent) => {
        event.preventDefault();
        capture(event);
        holdDown(flag, event.pointerId);
        set(flag, true);
      },
      onPointerUp: (event: React.PointerEvent) => {
        releasePointer(event.pointerId);
        set(flag, false);
      },
      onPointerCancel: (event: React.PointerEvent) => {
        releasePointer(event.pointerId);
        set(flag, false);
      },
      onPointerLeave: (event: React.PointerEvent) => {
        releasePointer(event.pointerId);
        set(flag, false);
      },
    };
  }

  return (
    <div
      className="hidden w-full pb-[env(safe-area-inset-bottom)] [@media(pointer:coarse)]:flex [@media(pointer:coarse)]:items-center [@media(pointer:coarse)]:justify-between"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex gap-3">
        <button
          type="button"
          aria-label="Move left"
          className={`${BUTTON} ${pressed.left ? PRESSED : ""}`}
          {...hold("left")}
        >
          ◀
        </button>
        <button
          type="button"
          aria-label="Move right"
          className={`${BUTTON} ${pressed.right ? PRESSED : ""}`}
          {...hold("right")}
        >
          ▶
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Restart level"
          onClick={onRestart}
          onPointerDown={() => set("restart", true)}
          onPointerUp={() => set("restart", false)}
          onPointerCancel={() => set("restart", false)}
          onPointerLeave={() => set("restart", false)}
          className={`flex h-12 w-12 touch-none items-center justify-center rounded-full bg-slate-800/80 text-xl text-slate-100 transition-transform duration-75 select-none active:bg-slate-600 [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] ${pressed.restart ? PRESSED : ""}`}
        >
          ⟳
        </button>
        <button
          type="button"
          aria-label="Jump"
          className={`${BUTTON} h-20 w-20 font-bold ${pressed.jump ? PRESSED : ""}`}
          onPointerDown={(event) => {
            event.preventDefault();
            capture(event);
            holdJump(event.pointerId);
            set("jump", true);
          }}
          onPointerUp={(event) => {
            releasePointer(event.pointerId);
            set("jump", false);
          }}
          onPointerCancel={(event) => {
            releasePointer(event.pointerId);
            set("jump", false);
          }}
          onPointerLeave={(event) => {
            releasePointer(event.pointerId);
            set("jump", false);
          }}
        >
          ▲
        </button>
      </div>
    </div>
  );
}
