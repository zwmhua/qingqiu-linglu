export const TINGWA_GROWTH = { min: 0.882, max: 0.918, decimals: 3 } as const;

export function generateGrowth(isBaby: boolean, random: () => number): number {
  const scale = 10 ** TINGWA_GROWTH.decimals;
  const min = Math.round(TINGWA_GROWTH.min * scale);
  const max = Math.round(TINGWA_GROWTH.max * scale);
  const low = isBaby ? Math.ceil((min + max) / 2) : min;
  return (low + Math.min(max - low, Math.floor(random() * (max - low + 1)))) / scale;
}
