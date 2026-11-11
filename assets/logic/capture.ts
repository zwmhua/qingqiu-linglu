export const CAPTURE = {
  baseRate: 0.20, hpBonus: 0.58, hpExponent: 1.15,
  minRate: 0.06, maxRate: 0.82,
} as const;

export function captureChance(hp: number, maxHp: number): number {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  return Math.max(CAPTURE.minRate, Math.min(CAPTURE.maxRate,
    CAPTURE.baseRate + CAPTURE.hpBonus * (1 - ratio) ** CAPTURE.hpExponent));
}
