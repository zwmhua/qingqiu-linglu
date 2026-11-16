import { generateAptitudes } from './aptitude';
import { BATTLE_RULES, INITIAL_PET_IDS } from './battle-rules';
import { generateBaseStats } from './base-stats';
import { generateGrowth } from './growth';
import { confirmPotential, type HeroProgress, type LevelProgress } from './hero-progress';
import { petCombat } from './pet-panel';
import { petProgress, Roster, type CarriedPet, type RosterState } from './roster';
import { pickWildLevel } from './wild-encounter';
import { generateSkills } from './pet-skills';
import type { Inventory, DropMode } from './inventory';
import { applyBook, bookPlan } from './skill-books';

export class SessionProgress {
  readonly roster: Roster;
  readonly autoOrders = new Map<string, { command: 'attack' | 'defend' | 'spell'; skillId?: string }>();
  selectedPetId: string;
  heroProgress?: HeroProgress;
  inventory: Inventory = {};
  lastSettledId = 0;
  dropMode: DropMode = 'formal';
  private battleSequence = 0;

  allocateBattleId(): number {
    const next = Math.max(this.battleSequence, this.lastSettledId) + 1;
    if (!Number.isSafeInteger(next)) throw new Error('场次编号超出范围');
    return this.battleSequence = next;
  }

  constructor(heroProgress?: HeroProgress, previous?: RosterState, selectedPetId?: string,
    petRandom = Math.random, aptitudeRandom = Math.random, growthRandom = Math.random,
    baseStatsRandom = Math.random, skillRandom = Math.random) {
    this.heroProgress = heroProgress;
    this.selectedPetId = selectedPetId ?? previous?.entries[0]?.id ?? INITIAL_PET_IDS[0];
    const frog = BATTLE_RULES.frog;
    const pets = previous ? [] : INITIAL_PET_IDS.map(id => {
      const level = heroProgress ? pickWildLevel(petRandom()) : frog.level;
      const traits = { level, aptitudes: generateAptitudes(false, aptitudeRandom),
        growth: generateGrowth(false, growthRandom), baseStats: generateBaseStats(level, baseStatsRandom) };
      return { id, name: frog.name, species: 'tingwa' as const, skillIds: generateSkills('tingwa', false, skillRandom), ...traits, ...petCombat(traits) };
    });
    this.roster = new Roster(BATTLE_RULES.maxCarriedPets, pets, previous);
  }

  confirmHeroAllocation(inBattle: boolean, preview: HeroProgress, persist: (hero: HeroProgress) => void): boolean {
    if (inBattle || !this.heroProgress) return false;
    const next = confirmPotential(this.heroProgress, preview);
    if (!next) return false;
    persist(next);
    this.heroProgress = next;
    return true;
  }

  confirmPetAllocation(inBattle: boolean, id: string, preview: LevelProgress,
    persist: (pet: CarriedPet) => void): boolean {
    if (inBattle || !this.heroProgress) return false;
    const pet = this.roster.entries.find(entry => entry.id === id);
    if (!pet) return false;
    const next = confirmPotential(petProgress(pet), preview);
    if (!next) return false;
    const { hp: _fullHp, ...panel } = petCombat({ ...pet, baseStats: next.stats });
    const updated = { ...pet, ...panel, baseStats: next.stats, potential: next.potential };
    persist(updated);
    Object.assign(pet, updated);
    return true;
  }

  prepareSkillBook(inBattle: boolean, id: string, item: string) {
    const find = () => this.roster.entries.find(pet => pet.id === id);
    const plan = bookPlan(find(), item, this.inventory, inBattle);
    const originalSkills = JSON.stringify(find()!.skillIds);
    let consumed = false;
    return { rate: plan.rate, execute: (nowInBattle: boolean,
      persist: (pet: CarriedPet, inventory: Inventory) => void, random = Math.random) => {
      if (consumed) return;
      consumed = true;
      const pet = find();
      const current = bookPlan(pet, item, this.inventory, nowInBattle);
      if (JSON.stringify(pet!.skillIds) !== originalSkills) throw new Error('技能已变化，请重新确认');
      const result = applyBook(pet!.skillIds!, current, random);
      const updated = { ...pet!, skillIds: result.skillIds };
      const inventory = { ...this.inventory, [item]: this.inventory[item] - 1 };
      persist(updated, inventory);
      Object.assign(pet!, updated);
      this.inventory = inventory;
      const order = this.autoOrders.get(id);
      if (order?.command === 'spell' && order.skillId === result.replaced) this.autoOrders.delete(id);
      return result;
    } };
  }

  selectPet(blocked: boolean, id: string, persist: (id: string) => void): boolean {
    if (blocked || id === this.selectedPetId || !this.roster.entries.some(pet => pet.id === id)) return false;
    persist(id);
    this.selectedPetId = id;
    return true;
  }

  releasePet(inBattle: boolean, id: string, persist: (pets: CarriedPet[]) => void): boolean {
    return this.roster.release(id, this.selectedPetId, inBattle, persist);
  }
}
