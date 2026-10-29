import type { Role } from "@/lib/level";

export interface BodyOptions {
  /** False for decor: drawn only, no physics body. */
  collides: boolean;
  /** True for hazards and the goal: overlap events without collision response. */
  isSensor: boolean;
  isStatic: boolean;
  restitution: number;
  friction: number;
  frictionStatic: number;
  /** Outline color for the debug view (0xRRGGBB). */
  debugColor: number;
}

export function roleToBodyOptions(role: Role): BodyOptions {
  switch (role) {
    case "platform":
      return {
        collides: true,
        isSensor: false,
        isStatic: true,
        restitution: 0,
        friction: 0.8,
        frictionStatic: 0.6,
        debugColor: 0x22c55e,
      };
    case "bouncy":
      return {
        collides: true,
        isSensor: false,
        isStatic: true,
        restitution: 0.9,
        friction: 0.3,
        frictionStatic: 0.3,
        debugColor: 0xf59e0b,
      };
    case "slippery":
      return {
        collides: true,
        isSensor: false,
        isStatic: true,
        restitution: 0,
        friction: 0.02,
        frictionStatic: 0,
        debugColor: 0x38bdf8,
      };
    case "hazard":
      return {
        collides: true,
        isSensor: true,
        isStatic: true,
        restitution: 0,
        friction: 0,
        frictionStatic: 0,
        debugColor: 0xef4444,
      };
    case "decor":
      return {
        collides: false,
        isSensor: false,
        isStatic: true,
        restitution: 0,
        friction: 0,
        frictionStatic: 0,
        debugColor: 0x6b7280,
      };
  }
}
