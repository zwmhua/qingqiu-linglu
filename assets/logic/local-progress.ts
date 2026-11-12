import { APTITUDE_KEYS } from './aptitude';
import { BASE_STAT_KEYS, baseStatTotal } from './base-stats';
import { HERO_PROGRESSION, levelUpExp } from './hero-progress';
import { WILD_SPECIES, wildCombat } from './wild-encounter';
import { petCombat } from './pet-panel';
import type { HeroProgress } from './hero-progress';
import type { CarriedPet } from './roster';
import type { Battle } from '../scripts/Battle';

const KEY = 'qingqiu-linglu:test-progress';
const VERSION = 3;
type ProgressStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Snapshot = { version: number; hero: HeroProgress; pets: CarriedPet[]; selectedPetId: string; nextCapturedId?: number };

const inRange = (n: number, low: number, high: number) => Number.isInteger(n) && n >= low && n <= high;
const positive = (n: number) => Number.isFinite(n) && n > 0;

function validPet(pet: CarriedPet, legacy: boolean): boolean {
  if (!pet || !Object.prototype.hasOwnProperty.call(WILD_SPECIES, pet.species)
    || !inRange(pet.level, 0, HERO_PROGRESSION.maxLevel)
    || !inRange(pet.exp, 0, pet.level === HERO_PROGRESSION.maxLevel ? 0 : levelUpExp(pet.level) - 1)
    || !inRange(pet.potential, 0, pet.level * HERO_PROGRESSION.potentialPerLevel)
    || !APTITUDE_KEYS.every(key => positive(pet.aptitudes?.[key]))
    || !BASE_STAT_KEYS.every(key => inRange(pet.baseStats?.[key], 1, baseStatTotal(pet.level)))
    || BASE_STAT_KEYS.reduce((sum, key) => sum + pet.baseStats[key], pet.potential) !== baseStatTotal(pet.level)
    || !positive(pet.growth) || typeof pet.isMutated !== 'boolean' || typeof pet.isBaby !== 'boolean'
    || (pet.level === 0 && !pet.isBaby)
    || typeof pet.name !== 'string') return false;
  const panel = legacy ? wildCombat(pet.species, pet.level) : petCombat(pet);
  return pet.maxHp === panel.maxHp && pet.attack === panel.attack
    && pet.defense === panel.defense && pet.speed === panel.speed;
}

export function readProgress(storage: ProgressStorage, capacity = 5): Snapshot | null {
  const raw = storage.getItem(KEY);
  if (raw === null) return null;
  const saved: Snapshot = JSON.parse(raw);
  const hero = saved?.hero;
  const { maxLevel, initialStat, statPerLevel, potentialPerLevel } = HERO_PROGRESSION;
  const minimum = initialStat + (hero?.level ?? 0) * statPerLevel;
  const budget = (hero?.level ?? 0) * potentialPerLevel;
  if (![1, 2, VERSION].includes(saved?.version) || !hero || !inRange(hero.level, 0, maxLevel)
    || !inRange(hero.exp, 0, hero.level === maxLevel ? 0 : levelUpExp(hero.level) - 1)
    || !inRange(hero.potential, 0, budget)
    || !BASE_STAT_KEYS.every(key => inRange(hero.stats?.[key], minimum, minimum + budget))
    || BASE_STAT_KEYS.reduce((spent, key) => spent + hero.stats[key] - minimum, hero.potential) !== budget
    || !Array.isArray(saved.pets) || saved.pets.length < (saved.version === VERSION ? 1 : 2) || saved.pets.length > capacity
    || (saved.nextCapturedId !== undefined && (!Number.isSafeInteger(saved.nextCapturedId) || saved.nextCapturedId < 1)))
    throw new Error('本地测试进度损坏或版本不兼容');
  if (saved.version === 1 && !saved.pets.every(pet => pet && inRange(pet.level, 0, 5) && pet.isBaby === (pet.level === 0)))
    throw new Error('旧版召唤兽进度损坏');
  const pets = saved.version === 1 ? saved.pets.map(pet => ({ ...pet, exp: 0, potential: 0 })) : saved.pets;
  const legacy = saved.version !== VERSION;
  if (!pets.every(pet => validPet(pet, legacy))) throw new Error('召唤兽进度损坏');
  const ids = pets.map(pet => pet.id);
  if (new Set(ids).size !== ids.length || !ids.includes(saved.selectedPetId)
    || !pets.every((pet, index) => pet.origin === 'initial'
      ? (legacy ? pet.id === ['pet', 'pet-2'][index] : pet.id === 'pet' || pet.id === 'pet-2')
        && pet.species === 'tingwa' && !pet.isBaby && !pet.isMutated
      : pet.origin === 'captured' && (!legacy || index >= 2) && /^caught-[1-9]\d*$/.test(pet.id)))
    throw new Error('本地携带名单或出战选择无效');
  return { ...saved, version: VERSION,
    pets: pets.map(pet => ({ ...pet, ...(legacy ? petCombat(pet) : {}), skill: pet.skill })) };
}

export function saveProgress(storage: ProgressStorage, battle: Battle, hero = battle.heroProgress,
  updatedPet?: CarriedPet, roster = battle.roster.entries): void {
  if (!hero) throw new Error('人物进度尚未初始化');
  const saved: Snapshot = { version: VERSION, hero, selectedPetId: battle.selectedPetId,
    nextCapturedId: battle.roster.nextCapturedId,
    pets: roster.map(pet => {
      const entry = updatedPet?.id === pet.id ? updatedPet : pet;
      return { ...entry, hp: entry.maxHp };
    }) };
  storage.setItem(KEY, JSON.stringify(saved));
}

export function resetProgress(storage: ProgressStorage, confirmed: boolean): boolean {
  if (confirmed) storage.removeItem(KEY);
  return confirmed;
}
