/** Pure collision-label helpers (no Phaser imports). */

/**
 * The solid label when a collision pair is player-vs-solid, else null.
 * Used for ground-contact bookkeeping on collisionstart/active/end.
 */
export function groundContactLabel(
  labelA: string | undefined,
  labelB: string | undefined,
): string | null {
  const other =
    labelA === "player" ? labelB : labelB === "player" ? labelA : undefined;
  if (other === undefined || !other.startsWith("solid:")) {
    return null;
  }
  return other;
}
