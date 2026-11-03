"use client";

import { useEffect, useState } from "react";
import { jumpSnapshot, onJumpEvent } from "@/game/jumpInput";
import { onRescue, onRescueEnd } from "@/game/rescue";
import { onTouchClear, touchInput } from "@/game/touchInput";

interface Entry {
  t: number;
  type: string;
  id: string;
  target: string;
}

function labelOf(target: EventTarget | null): string {
  if (!(target instanceof Element)) {
    return "?";
  }
  const name =
    target.getAttribute("aria-label") ||
    (target.textContent ?? "").trim().slice(0, 18);
  return `${target.tagName}${name ? `:${name}` : ""}`;
}

const MAX_ENTRIES = 25;

/** Branch-only input logger (?debug=1). Never merge to main. */
export default function InputLogger() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cancels, setCancels] = useState({ pointer: 0, touch: 0 });
  const [selection, setSelection] = useState({ len: 0, from: "-" });
  const [latency, setLatency] = useState<Record<string, number>>({});

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("debug") !== "1") {
      return;
    }
    setEnabled(true);
    const downs = new Map<string, number>();
    const push = (type: string, id: string, target: string) => {
      const entry = { t: Math.round(performance.now()), type, id, target };
      setEntries((prev) => [...prev.slice(-MAX_ENTRIES + 1), entry]);
    };
    const onPointer = (event: PointerEvent) => {
      const label = labelOf(event.target);
      push(event.type, String(event.pointerId), label);
      if (event.type === "pointerdown") {
        downs.set(label, performance.now());
      } else if (event.type === "pointercancel") {
        setCancels((c) => ({ ...c, pointer: c.pointer + 1 }));
      }
    };
    const onTouch = (event: TouchEvent) => {
      const ids = [...event.changedTouches].map((t) => t.identifier).join(",");
      push(event.type, ids, labelOf(event.target));
      if (event.type === "touchcancel") {
        setCancels((c) => ({ ...c, touch: c.touch + 1 }));
      }
    };
    const onClick = (event: MouseEvent) => {
      const label = labelOf(event.target);
      const down = downs.get(label);
      if (down !== undefined) {
        setLatency((prev) => ({
          ...prev,
          [label]: Math.round(performance.now() - down),
        }));
      }
      push("click", "-", label);
    };
    const onSelection = () => {
      const sel = document.getSelection();
      const text = sel?.toString() ?? "";
      const anchor = sel?.anchorNode;
      const from =
        anchor instanceof Element
          ? anchor.tagName
          : (anchor?.parentElement?.tagName ?? "-");
      setSelection({ len: text.length, from });
      if (text.length > 0) {
        push("select", `${text.length}ch`, from);
      }
    };
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    for (const type of ["pointerdown", "pointerup", "pointercancel"]) {
      window.addEventListener(type, onPointer as EventListener, opts);
    }
    for (const type of ["touchstart", "touchend", "touchcancel"]) {
      window.addEventListener(type, onTouch as EventListener, opts);
    }
    window.addEventListener("click", onClick as EventListener, opts);
    document.addEventListener("selectionchange", onSelection);
    const unsubJump = onJumpEvent((event) => {
      push(
        `jump:${event.type}${event.reason ? `:${event.reason}` : ""}`,
        event.grounded ? "g" : "a",
        `${event.at}`,
      );
    });
    const unsubClear = onTouchClear((info) => {
      push("jump:hold-clear", info.scope, `${info.pointerId ?? "-"}`);
    });
    const unsubRescue = onRescue((info) => {
      push(
        `rescue:fire#${info.streak}`,
        `${info.x},${info.y}`,
        info.parts.join(",") || "-",
      );
    });
    const unsubRescueEnd = onRescueEnd((info) => {
      push("rescue:end", `${info.x},${info.y}`, `streak${info.streak}@${info.at}`);
    });
    const stateTimer = window.setInterval(() => {
      if (!touchInput.jumpHeld) {
        return;
      }
      const s = jumpSnapshot();
      if (!s) {
        return;
      }
      push(
        "jump:state",
        `${s.grounded ? "g" : "a"}${s.sleeping ? "Z" : ""}`,
        `vy${s.vy} y${s.y} ${s.held ? "h" : "!h"}${s.armed ? " armed" : ""} b${s.bufferMs} c${s.coyoteMs}`,
      );
    }, 250);
    const onCapture = (event: Event) => {
      push(event.type, "-", labelOf(event.target));
    };
    const onBlur = () => push("blur", "-", "-");
    const onVis = () => {
      if (document.hidden) {
        push("visibilitychange", "-", "hidden");
      }
    };
    window.addEventListener("pointerleave", onCapture as EventListener, true);
    window.addEventListener("lostpointercapture", onCapture as EventListener, true);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("contextmenu", onCapture as EventListener, opts);
    return () => {
      unsubJump();
      unsubClear();
      unsubRescue();
      unsubRescueEnd();
      window.clearInterval(stateTimer);
      window.removeEventListener("pointerleave", onCapture as EventListener, true);
      window.removeEventListener("lostpointercapture", onCapture as EventListener, true);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("contextmenu", onCapture as EventListener, opts);
      for (const type of ["pointerdown", "pointerup", "pointercancel"]) {
        window.removeEventListener(type, onPointer as EventListener, opts);
      }
      for (const type of ["touchstart", "touchend", "touchcancel"]) {
        window.removeEventListener(type, onTouch as EventListener, opts);
      }
      window.removeEventListener("click", onClick as EventListener, opts);
      document.removeEventListener("selectionchange", onSelection);
    };
  }, []);

  if (!enabled) {
    return null;
  }
  return (
    <div className="fixed top-1 right-1 z-30 max-w-[70vw] font-mono text-[10px] leading-tight text-lime-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded bg-black/70 px-3"
      >
        {open ? "− log" : "+ log"}
      </button>
      {open && (
        <div className="mt-1 max-h-[40dvh] overflow-y-auto rounded bg-black/70 p-2">
          <p>
            cancel p:{cancels.pointer} t:{cancels.touch} sel:{selection.len}ch
            @{selection.from}
          </p>
          {Object.entries(latency).map(([label, ms]) => (
            <p key={label}>
              {label}: {ms}ms
            </p>
          ))}
          {entries.map((e, i) => (
            <p key={`${e.t}-${i}`}>
              {e.t} {e.type} #{e.id} {e.target}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
