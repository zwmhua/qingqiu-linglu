import { generateAptitudes } from './aptitude';
import { generateBaseStats } from './base-stats';
import { generateGrowth } from './growth';
import type { Inventory } from './inventory';
import { mutateAptitudes, MUTATION_CONFIG } from './mutation';
import { petCombat } from './pet-panel';
import { generateSkills } from './pet-skills';
import type { CarriedPet } from './roster';
import { WILD_SPECIES } from './wild-encounter';

export function rejuvenationPlan(pet: CarriedPet | undefined, item: string, inventory: Inventory,
  selectedPetId: string, blocked: boolean): asserts pet is CarriedPet {
  if (blocked) throw new Error('战斗中或待保存时不能还童');
  if (!pet) throw new Error('灵宠不在携带列表');
  if (item !== 'rejuvenation' && item !== 'mutation-rejuvenation') throw new Error('请选择有效还童露');
  if (pet.isMutated !== (item === 'mutation-rejuvenation')) throw new Error('露水与普通/变异身份不匹配');
  if (pet.id === selectedPetId) throw new Error('出战宠不能还童，请先在地图宠物面板更换出战');
  if (!Number.isSafeInteger(inventory[item]) || inventory[item] < 1) throw new Error('还童露数量不足');
}

export function rejuvenate(pet: CarriedPet, random = Math.random): CarriedPet {
  const roll = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('还童随机值无效');
    return value;
  };
  const config = WILD_SPECIES[pet.species];
  const base = generateAptitudes(false, roll, config.aptitudes);
  const next = { ...pet, level: 0, exp: 0, potential: 0, isBaby: true,
    aptitudes: pet.isMutated ? mutateAptitudes(base, MUTATION_CONFIG.multiplier) : base,
    growth: generateGrowth(false, roll, config.growth), baseStats: generateBaseStats(0, roll),
    skillIds: generateSkills(pet.species, pet.isMutated, roll) };
  return { ...next, ...petCombat(next) };
}
