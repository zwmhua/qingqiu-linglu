import type { Unit } from '../scripts/Battle';
import type { Aptitudes } from './aptitude';
import type { BaseStats } from './base-stats';
import { WILD_SPECIES } from './wild-encounter';
import type { WildSpecies } from './wild-encounter';

type PetStats = Pick<Unit, 'id' | 'name' | 'species' | 'hp' | 'maxHp' | 'level' | 'attack' | 'defense' | 'speed' | 'skill' | 'isBaby' | 'isMutated' | 'aptitudes' | 'growth' | 'baseStats'>;
export type CarriedPet = PetStats & {
  species: WildSpecies;
  isBaby: boolean; aptitudes: Aptitudes; growth: number; baseStats: BaseStats;
  isMutated: boolean;
  origin: 'initial' | 'captured'; sourceEnemyId?: string;
};

export class Roster {
  readonly entries: CarriedPet[];
  readonly capacity: number;
  private nextCapturedId: number;
  private capturedEnemies = new Set<string>();

  constructor(capacity: number, initial: ReadonlyArray<PetStats>, previous?: Pick<Roster, 'entries'>) {
    this.capacity = capacity;
    this.entries = previous ? previous.entries.map(pet => ({ ...pet, aptitudes: { ...pet.aptitudes }, baseStats: { ...pet.baseStats }, hp: pet.maxHp }))
      : initial.map(pet => ({ id: pet.id, name: pet.name, species: pet.species ?? 'tingwa', hp: pet.hp, maxHp: pet.maxHp,
        level: pet.level, attack: pet.attack, defense: pet.defense, speed: pet.speed,
        skill: pet.skill, isBaby: false, aptitudes: this.requireAptitudes(pet),
        growth: this.requireGrowth(pet), baseStats: this.requireBaseStats(pet),
        isMutated: false, origin: 'initial' as const }));
    this.nextCapturedId = 1 + this.entries.reduce((highest, pet) =>
      pet.origin === 'captured' ? Math.max(highest, Number(pet.id.slice('caught-'.length))) : highest, 0);
  }

  get full(): boolean { return this.entries.length >= this.capacity; }

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
    this.entries.push({ id: `caught-${this.nextCapturedId++}`, species,
      name: enemy.isBaby ? enemy.name : WILD_SPECIES[species].name, hp: enemy.hp,
      maxHp: enemy.maxHp, level: enemy.level, attack: enemy.attack, defense: enemy.defense,
      speed: enemy.speed, skill: enemy.skill, isBaby: !!enemy.isBaby,
      aptitudes: this.requireAptitudes(enemy),
      growth: this.requireGrowth(enemy),
      baseStats: this.requireBaseStats(enemy),
      isMutated: !!enemy.isMutated,
      origin: 'captured', sourceEnemyId: enemy.id });
    this.capturedEnemies.add(enemy.id);
    return true;
  }
}
