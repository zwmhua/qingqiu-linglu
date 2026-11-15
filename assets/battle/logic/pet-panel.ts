import { effectiveLevel } from './baby';
import type { LevelProgress } from './hero-progress';
import type { CarriedPet } from './roster';
import type { Unit } from '../scripts/Battle';
import { PET_SKILLS } from './pet-skills';

export const PET_PANEL = {
  hp: { divisor: 1000, constitution: 6 }, mana: { divisor: 500, points: 3 },
  attack: { divisor: 7500, base: 14, growth: 10 },
  defense: { divisor: 7500, base: 9.4, growth: 19 / 3, endurance: 4 / 3 },
  speedDivisor: 1000, dodgeDivisor: 1000,
  spirit: { divisor: 7500, aptitudeBonus: 1662, constitution: 0.3, endurance: 0.2, strength: 0.4, mana: 0.7 },
} as const;

type PetPanelInput = Pick<CarriedPet, 'level' | 'aptitudes' | 'growth' | 'baseStats'>;

function calculatePanel(pet: PetPanelInput, skillIds: readonly string[] = []) {
  const { aptitudes, growth, baseStats } = pet;
  const { constitution, mana, strength, endurance, agility } = baseStats;
  const level = effectiveLevel(pet.level);
  const c = PET_PANEL;
  return {
    maxHp: Math.round(level * aptitudes.stamina / c.hp.divisor + constitution * growth * c.hp.constitution),
    maxMana: Math.round(level * aptitudes.mana / c.mana.divisor + mana * growth * c.mana.points),
    ...statPassives({
      attack: level * aptitudes.attack * (c.attack.base + c.attack.growth * growth) / c.attack.divisor + strength * growth,
      defense: level * aptitudes.defense * (c.defense.base + c.defense.growth * growth) / c.defense.divisor
        + endurance * growth * c.defense.endurance,
      speed: agility * aptitudes.speed / c.speedDivisor,
    }, pet.level, skillIds),
    dodge: Math.round(agility * aptitudes.dodge / c.dodgeDivisor),
    spirit: Math.round(level * (aptitudes.mana + c.spirit.aptitudeBonus) * (1 + growth) / c.spirit.divisor
      + constitution * c.spirit.constitution + endurance * c.spirit.endurance + strength * c.spirit.strength + mana * c.spirit.mana),
  };
}

export function statPassives(base: Pick<Unit, 'attack' | 'defense' | 'speed'>, level: number, ids: readonly string[] = []) {
  return {
    attack: Math.round(base.attack + (ids.includes('power') ? level * PET_SKILLS.power.params.perLevel : 0)),
    defense: Math.round(base.defense + (ids.includes('armor') ? level * PET_SKILLS.armor.params.perLevel : 0)),
    speed: Math.round(base.speed * (ids.includes('swift') ? 1 + PET_SKILLS.swift.params.ratio : 1)),
  };
}

export const petPanel = (pet: PetPanelInput) => calculatePanel(pet);
export const effectivePetPanel = (pet: PetPanelInput & Pick<CarriedPet, 'skillIds'>) => calculatePanel(pet, pet.skillIds);

export function regenAmount(unit: Pick<Unit, 'level' | 'skillIds' | 'deployed' | 'left' | 'hp' | 'maxHp'>): number {
  if (!unit.deployed || unit.left || unit.hp <= 0 || !unit.skillIds?.includes('regen')) return 0;
  return Math.max(0, Math.min(Math.floor(unit.level / PET_SKILLS.regen.params.divisor), unit.maxHp - unit.hp));
}

export function petCombat(pet: PetPanelInput) {
  const { maxHp, attack, defense, speed } = petPanel(pet);
  return { hp: maxHp, maxHp, attack, defense, speed };
}

export function petPanelPreview(pet: PetPanelInput & Pick<CarriedPet, 'potential' | 'skillIds'>, draft?: LevelProgress) {
  const current = effectivePetPanel(pet);
  const pending = draft !== undefined && draft.potential < pet.potential;
  const panel = pending ? effectivePetPanel({ ...pet, baseStats: draft.stats }) : current;
  const delta = (key: keyof typeof current) => pending ? `+${panel[key] - current[key]}` : '';
  return { panel, delta };
}
