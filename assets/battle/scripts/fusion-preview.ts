import { APTITUDE_KEYS } from '../logic/aptitude';
import { FUSION, fusionOutcomes, type fusionPlan } from '../logic/pet-fusion';
import { MUTATION_CONFIG } from '../logic/mutation';
import { SKILL_POOLS } from '../logic/pet-skills';
import { WILD_SPECIES } from '../logic/wild-encounter';

export function buildFusionPreview(plan: ReturnType<typeof fusionPlan>) {
  const [left, right] = plan.parents;
  const isMutated = left.isMutated;
  const capScale = isMutated ? MUTATION_CONFIG.multiplier : 1;
  const inherited = [left, right].flatMap(pet => (pet.skillIds ?? [])
    .filter(id => !SKILL_POOLS[pet.species].innate.includes(id)));
  const unique = inherited.filter((id, i) => inherited.indexOf(id) === i);
  return fusionOutcomes(plan).map(({ species, probability }) => {
    const config = WILD_SPECIES[species];
    const aptitudes = APTITUDE_KEYS.map(key => {
      const average = (left.aptitudes[key] + right.aptitudes[key]) / 2;
      const cap = Math.round(config.aptitudes[key][1] * capScale);
      return FUSION.aptitude.map(factor => Math.min(Math.round(average * factor), cap));
    });
    const averageGrowth = (left.growth + right.growth) / 2;
    const growth = FUSION.growth.map(factor =>
      Math.min(Number((averageGrowth * factor).toFixed(3)), config.growth.max));
    const innate = SKILL_POOLS[species].innate;
    const candidates = unique.filter(id => !innate.includes(id));
    const maxSkills = Math.min(FUSION.maxSkills, innate.length + candidates.length);
    return { species, probability, isMutated, aptitudes, growth, innate, candidates, maxSkills };
  });
}
