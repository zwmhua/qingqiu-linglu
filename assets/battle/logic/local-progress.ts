import { APTITUDE_KEYS } from './aptitude';
import { BATTLE_RULES } from './battle-rules';
import { BASE_STAT_KEYS, baseStatTotal } from './base-stats';
import { HERO_PROGRESSION, levelUpExp } from './hero-progress';
import { WILD_SPECIES, wildCombat } from './wild-encounter';
import { petCombat } from './pet-panel';
import type { HeroProgress } from './hero-progress';
import type { CarriedPet } from './roster';
import { SessionProgress } from './session-progress';
import { generateSkills, validSkills } from './pet-skills';
import { validateInventory, type Inventory } from './inventory';

import { progressIO, type ProgressStorage } from '../../logic/platform';
const VERSION = 5;
type Snapshot = { version: number; hero: HeroProgress; pets: CarriedPet[]; selectedPetId: string;
  nextCapturedId?: number; inventory?: Inventory; lastSettledId?: number };
type Progress = Pick<SessionProgress, 'heroProgress' | 'roster' | 'selectedPetId' | 'inventory' | 'lastSettledId'>;
function validateSettlement(id: unknown): void {
  if (!Number.isSafeInteger(id) || (id as number) < 0) throw new Error('结算标识无效，原档已保留');
}

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

export function readProgress(storage: ProgressStorage, capacity: number = BATTLE_RULES.maxCarriedPets): Snapshot | null {
  const raw = progressIO.read(storage);
  if (raw === null) return null;
  const saved: Snapshot = JSON.parse(raw);
  return validateSnapshot(saved, capacity);
}

function onlyKeys(value: object, allowed: string[]): void {
  if (!value || typeof value !== 'object' || Object.keys(value).some(key => !allowed.includes(key)))
    throw new Error('存档包含不兼容字段，原档已保留');
}

function validateSnapshot(saved: Snapshot, capacity: number = BATTLE_RULES.maxCarriedPets): Snapshot {
  onlyKeys(saved, ['version', 'hero', 'pets', 'selectedPetId', 'nextCapturedId',
    ...(saved?.version === VERSION ? ['inventory', 'lastSettledId'] : [])]);
  if (saved.version === VERSION) { validateInventory(saved.inventory); validateSettlement(saved.lastSettledId); }
  const hero = saved?.hero;
  const { maxLevel, initialStat, statPerLevel, potentialPerLevel } = HERO_PROGRESSION;
  const minimum = initialStat + (hero?.level ?? 0) * statPerLevel;
  const budget = (hero?.level ?? 0) * potentialPerLevel;
  if (![1, 2, 3, 4, VERSION].includes(saved?.version) || !hero || !inRange(hero.level, 0, maxLevel)
    || !inRange(hero.exp, 0, hero.level === maxLevel ? 0 : levelUpExp(hero.level) - 1)
    || !inRange(hero.potential, 0, budget)
    || !BASE_STAT_KEYS.every(key => inRange(hero.stats?.[key], minimum, minimum + budget))
    || BASE_STAT_KEYS.reduce((spent, key) => spent + hero.stats[key] - minimum, hero.potential) !== budget
    || !Array.isArray(saved.pets) || saved.pets.length < (saved.version >= 3 ? 1 : 2) || saved.pets.length > capacity
    || (saved.nextCapturedId !== undefined && (!Number.isSafeInteger(saved.nextCapturedId) || saved.nextCapturedId < 1)))
    throw new Error('本地测试进度损坏或版本不兼容');
  if (saved.version === 1 && !saved.pets.every(pet => pet && inRange(pet.level, 0, 5) && pet.isBaby === (pet.level === 0)))
    throw new Error('旧版召唤兽进度损坏');
  const pets = saved.version === 1 ? saved.pets.map(pet => ({ ...pet, exp: 0, potential: 0 })) : saved.pets;
  const legacy = saved.version < 3;
  onlyKeys(hero, ['level', 'exp', 'potential', 'stats']);
  onlyKeys(hero.stats, [...BASE_STAT_KEYS]);
  for (const pet of pets) {
    onlyKeys(pet, ['id', 'name', 'species', 'hp', 'maxHp', 'level', 'attack', 'defense', 'speed', 'skill',
      'isBaby', 'isMutated', 'aptitudes', 'growth', 'baseStats', 'origin', 'sourceEnemyId', 'exp', 'potential',
      ...(saved.version >= 4 ? ['skillIds'] : [])]);
    onlyKeys(pet.aptitudes, [...APTITUDE_KEYS]);
    onlyKeys(pet.baseStats, [...BASE_STAT_KEYS]);
    if (saved.version >= 4 ? pet.skill !== undefined || !validSkills(pet.species, pet.skillIds)
      : pet.skill !== undefined && pet.skill !== '露珠弹') throw new Error('存档技能不兼容，原档已保留');
  }
  if (!pets.every(pet => validPet(pet, legacy))) throw new Error('召唤兽进度损坏');
  const ids = pets.map(pet => pet.id);
  if (new Set(ids).size !== ids.length || !ids.includes(saved.selectedPetId)
    || !pets.every((pet, index) => pet.origin === 'initial'
      ? (legacy ? pet.id === ['pet', 'pet-2'][index] : pet.id === 'pet' || pet.id === 'pet-2')
        && pet.species === 'tingwa' && !pet.isBaby && !pet.isMutated
      : pet.origin === 'captured' && (!legacy || index >= 2) && /^caught-[1-9]\d*$/.test(pet.id)))
    throw new Error('本地携带名单或出战选择无效');
  return { ...saved, version: Math.max(saved.version, 3),
    pets: pets.map(pet => ({ ...pet, ...(legacy ? petCombat(pet) : {}), skill: pet.skill })) };
}

export function loadSessionProgress(storage: ProgressStorage): SessionProgress | null {
  return new ProgressLoader().load(storage);
}

export class ProgressLoader {
  private pending?: { raw: string; candidate: string };

  load(storage: ProgressStorage, random = Math.random): SessionProgress | null {
    const raw = progressIO.read(storage);
    if (this.pending && raw !== this.pending.raw) throw new Error('主档已变化，请重新加载');
    if (raw === null) return null;
    let saved = validateSnapshot(JSON.parse(raw));
    if (saved.version < VERSION) {
      const backupKey = `qingqiu-linglu:test-progress:backup:v${JSON.parse(raw).version}`;
      const backup = storage.getItem(backupKey);
      if (backup !== null && backup !== raw) throw new Error('旧档备份冲突，请保留档案并联系华周');
      if (backup === null) storage.setItem(backupKey, raw);
      if (!this.pending) {
        saved = { ...saved, version: VERSION, inventory: {}, lastSettledId: 0,
          pets: saved.pets.map(({ skill: _old, ...pet }) => ({ ...pet,
            skillIds: saved.version >= 4 ? pet.skillIds : generateSkills(pet.species, pet.isMutated, random) })) };
        validateSnapshot(saved);
        this.pending = { raw, candidate: JSON.stringify(saved) };
      }
      if (progressIO.read(storage) !== raw) throw new Error('主档已变化，请重新加载');
      progressIO.write(storage, this.pending.candidate);
      saved = validateSnapshot(JSON.parse(this.pending.candidate));
      this.pending = undefined;
    }
    const session = new SessionProgress(saved.hero, { entries: saved.pets, nextCapturedId: saved.nextCapturedId }, saved.selectedPetId);
    session.inventory = saved.inventory!;
    session.lastSettledId = saved.lastSettledId!;
    return session;
  }
}

export function saveProgress(storage: ProgressStorage, progress: Progress,
  hero = progress.heroProgress, updatedPet?: CarriedPet, roster = progress.roster.entries): void {
  progressIO.write(storage, progressSnapshot(progress, hero, updatedPet, roster));
}

export function progressSnapshot(progress: Progress,
  hero = progress.heroProgress, updatedPet?: CarriedPet, roster = progress.roster.entries,
  inventory = progress.inventory, lastSettledId = progress.lastSettledId): string {
  if (!hero) throw new Error('人物进度尚未初始化');
  validateInventory(inventory);
  validateSettlement(lastSettledId);
  const saved: Snapshot = { version: VERSION, hero, selectedPetId: progress.selectedPetId,
    inventory, lastSettledId,
    nextCapturedId: progress.roster.nextCapturedId,
    pets: roster.map(pet => {
      const entry = updatedPet?.id === pet.id ? updatedPet : pet;
      const { skill: _old, ...current } = entry;
      return { ...current, hp: entry.maxHp };
    }) };
  return JSON.stringify(saved);
}

export function resetProgress(storage: ProgressStorage, confirmed: boolean): boolean {
  if (confirmed) progressIO.clear(storage);
  return confirmed;
}
