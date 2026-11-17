import { APTITUDE_KEYS, type Aptitudes } from './aptitude';
import { BASE_STAT_KEYS, baseStatTotal, generateBaseStats } from './base-stats';
import { HERO_PROGRESSION } from './hero-progress';
import { MUTATION_CONFIG } from './mutation';
import { petCombat } from './pet-panel';
import { SKILL_POOLS, validSkills } from './pet-skills';
import type { CarriedPet } from './roster';
import { speciesKeys, WILD_SPECIES, type WildSpecies } from './wild-encounter';

export const FUSION = { minLevel: 10, parentRate: 0.45, sameRate: 0.9, panguiRate: 0.05, inheritance: 0.4,
  aptitude: [0.7, 1.1], growth: [0.96, 1.02], maxSkills: 8 } as const;
export function fusionPlan(entries: readonly CarriedPet[], ids: readonly string[], selected: string,
  blocked: boolean, pool: readonly WildSpecies[] = speciesKeys) {
  if (blocked) throw new Error('战斗中或待保存时不能合宠');
  const parents = ids.map(id => entries.find(pet => pet.id === id));
  if (ids.length !== 2 || ids[0] === ids[1] || parents.some(pet => !pet)) throw new Error('请选择携带中两只不同灵宠');
  const [a, b] = parents as [CarriedPet, CarriedPet];
  if (ids.includes(selected)) throw new Error('出战宠不能合宠');
  if ([a, b].some(pet => pet.level < FUSION.minLevel)) throw new Error(`合宠需要双方至少${FUSION.minLevel}级`);
  if (a.isMutated !== b.isMutated) throw new Error('普通与变异身份必须相同');
  const other = pool.filter((species, index) => pool.indexOf(species) === index)
    .filter(species => species !== a.species && species !== b.species);
  if (!other.length || [...other, a.species, b.species].some(species => !WILD_SPECIES[species]
    || !validSkills(species, SKILL_POOLS[species]?.innate))) throw new Error('合宠物种或必带技能配置错误');
  return { parents: [a, b] as const, other };
}

export function fusionOutcomes({ parents: [a, b], other }: ReturnType<typeof fusionPlan>) {
  const same = a.species === b.species;
  const weights: { species: WildSpecies; probability: number }[] = [
    { species: a.species, probability: same ? FUSION.sameRate : FUSION.parentRate },
  ];
  if (!same) weights.push({ species: b.species, probability: FUSION.sameRate - FUSION.parentRate });
  weights.push(...other.map(species => ({ species, probability: (1 - FUSION.sameRate) / other.length })));
  const remaining = weights.filter(({ species }) => species !== 'pangui');
  if (remaining.length === weights.length) return weights;
  const total = remaining.reduce((sum, { probability }) => sum + probability, 0);
  return [
    ...remaining.map(({ species, probability }) => ({ species, probability: probability / total * (1 - FUSION.panguiRate) })),
    { species: 'pangui' as const, probability: FUSION.panguiRate },
  ];
}

export function fusePets(a: CarriedPet, b: CarriedPet, id: string, random = Math.random,
  pool: readonly WildSpecies[] = speciesKeys): CarriedPet {
  const outcomes = fusionOutcomes(fusionPlan([a, b], [a.id, b.id], '', false, pool));
  const roll = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('合宠随机值无效');
    return value;
  };
  const pick = (count: number) => Math.min(count - 1, Math.floor(roll() * count));
  const r = roll(), last = outcomes[outcomes.length - 1];
  let upper = 0;
  const species = r >= 1 - last.probability ? last.species
    : outcomes.find(({ probability }) => r < (upper += probability))?.species ?? last.species;
  const config = WILD_SPECIES[species], isBaby = a.isBaby && b.isBaby;
  const level = Math.min(HERO_PROGRESSION.maxLevel, Math.floor((a.level + b.level) / 2));
  const factor = (range: readonly [number, number]) => range[0] + roll() * (range[1] - range[0]);
  const aptitudes = Object.fromEntries(APTITUDE_KEYS.map(key => [key, Math.min(
    Math.round((a.aptitudes[key] + b.aptitudes[key]) / 2 * factor(FUSION.aptitude)),
    Math.round(config.aptitudes[key][1] * (a.isMutated ? MUTATION_CONFIG.multiplier : 1)))])) as Aptitudes;
  const growth = Math.min(config.growth.max, Number(((a.growth + b.growth) / 2 * factor(FUSION.growth)).toFixed(3)));
  const baseStats = generateBaseStats(isBaby ? 0 : level, roll);
  if (isBaby) for (const key of BASE_STAT_KEYS) baseStats[key] += level;
  const skillIds = [...SKILL_POOLS[species].innate];
  const candidates = [a, b].flatMap(pet => (pet.skillIds ?? [])
    .filter(skill => !SKILL_POOLS[pet.species].innate.includes(skill)));
  const available = candidates.filter((skill, index) => candidates.indexOf(skill) === index)
    .filter(skill => !skillIds.includes(skill));
  const inherited = available.filter(() => roll() < FUSION.inheritance);
  const room = FUSION.maxSkills - skillIds.length;
  if (inherited.length <= room) skillIds.push(...inherited);
  else while (skillIds.length < FUSION.maxSkills) skillIds.push(...inherited.splice(pick(inherited.length), 1));
  const child = { id, name: config.name, species, isBaby, isMutated: a.isMutated, level, exp: 0,
    potential: isBaby ? level * HERO_PROGRESSION.potentialPerLevel : 0,
    aptitudes, growth, baseStats, skillIds, origin: 'fused' as const };
  if (!/^fused-[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id.slice(6))) || id === a.id || id === b.id
    || !APTITUDE_KEYS.every(key => Number.isInteger(aptitudes[key]) && aptitudes[key] > 0)
    || !Number.isFinite(growth) || growth <= 0 || !validSkills(species, skillIds)
    || BASE_STAT_KEYS.reduce((sum, key) => sum + baseStats[key], child.potential) !== baseStatTotal(level))
    throw new Error('合宠候选资料无效');
  return { ...child, ...petCombat(child) };
}
