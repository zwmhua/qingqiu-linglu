import { APTITUDE_KEYS } from './aptitude';
import { BASE_STAT_KEYS, baseStatTotal } from './base-stats';
import { HERO_PROGRESSION, levelUpExp } from './hero-progress';
import { WILD_SPECIES, wildCombat } from './wild-encounter';
import type { HeroProgress } from './hero-progress';
import type { CarriedPet } from './roster';
import type { Battle } from '../scripts/Battle';

const KEY = 'qingqiu-linglu:test-progress';
const VERSION = 1;
type ProgressStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Snapshot = { version: number; hero: HeroProgress; pets: CarriedPet[]; selectedPetId: string };

const inRange = (n: number, low: number, high: number) => Number.isInteger(n) && n >= low && n <= high;
const positive = (n: number) => Number.isFinite(n) && n > 0;

function validPet(pet: CarriedPet): boolean {
  if (!pet || !Object.prototype.hasOwnProperty.call(WILD_SPECIES, pet.species) || !inRange(pet.level, 0, 5)
    || !APTITUDE_KEYS.every(key => positive(pet.aptitudes?.[key]))
    || !BASE_STAT_KEYS.every(key => inRange(pet.baseStats?.[key], 1, baseStatTotal(pet.level)))
    || BASE_STAT_KEYS.reduce((sum, key) => sum + pet.baseStats[key], 0) !== baseStatTotal(pet.level)
    || !positive(pet.growth) || typeof pet.isMutated !== 'boolean' || pet.isBaby !== (pet.level === 0)
    || typeof pet.name !== 'string') return false;
  const panel = wildCombat(pet.species, pet.level);
  return pet.maxHp === panel.maxHp && pet.attack === panel.attack
    && pet.defense === panel.defense && pet.speed === panel.speed;
}

export function readProgress(storage: ProgressStorage, capacity = 5): Snapshot | null {
  const raw = storage.getItem(KEY);
  if (raw === null) return null;
  const saved: Snapshot = JSON.parse(raw);
  const hero = saved?.hero;
  const { maxLevel, initialStat, statPerLevel, potentialPerLevel } = HERO_PROGRESSION;
  if (saved?.version !== VERSION || !hero || !inRange(hero.level, 0, maxLevel)
    || !inRange(hero.exp, 0, hero.level === maxLevel ? 0 : levelUpExp(hero.level) - 1)
    || hero.potential !== hero.level * potentialPerLevel
    || !BASE_STAT_KEYS.every(key => hero.stats?.[key] === initialStat + hero.level * statPerLevel)
    || !Array.isArray(saved.pets) || saved.pets.length < 2 || saved.pets.length > capacity
    || !saved.pets.every(validPet)) throw new Error('本地测试进度损坏或版本不兼容');
  const ids = saved.pets.map(pet => pet.id);
  if (new Set(ids).size !== ids.length || !ids.includes(saved.selectedPetId)
    || !saved.pets.every((pet, index) => index < 2
      ? pet.id === ['pet', 'pet-2'][index] && pet.origin === 'initial' && pet.species === 'tingwa' && !pet.isBaby && !pet.isMutated
      : /^caught-[1-9]\d*$/.test(pet.id) && pet.origin === 'captured'))
    throw new Error('本地携带名单或出战选择无效');
  return saved;
}

export function saveProgress(storage: ProgressStorage, battle: Battle): void {
  if (!battle.heroProgress) throw new Error('人物进度尚未初始化');
  const saved: Snapshot = { version: VERSION, hero: battle.heroProgress, selectedPetId: battle.selectedPetId,
    pets: battle.roster.entries.map(pet => ({ ...pet, hp: pet.maxHp })) };
  storage.setItem(KEY, JSON.stringify(saved));
}

export function resetProgress(storage: ProgressStorage, confirmed: boolean): boolean {
  if (confirmed) storage.removeItem(KEY);
  return confirmed;
}
