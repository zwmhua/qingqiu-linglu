import { BASE_STAT_KEYS } from './base-stats';
import type { BaseStats } from './base-stats';

export const HERO_PROGRESSION = {
  maxLevel: 20, expPerLevel: 10, enemyBaseExp: 8, enemyLevelExp: 2,
  initialStat: 10, statPerLevel: 1, potentialPerLevel: 5,
  coefficients: {
    hp: 500, mana: 300, attack: 66, defense: 150, dodge: 100,
    speed: { constitution: 10, strength: 10, endurance: 10, agility: 70 },
    spirit: { constitution: 30, mana: 70, strength: 40, endurance: 20 },
  },
} as const;

export type HeroProgress = { level: number; exp: number; potential: number; stats: BaseStats };

export const levelUpExp = (level: number) => HERO_PROGRESSION.expPerLevel * (level + 1);

export function initialHero(): HeroProgress {
  return { level: 0, exp: 0, potential: 0, stats: Object.fromEntries(
    BASE_STAT_KEYS.map(key => [key, HERO_PROGRESSION.initialStat]),
  ) as BaseStats };
}

export function awardExperience(hero: HeroProgress, earned: number): HeroProgress {
  const { maxLevel, statPerLevel, potentialPerLevel } = HERO_PROGRESSION;
  let level = hero.level;
  let exp = hero.exp + earned;
  while (level < maxLevel && exp >= levelUpExp(level)) exp -= levelUpExp(level++);
  const levels = level - hero.level;
  const stats = { ...hero.stats };
  for (const key of BASE_STAT_KEYS) stats[key] += levels * statPerLevel;
  return { level, exp: level === maxLevel ? 0 : exp, stats,
    potential: hero.potential + levels * potentialPerLevel };
}

export function heroPanel(stats: BaseStats) {
  const { constitution, mana, strength, endurance, agility } = stats;
  const c = HERO_PROGRESSION.coefficients;
  const round = (scaled: number) => Math.round(scaled / 100);
  const sum = (weights: Partial<BaseStats>) =>
    round(BASE_STAT_KEYS.reduce((total, key) => total + stats[key] * (weights[key] ?? 0), 0));
  return { maxHp: round(constitution * c.hp), maxMana: round(mana * c.mana),
    attack: round(strength * c.attack), defense: round(endurance * c.defense),
    speed: sum(c.speed), dodge: round(agility * c.dodge), spirit: sum(c.spirit) };
}
