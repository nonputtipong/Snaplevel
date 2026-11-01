"use client";

import { useRef, useState } from "react";
import GameViewLoader from "./GameViewLoader";
import { checkUpload, makeSamplePhoto, resizeImage } from "@/lib/image";
import {
  SAMPLE_FIXTURE_NOTE,
  getBuildOutcome,
  postBuildLevel,
  sampleMode,
  type ProgressEvent,
} from "@/lib/buildClient";
import type { Level } from "@/lib/level";

type State =
  | { name: "idle" }
  | { name: "resizing" }
  | { name: "building"; progress: ProgressEvent | null }
  | { name: "done"; level: Level; notes: string[] }
  | { name: "rejected"; message: string }
  | { name: "failed"; message: string }
  | { name: "empty" };

const STEP_ORDER = ["find_objects", "segment", "design_level"];

function stepLabel(progress: ProgressEvent | null, step: string): string {
  if (step === "find_objects") return "Finding objects";
  if (step === "design_level") return "Designing the level";
  if (progress && progress.step === "segment" && progress.total) {
    return `Outlining objects (${progress.current}/${progress.total})`;
  }
  return "Outlining objects";
}

export default function UploadFlow({
  mockMode,
  sampleLevel,
}: {
  mockMode: boolean;
  sampleLevel: Level | null;
}) {
  const [state, setState] = useState<State>({ name: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => setState({ name: "idle" });

  const runPipeline = async (photo: Blob) => {
    setState({ name: "resizing" });
    try {
      const resized = await resizeImage(photo);
      setState({ name: "building", progress: null });
      let lastNotes: string[] = [];
      const level = await postBuildLevel(resized, (progress) => {
        if (progress.notes) {
          lastNotes = progress.notes;
        }
        setState({ name: "building", progress });
      });
      if (getBuildOutcome(level) === "empty") {
        setState({ name: "empty" });
      } else {
        setState({ name: "done", level, notes: lastNotes });
      }
    } catch (error) {
      setState({
        name: "failed",
        message:
          error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) {
      return;
    }
    const rejection = checkUpload(file);
    if (rejection) {
      setState({ name: "rejected", message: rejection });
      return;
    }
    void runPipeline(file);
  };

  const onSample = async () => {
    if (sampleMode(mockMode) === "fixture" && sampleLevel) {
      setState({ name: "done", level: sampleLevel, notes: [SAMPLE_FIXTURE_NOTE] });
      return;
    }
    void runPipeline(await makeSamplePhoto());
  };

  if (state.name === "done") {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <GameViewLoader level={state.level} />
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-slate-600 px-5 py-2 font-medium text-slate-100 hover:bg-slate-800"
        >
          New photo
        </button>
        {state.notes.map((note) => (
          <p key={note} className="text-sm text-slate-400">
            {note}
          </p>
        ))}
      </div>
    );
  }

  if (
    state.name === "rejected" ||
    state.name === "failed" ||
    state.name === "empty"
  ) {
    const copy =
      state.name === "rejected"
        ? { title: "That file won't work", message: state.message }
        : state.name === "failed"
          ? {
              title: "The level couldn't be built",
              message: `${state.message} Please try again.`,
            }
          : {
              title: "No game objects found",
              message:
                "Nothing in that photo could become a platform. Try a busier photo with a few solid objects.",
            };
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl bg-slate-900 px-8 py-8 text-center">
        <p className="text-xl font-semibold text-slate-100">{copy.title}</p>
        <p className="text-slate-300">{copy.message}</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-slate-100 px-5 py-2 font-medium text-slate-950 hover:bg-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state.name === "resizing" || state.name === "building") {
    const progress = state.name === "building" ? state.progress : null;
    const activeIndex =
      state.name === "resizing"
        ? 0
        : progress
          ? STEP_ORDER.indexOf(progress.step)
          : -1;
    return (
      <div className="flex w-full max-w-md flex-col gap-3 rounded-xl bg-slate-900 px-8 py-8">
        {STEP_ORDER.map((step, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <div key={step} className="flex items-center gap-3">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  done
                    ? "bg-emerald-400"
                    : active
                      ? "animate-pulse bg-slate-100"
                      : "bg-slate-700"
                }`}
              />
              <p className={done || active ? "text-slate-100" : "text-slate-500"}>
                {stepLabel(progress, step)}
              </p>
            </div>
          );
        })}
        {progress?.notes?.map((note) => (
          <p key={note} className="text-sm text-slate-400">
            {note}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-full bg-slate-100 px-8 py-4 text-lg font-semibold text-slate-950 hover:bg-white"
      >
        Upload or take a photo
      </button>
      {(mockMode || sampleLevel) && (
        <button
          type="button"
          onClick={() => void onSample()}
          className="text-sm text-slate-300 underline underline-offset-4 hover:text-white"
        >
          Try a sample photo
        </button>
      )}
    </div>
  );
}
