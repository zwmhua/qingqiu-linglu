import { effectiveLevel } from './baby';
import type { LevelProgress } from './hero-progress';
import type { CarriedPet } from './roster';

export const PET_PANEL = {
  hp: { divisor: 1000, constitution: 6 }, mana: { divisor: 500, points: 3 },
  attack: { divisor: 7500, base: 14, growth: 10 },
  defense: { divisor: 7500, base: 9.4, growth: 19 / 3, endurance: 4 / 3 },
  speedDivisor: 1000, dodgeDivisor: 1000,
  spirit: { divisor: 7500, aptitudeBonus: 1662, constitution: 0.3, endurance: 0.2, strength: 0.4, mana: 0.7 },
} as const;

type PetPanelInput = Pick<CarriedPet, 'level' | 'aptitudes' | 'growth' | 'baseStats'>;

export function petPanel(pet: PetPanelInput) {
  const { aptitudes, growth, baseStats } = pet;
  const { constitution, mana, strength, endurance, agility } = baseStats;
  const level = effectiveLevel(pet.level);
  const c = PET_PANEL;
  return {
    maxHp: Math.round(level * aptitudes.stamina / c.hp.divisor + constitution * growth * c.hp.constitution),
    maxMana: Math.round(level * aptitudes.mana / c.mana.divisor + mana * growth * c.mana.points),
    attack: Math.round(level * aptitudes.attack * (c.attack.base + c.attack.growth * growth) / c.attack.divisor + strength * growth),
    defense: Math.round(level * aptitudes.defense * (c.defense.base + c.defense.growth * growth) / c.defense.divisor
      + endurance * growth * c.defense.endurance),
    speed: Math.round(agility * aptitudes.speed / c.speedDivisor),
    dodge: Math.round(agility * aptitudes.dodge / c.dodgeDivisor),
    spirit: Math.round(level * (aptitudes.mana + c.spirit.aptitudeBonus) * (1 + growth) / c.spirit.divisor
      + constitution * c.spirit.constitution + endurance * c.spirit.endurance + strength * c.spirit.strength + mana * c.spirit.mana),
  };
}

export function petCombat(pet: PetPanelInput) {
  const { maxHp, attack, defense, speed } = petPanel(pet);
  return { hp: maxHp, maxHp, attack, defense, speed };
}

export function petPanelPreview(pet: PetPanelInput & Pick<CarriedPet, 'potential'>, draft?: LevelProgress) {
  const current = petPanel(pet);
  const pending = draft !== undefined && draft.potential < pet.potential;
  const panel = pending ? petPanel({ ...pet, baseStats: draft.stats }) : current;
  const delta = (key: keyof typeof current) => pending ? `+${panel[key] - current[key]}` : '';
  return { panel, delta };
}
