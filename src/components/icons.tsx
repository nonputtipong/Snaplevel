/** One hand-written inline-SVG icon set: 24px grid, 2px stroke. */

import type { ReactNode } from "react";

function Base({
  children,
  size = 18,
  filled = false,
  label,
}: {
  children: ReactNode;
  size?: number;
  filled?: boolean;
  label: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export function RestartIcon({ size }: { size?: number }) {
  return (
    <Base size={size} label="Restart">
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </Base>
  );
}

export function PlusIcon({ size }: { size?: number }) {
  return (
    <Base size={size} label="New">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </Base>
  );
}

export function OutlinesIcon({ size }: { size?: number }) {
  return (
    <Base size={size} label="Outlines">
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </Base>
  );
}

export function ChainIcon({ size }: { size?: number }) {
  return (
    <Base size={size} label="Model chain">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Base>
  );
}

export function SoundOnIcon({ size }: { size?: number }) {
  return (
    <Base size={size} label="Sound on">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </Base>
  );
}

export function SoundOffIcon({ size }: { size?: number }) {
  return (
    <Base size={size} label="Sound off">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="m22 9-6 6" />
      <path d="m16 9 6 6" />
    </Base>
  );
}

export function LeftIcon({ size }: { size?: number }) {
  return (
    <Base size={size} label="Left">
      <path d="m15 18-6-6 6-6" />
    </Base>
  );
}

export function RightIcon({ size }: { size?: number }) {
  return (
    <Base size={size} label="Right">
      <path d="m9 18 6-6-6-6" />
    </Base>
  );
}

export function JumpIcon({ size }: { size?: number }) {
  return (
    <Base size={size} label="Jump">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </Base>
  );
}

export function CloseIcon({ size }: { size?: number }) {
  return (
    <Base size={size} label="Close">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Base>
  );
}

export function TrophyIcon({ size }: { size?: number }) {
  return (
    <Base size={size} label="Trophy">
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
      <path d="M8 5H4a1 1 0 0 0-1 1c0 2.5 2 4 5 4" />
      <path d="M16 5h4a1 1 0 0 1 1 1c0 2.5-2 4-5 4" />
      <path d="M12 13v4" />
      <path d="M8 21h8" />
      <path d="M10 17h4" />
    </Base>
  );
}

export function PlayIcon({ size }: { size?: number }) {
  return (
    <Base size={size} filled label="Play">
      <path d="M7 4.5v15l13-7.5-13-7.5z" />
    </Base>
  );
}

export function CameraIcon({ size }: { size?: number }) {
  return (
    <Base size={size} label="Camera">
      <path d="M8 7l1.5-3h5L16 7" />
      <rect x="2" y="7" width="20" height="13" rx="3" />
      <circle cx="12" cy="13.5" r="3.5" />
    </Base>
  );
}
