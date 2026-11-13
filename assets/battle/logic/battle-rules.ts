import { APTITUDE_RANGES } from './aptitude';
import { TINGWA_GROWTH } from './growth';

export const INITIAL_PET_IDS = ['pet', 'pet-2'] as const;

export const BATTLE_RULES = {
  commandSeconds: 29,
  encounter: [{ count: 1, weight: 0.50 }, { count: 2, weight: 0.35 }, { count: 3, weight: 0.15 }],
  hero: { name: '撷灵客', level: 1, hp: 58, attack: 10, defense: 13, speed: 9 },
  frog: {
    name: '汀蛙', level: 1, base: { hp: 38, attack: 11, defense: 10, speed: 10 },
    aptitude: APTITUDE_RANGES,
    growth: TINGWA_GROWTH,
    innateSkill: '露珠弹', mutated: false,
  },
  damage: { defenseFactor: 0.40, randomMin: 0.86, randomMax: 1.14, min: 1 },
  defenseDamageFactor: 0.5,
  protection: { protectorShare: 0.5 },
  summon: { maxPerBattle: 3, carriedPets: INITIAL_PET_IDS.length },
  maxCarriedPets: 5,
  status: { heroManaMax: 40, rageMax: 150, ragePerDamage: 1 },
} as const;

const LEGACY_GROWTH_DIVISOR = { hp: 18, other: 52 } as const;

export function growth(base: number, aptitude: number, level: number, hp = false): number {
  return base + Math.floor(aptitude * (level - 1) / (hp ? LEGACY_GROWTH_DIVISOR.hp : LEGACY_GROWTH_DIVISOR.other));
}
