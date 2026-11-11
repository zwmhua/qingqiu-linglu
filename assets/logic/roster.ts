import type { Unit } from '../scripts/Battle';
import type { Aptitudes } from './aptitude';

type PetStats = Pick<Unit, 'id' | 'name' | 'hp' | 'maxHp' | 'level' | 'attack' | 'defense' | 'speed' | 'skill' | 'isBaby' | 'aptitudes'>;
export type CarriedPet = PetStats & {
  isBaby: boolean; aptitudes: Aptitudes;
  origin: 'initial' | 'captured'; sourceEnemyId?: string;
};

export class Roster {
  readonly entries: CarriedPet[];
  readonly capacity: number;
  private nextCapturedId: number;
  private capturedEnemies = new Set<string>();

  constructor(capacity: number, initial: ReadonlyArray<PetStats>, previous?: Roster) {
    this.capacity = capacity;
    this.entries = previous ? previous.entries.map(pet => ({ ...pet, aptitudes: { ...pet.aptitudes }, hp: pet.maxHp }))
      : initial.map(pet => ({ id: pet.id, name: pet.name, hp: pet.hp, maxHp: pet.maxHp,
        level: pet.level, attack: pet.attack, defense: pet.defense, speed: pet.speed,
        skill: pet.skill, isBaby: false, aptitudes: this.requireAptitudes(pet), origin: 'initial' as const }));
    this.nextCapturedId = previous?.nextCapturedId ?? 1;
  }

  get full(): boolean { return this.entries.length >= this.capacity; }

  private requireAptitudes(pet: PetStats): Aptitudes {
    if (!pet.aptitudes) throw new Error('汀蛙缺少六项资质');
    return { ...pet.aptitudes };
  }

  addCaptured(enemy: PetStats): boolean {
    if (this.full || this.capturedEnemies.has(enemy.id)) return false;
    this.entries.push({ id: `caught-${this.nextCapturedId++}`,
      name: enemy.isBaby ? enemy.name : '汀蛙', hp: enemy.hp,
      maxHp: enemy.maxHp, level: enemy.level, attack: enemy.attack, defense: enemy.defense,
      speed: enemy.speed, skill: enemy.skill, isBaby: !!enemy.isBaby,
      aptitudes: this.requireAptitudes(enemy),
      origin: 'captured', sourceEnemyId: enemy.id });
    this.capturedEnemies.add(enemy.id);
    return true;
  }
}
