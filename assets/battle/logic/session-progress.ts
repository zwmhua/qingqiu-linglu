import { fusePets, fusionPlan } from './pet-fusion';
import { rejuvenate, rejuvenationPlan } from './rejuvenation';
import { generateAptitudes } from './aptitude';
import { BATTLE_RULES, INITIAL_PET_IDS } from './battle-rules';
import { generateBaseStats } from './base-stats';
import { generateGrowth } from './growth';
import { confirmPotential, type HeroProgress, type LevelProgress } from './hero-progress';
import { petCombat } from './pet-panel';
import { petProgress, Roster, type CarriedPet, type RosterState } from './roster';
import { pickWildLevel } from './wild-encounter';
import { generateSkills } from './pet-skills';
import { planWarehouseTransfer, type Inventory, type DropMode, type WarehouseDirection } from './inventory';
import { applyBook, bookPlan } from './skill-books';

export class SessionProgress {
  readonly roster: Roster;
  readonly autoOrders = new Map<string, { command: 'attack' | 'defend' | 'spell'; skillId?: string }>();
  selectedPetId: string;
  heroProgress?: HeroProgress;
  inventory: Inventory = {};
  warehouse: Inventory = {};
  lastSettledId = 0;
  dropMode: DropMode = 'formal';
  private battleSequence = 0;
  private fusionCandidates = new Map<string, CarriedPet>();
  private fusing = false;
  private warehouseSaving = false;

  prepareWarehouseTransfer(direction: WarehouseDirection, id: string, count: number) {
    const { inventory, warehouse } = this;
    const bagCount = inventory[id], warehouseCount = warehouse[id];
    let consumed = false;
    return (blocked: boolean, persist: (next: { inventory: Inventory; warehouse: Inventory }) => void): boolean => {
      if (consumed || this.warehouseSaving) return false;
      consumed = true;
      if (blocked) throw new Error('当前无法使用仓库');
      if (this.inventory !== inventory || this.warehouse !== warehouse
        || inventory[id] !== bagCount || warehouse[id] !== warehouseCount
        || (direction === 'deposit' ? bagCount : warehouseCount) !== count) {
        throw new Error('道具数量已变化，请重新选择');
      }
      const next = planWarehouseTransfer(inventory, warehouse, direction, id, count);
      this.warehouseSaving = true;
      try {
        persist(next);
        this.inventory = next.inventory;
        this.warehouse = next.warehouse;
        return true;
      } finally {
        this.warehouseSaving = false;
      }
    };
  }

  prepareFusion(blocked: boolean, ids: readonly string[]) {
    const chosen = [...ids];
    const check = (blockedNow: boolean) => fusionPlan(this.roster.entries, chosen, this.selectedPetId, blockedNow);
    const signature = () => JSON.stringify([...check(false).parents].sort((a, b) => a.id.localeCompare(b.id)));
    check(blocked);
    const original = signature(), sequence = this.roster.nextFusedId;
    if (!Number.isSafeInteger(sequence + 1)) throw new Error('合宠序号超出范围');
    let consumed = false;
    return { execute: (nowBlocked: boolean, persist: (pets: CarriedPet[], nextId: number) => void, random = Math.random) => {
      if (consumed || this.fusing) return;
      consumed = true;
      const { parents: [a, b] } = check(nowBlocked);
      if (signature() !== original || this.roster.nextFusedId !== sequence) throw new Error('宠物资料或序号已变化，请重新确认');
      this.fusing = true;
      try {
        const key = `${sequence}:${original}`;
        let child = this.fusionCandidates.get(key);
        if (!child) {
          child = fusePets(a, b, `fused-${sequence}`, random);
          this.fusionCandidates.set(key, child);
        }
        if (this.roster.entries.some(pet => pet.id === child!.id)) throw new Error('合宠ID已存在');
        const entries = [...this.roster.entries.filter(pet => !chosen.includes(pet.id)), child];
        persist(entries, sequence + 1);
        this.roster.publishFusion(entries, sequence + 1);
        for (const id of chosen) this.autoOrders.delete(id);
        this.fusionCandidates.clear();
        return child;
      } finally { this.fusing = false; }
    } };
  }

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

  prepareRejuvenation(blocked: boolean, id: string, item: string) {
    const find = () => this.roster.entries.find(pet => pet.id === id);
    rejuvenationPlan(find(), item, this.inventory, this.selectedPetId, blocked);
    const original = JSON.stringify(find());
    let consumed = false;
    return { execute: (nowBlocked: boolean,
      persist: (pet: CarriedPet, inventory: Inventory) => void, random = Math.random) => {
      if (consumed) return;
      consumed = true;
      const pet = find();
      rejuvenationPlan(pet, item, this.inventory, this.selectedPetId, nowBlocked);
      if (JSON.stringify(pet) !== original) throw new Error('宠物资料已变化，请重新确认');
      const updated = rejuvenate(pet, random);
      const inventory = { ...this.inventory, [item]: this.inventory[item] - 1 };
      persist(updated, inventory);
      Object.assign(pet, updated);
      this.inventory = inventory;
      const order = this.autoOrders.get(id);
      if (order?.command === 'spell' && !updated.skillIds!.includes(order.skillId!)) this.autoOrders.delete(id);
      return { message: `${pet.name}还童成功，请在宠物面板查看新资料` };
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
