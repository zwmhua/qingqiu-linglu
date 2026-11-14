import type { WildSpecies } from './wild-encounter';

type Skill = { name: string; kind: 'active' | 'passive'; tier: number; family: string;
  params: Record<string, number>; description: (p: Record<string, number>) => string };
const percent = (value: number) => `${Math.round(value * 100)}%`;
const reaction = '反应伤害不会再次触发物理被动技能。';
const spell = (name: string): Skill => ({ name, kind: 'active', tier: 1, family: name,
  params: { mana: 5, base: 6, level: 2, spirit: 1, resistance: 0.5 },
  description: p => `对一个敌人释放${name.slice(0, -1)}，伤害随等级与双方灵力变化。消耗${p.mana}点法力。` });
export const PET_SKILLS: Record<string, Skill> = {
  crit: { name: '暴击', kind: 'passive', tier: 1, family: 'crit', params: { rate: 0.1, multiplier: 2 },
    description: p => `物理攻击的暴击率提高${percent(p.rate)}，暴击时造成${p.multiplier}倍伤害。` },
  combo: { name: '连打', kind: 'passive', tier: 1, family: 'combo', params: { rate: 0.45, hits: 2, reduction: 0.25 },
    description: p => `普通攻击有${percent(p.rate)}概率连续攻击${p.hits}次，每次伤害降低${percent(p.reduction)}。未触发时伤害不降低。` },
  lifesteal: { name: '噬血', kind: 'passive', tier: 1, family: 'lifesteal', params: { ratio: 0.25 },
    description: p => `普通物理攻击造成实际伤害后，回复相当于实际伤害${percent(p.ratio)}的气血，不超过气血上限。` },
  counter: { name: '还击', kind: 'passive', tier: 1, family: 'counter', params: { rate: 0.3, ratio: 0.5 },
    description: p => `受到普通物理攻击并失血后，若双方仍存活，有${percent(p.rate)}概率反击，造成普通物理伤害的${percent(p.ratio)}。${reaction}` },
  reflect: { name: '反弹', kind: 'passive', tier: 1, family: 'reflect', params: { rate: 0.3, ratio: 0.25 },
    description: p => `受到普通物理攻击并失血后，若双方仍存活，有${percent(p.rate)}概率返还自身实际所受伤害的${percent(p.ratio)}。${reaction}` },
  power: { name: '巨力', kind: 'passive', tier: 1, family: 'power', params: { perLevel: 0.4 },
    description: p => `攻击提高“自身等级×${p.perLevel}”。` },
  armor: { name: '硬甲', kind: 'passive', tier: 1, family: 'armor', params: { perLevel: 0.6 },
    description: p => `防御提高“自身等级×${p.perLevel}”。` },
  swift: { name: '迅捷', kind: 'passive', tier: 1, family: 'swift', params: { ratio: 0.1 },
    description: p => `速度提高${percent(p.ratio)}。` },
  regen: { name: '回血', kind: 'passive', tier: 1, family: 'regen', params: { divisor: 2 },
    description: p => `每回合开始时，在场且存活则回复“自身等级÷${p.divisor}”点气血，向下取整，不超过气血上限。` },
  thunder: spell('雷击术'), fireball: spell('火球术'), waterarrow: spell('水箭术'),
};
export const SKILL_POOLS: Record<WildSpecies, { innate: string[]; random: string[] }> = {
  tingwa: { innate: [], random: ['regen', 'swift', 'combo', 'lifesteal', 'waterarrow'] },
  pangui: { innate: ['armor'], random: ['reflect', 'counter', 'regen', 'power'] },
  maomaochong: { innate: [], random: ['crit', 'combo', 'lifesteal', 'swift', 'power'] },
};
export function validSkills(species: WildSpecies, ids: unknown): ids is string[] {
  return Array.isArray(ids) && ids.length <= 8 && new Set(ids).size === ids.length
    && ids.every(id => typeof id === 'string' && Object.hasOwn(PET_SKILLS, id))
    && SKILL_POOLS[species].innate.every(id => ids.includes(id));
}
export function generateSkills(species: WildSpecies, mutated: boolean, random = Math.random): string[] {
  const pick = (count: number) => {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll > 1) throw new Error('技能随机值无效');
    return Math.min(count - 1, Math.floor(roll * count));
  };
  const { innate, random: pool } = SKILL_POOLS[species];
  const ids = [...innate], available = Array.from(new Set(pool)).filter(id => !ids.includes(id));
  const count = pick(3) + Number(mutated);
  if (count > available.length || ids.length + count > 8) throw new Error('技能池配置无效');
  for (let i = 0; i < count; i++) ids.push(...available.splice(pick(available.length), 1));
  if (!validSkills(species, ids)) throw new Error('技能生成无效');
  return ids;
}
export function skillDescription(id: string, species: WildSpecies): string {
  const skill = PET_SKILLS[id];
  return skill.description(skill.params) + (SKILL_POOLS[species].innate.includes(id) ? '\n天生技能，无法被顶替' : '');
}
