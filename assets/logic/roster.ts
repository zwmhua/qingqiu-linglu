export type CarriedPet = {
  id: string; name: string; hp: number; maxHp: number;
  origin: 'initial' | 'captured'; sourceEnemyId?: string;
};

export class Roster {
  readonly entries: CarriedPet[];
  readonly capacity: number;

  constructor(capacity: number, initial: ReadonlyArray<Pick<CarriedPet, 'id' | 'name' | 'hp' | 'maxHp'>>) {
    this.capacity = capacity;
    this.entries = initial.map(pet => ({ id: pet.id, name: pet.name,
      hp: pet.hp, maxHp: pet.maxHp, origin: 'initial' }));
  }

  get full(): boolean { return this.entries.length >= this.capacity; }

  addCaptured(enemy: { id: string; hp: number; maxHp: number }): boolean {
    if (this.full || this.entries.some(pet => pet.sourceEnemyId === enemy.id)) return false;
    this.entries.push({ id: `caught-${enemy.id}`, name: '汀蛙', hp: enemy.hp,
      maxHp: enemy.maxHp, origin: 'captured', sourceEnemyId: enemy.id });
    return true;
  }
}
