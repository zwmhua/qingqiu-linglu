import { CONFIG } from '../scripts/config';
import { effectiveLevel } from './baby';
import type { CarriedPet } from './roster';

type PetPanelInput = Pick<CarriedPet, 'level' | 'aptitudes' | 'growth' | 'baseStats'>;

export function petPanel(pet: PetPanelInput) {
  const { aptitudes, growth, baseStats } = pet;
  const { constitution, mana, strength, endurance, agility } = baseStats;
  const level = effectiveLevel(pet.level);
  const c = CONFIG.petPanel;
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
