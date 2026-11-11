export const BASE_STATS_CONFIG = { base: 50, perLevel: 10, minPerStat: 1 } as const;
export const BASE_STAT_KEYS = ['constitution', 'mana', 'strength', 'endurance', 'agility'] as const;
export type BaseStats = Record<(typeof BASE_STAT_KEYS)[number], number>;

export function baseStatTotal(level: number): number {
  if (!Number.isInteger(level) || level < 0) throw new Error('宠物等级无效');
  return BASE_STATS_CONFIG.base + BASE_STATS_CONFIG.perLevel * level;
}

export function generateBaseStats(level: number, random: () => number): BaseStats {
  const stats = Object.fromEntries(BASE_STAT_KEYS.map(key =>
    [key, BASE_STATS_CONFIG.minPerStat])) as BaseStats;
  const remaining = baseStatTotal(level) - BASE_STAT_KEYS.length * BASE_STATS_CONFIG.minPerStat;
  for (let i = 0; i < remaining; i++) {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll > 1) throw new Error('基础属性随机值无效');
    stats[BASE_STAT_KEYS[Math.min(BASE_STAT_KEYS.length - 1, Math.floor(roll * BASE_STAT_KEYS.length))]]++;
  }
  return stats;
}
