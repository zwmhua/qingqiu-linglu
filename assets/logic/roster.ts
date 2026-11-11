import type { Unit } from '../scripts/Battle';
import type { Aptitudes } from './aptitude';
import type { BaseStats } from './base-stats';

type PetStats = Pick<Unit, 'id' | 'name' | 'hp' | 'maxHp' | 'level' | 'attack' | 'defense' | 'speed' | 'skill' | 'isBaby' | 'isMutated' | 'aptitudes' | 'growth' | 'baseStats'>;
export type CarriedPet = PetStats & {
  isBaby: boolean; aptitudes: Aptitudes; growth: number; baseStats: BaseStats;
  isMutated: boolean;
  origin: 'initial' | 'captured'; sourceEnemyId?: string;
};

export class Roster {
  readonly entries: CarriedPet[];
  readonly capacity: number;
  private nextCapturedId: number;
  private capturedEnemies = new Set<string>();

  constructor(capacity: number, initial: ReadonlyArray<PetStats>, previous?: Roster) {
    this.capacity = capacity;
    this.entries = previous ? previous.entries.map(pet => ({ ...pet, aptitudes: { ...pet.aptitudes }, baseStats: { ...pet.baseStats }, hp: pet.maxHp }))
      : initial.map(pet => ({ id: pet.id, name: pet.name, hp: pet.hp, maxHp: pet.maxHp,
        level: pet.level, attack: pet.attack, defense: pet.defense, speed: pet.speed,
        skill: pet.skill, isBaby: false, aptitudes: this.requireAptitudes(pet),
        growth: this.requireGrowth(pet), baseStats: this.requireBaseStats(pet),
        isMutated: false, origin: 'initial' as const }));
    this.nextCapturedId = previous?.nextCapturedId ?? 1;
  }

  get full(): boolean { return this.entries.length >= this.capacity; }

  private requireAptitudes(pet: PetStats): Aptitudes {
    if (!pet.aptitudes) throw new Error('汀蛙缺少六项资质');
    return { ...pet.aptitudes };
  }

  private requireGrowth(pet: PetStats): number {
    if (pet.growth === undefined) throw new Error('汀蛙缺少成长');
    return pet.growth;
  }

  private requireBaseStats(pet: PetStats): BaseStats {
    if (!pet.baseStats) throw new Error('汀蛙缺少五项基础属性');
    return { ...pet.baseStats };
  }

  addCaptured(enemy: PetStats): boolean {
    if (this.full || this.capturedEnemies.has(enemy.id)) return false;
    this.entries.push({ id: `caught-${this.nextCapturedId++}`,
      name: enemy.isBaby ? enemy.name : '汀蛙', hp: enemy.hp,
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
