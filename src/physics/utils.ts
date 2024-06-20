type PrecisionType = "PERFECT" | "GOOD" | "OK" | "BAD";

export function getHitPrecision(distance: number): {
  precision: PrecisionType;
  modifier: number;
  x: number;
  y: number;
  scalarMultiplier: number;
} {
  const randomModifier = Math.random() - 0.5 > 0 ? 1 : -1;

  if (distance < 1.3)
    return {
      precision: "PERFECT",
      modifier: 0,
      x: -11 * randomModifier,
      y: 10,
      scalarMultiplier: 18 / 3,
    };
  if (distance < 2)
    return {
      precision: "GOOD",
      modifier: 0.3,
      x: -10 * randomModifier,
      y: 12,
      scalarMultiplier: 17 / 3,
    };
  if (distance < 3)
    return {
      precision: "OK",
      modifier: 0.5,
      x: -5 * randomModifier,
      y: 13,
      scalarMultiplier: 16 / 3,
    };
  return {
    precision: "BAD",
    modifier: 1,
    x: 0,
    y: 13,
    scalarMultiplier: 14 / 3,
  };
}
