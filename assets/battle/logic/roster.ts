import type { Unit } from '../scripts/Battle';
import type { Aptitudes } from './aptitude';
import type { BaseStats } from './base-stats';
import { awardExperience } from './hero-progress';
import { WILD_SPECIES } from './wild-encounter';
import { petCombat } from './pet-panel';
import type { WildSpecies } from './wild-encounter';

type PetStats = Pick<Unit, 'id' | 'name' | 'species' | 'hp' | 'maxHp' | 'level' | 'attack' | 'defense' | 'speed' | 'skill' | 'isBaby' | 'isMutated' | 'aptitudes' | 'growth' | 'baseStats'>;
export type CarriedPet = PetStats & {
  species: WildSpecies;
  isBaby: boolean; aptitudes: Aptitudes; growth: number; baseStats: BaseStats;
  isMutated: boolean; exp: number; potential: number;
  origin: 'initial' | 'captured'; sourceEnemyId?: string;
};
export type RosterState = { entries: CarriedPet[]; nextCapturedId?: number };

export const petProgress = ({ level, exp, potential, baseStats }: CarriedPet) =>
  ({ level, exp, potential, stats: baseStats });

export class Roster {
  readonly entries: CarriedPet[];
  readonly capacity: number;
  private captureId: number;
  private capturedEnemies = new Set<string>();

  constructor(capacity: number, initial: ReadonlyArray<PetStats>, previous?: RosterState) {
    this.capacity = capacity;
    this.entries = previous ? previous.entries.map(pet => ({ ...pet, aptitudes: { ...pet.aptitudes }, baseStats: { ...pet.baseStats }, hp: pet.maxHp }))
      : initial.map(pet => ({ id: pet.id, name: pet.name, species: pet.species ?? 'tingwa', hp: pet.hp, maxHp: pet.maxHp,
        level: pet.level, attack: pet.attack, defense: pet.defense, speed: pet.speed,
        skill: pet.skill, isBaby: false, aptitudes: this.requireAptitudes(pet),
        growth: this.requireGrowth(pet), baseStats: this.requireBaseStats(pet),
        isMutated: false, origin: 'initial' as const, exp: 0, potential: 0 }));
    const highestId = this.entries.reduce((highest, pet) =>
      pet.origin === 'captured' ? Math.max(highest, Number(pet.id.slice('caught-'.length))) : highest, 0);
    this.captureId = Math.max(highestId + 1, previous?.nextCapturedId ?? 1);
  }

  awardExperience(participants: ReadonlySet<string>, earned: number): void {
    for (const pet of this.entries) {
      if (!participants.has(pet.id)) continue;
      const next = awardExperience(petProgress(pet), earned);
      const leveled = next.level !== pet.level;
      Object.assign(pet, { level: next.level, exp: next.exp, potential: next.potential, baseStats: next.stats });
      if (leveled) Object.assign(pet, petCombat(pet));
    }
  }

  get full(): boolean { return this.entries.length >= this.capacity; }
  get nextCapturedId(): number { return this.captureId; }

  releaseBlock(id: string, deployedId: string, inBattle: boolean): string | undefined {
    if (id === deployedId) return '出战中的召唤兽不能放生';
    if (inBattle) return '战斗中不能放生';
    if (!this.entries.some(pet => pet.id === id)) return '召唤兽不在携带列表';
  }

  release(id: string, deployedId: string, inBattle: boolean, persist: (pets: CarriedPet[]) => void): boolean {
    if (this.releaseBlock(id, deployedId, inBattle)) return false;
    const remaining = this.entries.filter(pet => pet.id !== id);
    persist(remaining);
    this.entries.splice(this.entries.findIndex(pet => pet.id === id), 1);
    return true;
  }

  private requireAptitudes(pet: PetStats): Aptitudes {
    if (!pet.aptitudes) throw new Error(`${pet.name}缺少六项资质`);
    return { ...pet.aptitudes };
  }

  private requireGrowth(pet: PetStats): number {
    if (pet.growth === undefined) throw new Error(`${pet.name}缺少成长`);
    return pet.growth;
  }

  private requireBaseStats(pet: PetStats): BaseStats {
    if (!pet.baseStats) throw new Error(`${pet.name}缺少五项基础属性`);
    return { ...pet.baseStats };
  }

  addCaptured(enemy: PetStats): boolean {
    if (this.full || this.capturedEnemies.has(enemy.id)) return false;
    const species = enemy.species;
    if (!species) throw new Error(`${enemy.name}缺少物种`);
    const pet: CarriedPet = { id: `caught-${this.captureId++}`, species,
      name: enemy.isBaby ? enemy.name : WILD_SPECIES[species].name, hp: enemy.hp,
      maxHp: enemy.maxHp, level: enemy.level, attack: enemy.attack, defense: enemy.defense,
      speed: enemy.speed, skill: enemy.skill, isBaby: !!enemy.isBaby,
      aptitudes: this.requireAptitudes(enemy),
      growth: this.requireGrowth(enemy),
      baseStats: this.requireBaseStats(enemy),
      isMutated: !!enemy.isMutated,
      origin: 'captured', sourceEnemyId: enemy.id, exp: 0, potential: 0 };
    const panel = petCombat(pet);
    this.entries.push({ ...pet, ...panel, hp: Math.min(enemy.hp, panel.maxHp) });
    this.capturedEnemies.add(enemy.id);
    return true;
  }
}
