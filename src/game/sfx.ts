/** Code-generated sound effects: WebAudio oscillator tones, no audio files.
 * Default off; enabling requires a user gesture, which also satisfies the
 * autoplay policy for the lazily created AudioContext. */

export type SfxName = "jump" | "bounce" | "respawn" | "win";

let enabled = false;
let context: AudioContext | null = null;

export function setSfxEnabled(value: boolean): void {
  enabled = value;
  if (value) {
    ensureContext();
  }
}

export function isSfxEnabled(): boolean {
  return enabled;
}

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  const ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!ctor) {
    return null;
  }
  context ??= new ctor();
  if (context.state === "suspended") {
    void context.resume();
  }
  return context;
}

function tone(
  ac: AudioContext,
  type: OscillatorType,
  fromHz: number,
  toHz: number,
  seconds: number,
  delaySeconds = 0,
): void {
  const start = ac.currentTime + delaySeconds;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fromHz, start);
  osc.frequency.exponentialRampToValueAtTime(toHz, start + seconds);
  gain.gain.setValueAtTime(0.08, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + seconds + 0.02);
}

export function playSfx(name: SfxName): void {
  if (!enabled) {
    return;
  }
  const ac = ensureContext();
  if (!ac) {
    return;
  }
  switch (name) {
    case "jump":
      tone(ac, "square", 300, 620, 0.12);
      break;
    case "bounce":
      tone(ac, "sine", 220, 110, 0.15);
      break;
    case "respawn":
      tone(ac, "sawtooth", 420, 90, 0.25);
      break;
    case "win":
      tone(ac, "sine", 523, 523, 0.14, 0);
      tone(ac, "sine", 659, 659, 0.14, 0.12);
      tone(ac, "sine", 784, 784, 0.22, 0.24);
      break;
  }
}
