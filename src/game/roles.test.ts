import { describe, expect, test } from "bun:test";
import { roleToBodyOptions } from "./roles";

describe("roleToBodyOptions", () => {
  test("platform is solid with default grip", () => {
    expect(roleToBodyOptions("platform")).toEqual({
      collides: true,
      isSensor: false,
      isStatic: true,
      restitution: 0,
      friction: 0.8,
      frictionStatic: 0.6,
      debugColor: 0x22c55e,
    });
  });

  test("bouncy is solid with high restitution", () => {
    const options = roleToBodyOptions("bouncy");
    expect(options.collides).toBe(true);
    expect(options.isSensor).toBe(false);
    expect(options.restitution).toBeGreaterThan(0.5);
  });

  test("slippery is solid with near-zero friction", () => {
    const options = roleToBodyOptions("slippery");
    expect(options.collides).toBe(true);
    expect(options.isSensor).toBe(false);
    expect(options.friction).toBeLessThan(0.1);
    expect(options.frictionStatic).toBe(0);
  });

  test("hazard is a sensor", () => {
    const options = roleToBodyOptions("hazard");
    expect(options.collides).toBe(true);
    expect(options.isSensor).toBe(true);
  });

  test("decor has no physics body", () => {
    const options = roleToBodyOptions("decor");
    expect(options.collides).toBe(false);
  });
});
