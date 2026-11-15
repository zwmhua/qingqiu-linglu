import { BOOK_IDS, type Inventory } from './inventory';
import { PET_SKILLS, SKILL_POOLS, validSkills } from './pet-skills';
import type { CarriedPet } from './roster';

export const BOOK_ADD_RATES = [1, 1, 0.6, 0.3, 0, 0, 0, 0, 0] as const;
export function bookOptions(ids: readonly string[], innate: readonly string[]) {
  const rate = BOOK_ADD_RATES[ids.length];
  const candidates = ids.map((id, index) => innate.includes(id) ? -1 : index).filter(index => index >= 0);
  if (rate === undefined) throw new Error('技能数量无效');
  if (rate < 1 && !candidates.length) throw new Error('只有必带技能，无法顶替');
  return { rate, candidates };
}
export function bookPlan(pet: Pick<CarriedPet, 'species' | 'skillIds'> | undefined,
  item: string, inventory: Inventory, inBattle: boolean) {
  if (inBattle) throw new Error('战斗中不能打书');
  if (!pet) throw new Error('灵宠不在携带列表');
  if (!BOOK_IDS.includes(item)) throw new Error('请选择有效技能书');
  if (!Number.isSafeInteger(inventory[item]) || inventory[item] < 1) throw new Error('技能书数量不足');
  const ids = pet.skillIds, skillId = item.slice(5);
  if (!Object.hasOwn(SKILL_POOLS, pet.species) || !validSkills(pet.species, ids)) throw new Error('当前技能无效');
  if (ids.includes(skillId)) throw new Error('灵宠已学会该技能');
  return { skillId, ...bookOptions(ids, SKILL_POOLS[pet.species].innate) };
}
export function applyBook(ids: readonly string[], plan: ReturnType<typeof bookPlan>, random = Math.random) {
  const roll = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('打书随机值无效');
    return value;
  };
  const skillIds = [...ids];
  let replaced: string | undefined;
  if (plan.rate === 1 || plan.rate > 0 && roll() < plan.rate) skillIds.push(plan.skillId);
  else {
    const index = plan.candidates[Math.min(plan.candidates.length - 1, Math.floor(roll() * plan.candidates.length))];
    replaced = skillIds[index];
    skillIds[index] = plan.skillId;
  }
  return { skillIds, replaced, message: replaced
    ? `${PET_SKILLS[plan.skillId].name} 替换 ${PET_SKILLS[replaced].name}` : `新增${PET_SKILLS[plan.skillId].name}` };
}
