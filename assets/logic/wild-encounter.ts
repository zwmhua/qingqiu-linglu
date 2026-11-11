import { APTITUDE_RANGES } from './aptitude';
import { effectiveLevel } from './baby';
import { TINGWA_GROWTH } from './growth';

export const WILD_SPECIES = {
  tingwa: {
    name: '汀蛙', aptitudes: APTITUDE_RANGES, growth: TINGWA_GROWTH,
    base: { hp: 33, attack: 10, defense: 9, speed: 9 }, hpPerLevel: 4, defenseStep: 2,
  },
  pangui: {
    name: '磐龟',
    aptitudes: {
      attack: [816, 960], defense: [816, 960], stamina: [3060, 3600],
      mana: [1020, 1200], dodge: [1122, 1320], speed: [714, 840],
    },
    growth: TINGWA_GROWTH,
    base: { hp: 45, attack: 9, defense: 13, speed: 7 }, hpPerLevel: 6, defenseStep: 1,
  },
  maomaochong: {
    name: '毛毛虫',
    aptitudes: {
      attack: [1224, 1440], defense: [765, 900], stamina: [2040, 2400],
      mana: [1020, 1200], dodge: [1020, 1200], speed: [1122, 1320],
    },
    growth: { min: 0.994, max: 1.030 },
    base: { hp: 26, attack: 14, defense: 7, speed: 10 }, hpPerLevel: 3, defenseStep: 2,
  },
} as const;

export type WildSpecies = keyof typeof WILD_SPECIES;
const speciesKeys = Object.keys(WILD_SPECIES) as WildSpecies[];
const wildLevels = [1, 2, 3, 4, 5] as const;

function uniformIndex(roll: number, length: number): number {
  return Math.min(length - 1, Math.floor(roll * length));
}

export const pickWildSpecies = (roll: number): WildSpecies => speciesKeys[uniformIndex(roll, speciesKeys.length)];
export const pickWildLevel = (roll: number): number => wildLevels[uniformIndex(roll, wildLevels.length)];

export function wildCombat(species: WildSpecies, level: number) {
  const { base, hpPerLevel, defenseStep } = WILD_SPECIES[species];
  const d = effectiveLevel(level) - 1;
  const hp = base.hp + hpPerLevel * d;
  const half = Math.floor(d / 2);
  return { hp, maxHp: hp, attack: base.attack + half,
    defense: base.defense + Math.floor(d / defenseStep), speed: base.speed + half };
}
