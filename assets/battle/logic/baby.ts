export const BABY_CONFIG = { encounterRate: 0.05, level: 0, minCombatLevel: 1, lowerRangeFraction: 0.5, name: '汀蛙宝宝' } as const;

export const isBabyEncounter = (roll: number, rate: number): boolean => roll < rate;
export const effectiveLevel = (level: number): number => Math.max(BABY_CONFIG.minCombatLevel, level);
