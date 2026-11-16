import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !s.endsWith('.ts') ? `${s}.ts` : s, c); } });
const { rejuvenate, rejuvenationPlan } = await import('../assets/battle/logic/rejuvenation.ts');
const { SessionProgress } = await import('../assets/battle/logic/session-progress.ts');
const { initialHero } = await import('../assets/battle/logic/hero-progress.ts');
const { WILD_SPECIES } = await import('../assets/battle/logic/wild-encounter.ts');
const { generateAptitudes } = await import('../assets/battle/logic/aptitude.ts');
const { generateGrowth } = await import('../assets/battle/logic/growth.ts');
const { petCombat } = await import('../assets/battle/logic/pet-panel.ts');
const { MUTATION_CONFIG } = await import('../assets/battle/logic/mutation.ts');
const { SKILL_POOLS } = await import('../assets/battle/logic/pet-skills.ts');
test('all species reroll full ranges, reset babies and apply mutation exactly once', () => {
  const original = new SessionProgress(initialHero()).roster.entries[1];
  for (const [species, config] of Object.entries(WILD_SPECIES)) for (const isMutated of [false, true]) {
    for (const edge of [0, 1]) {
      const pet = { ...original, species, isMutated, skillIds: ['thunder', 'fireball'], exp: 5 };
      const before = structuredClone(pet), next = rejuvenate(pet, () => edge);
      assert.deepEqual(pet, before);
      for (const field of ['id', 'name', 'origin', 'sourceEnemyId', 'species', 'isMutated']) assert.equal(next[field], pet[field]);
      assert.deepEqual([next.level, next.exp, next.potential, next.isBaby], [0, 0, 0, true]);
      assert.equal(Object.values(next.baseStats).reduce((a, b) => a + b), 50);
      assert.ok(Object.values(next.baseStats).every(n => n >= 1));
      for (const [key, range] of Object.entries(config.aptitudes)) {
        assert.equal(next.aptitudes[key], Math.round(range[edge] * (isMutated ? MUTATION_CONFIG.multiplier : 1)));
        if (!edge && !isMutated) assert.ok(next.aptitudes[key] < generateAptitudes(true, () => 0, config.aptitudes)[key]);
      }
      assert.equal(next.growth, edge ? config.growth.max : config.growth.min);
      if (!edge) assert.ok(next.growth < generateGrowth(true, () => 0, config.growth));
      assert.deepEqual(rejuvenate(next, () => edge), next);
      for (const id of SKILL_POOLS[species].innate) assert.ok(next.skillIds.includes(id));
      assert.ok(next.skillIds.every(id => [...SKILL_POOLS[species].innate, ...SKILL_POOLS[species].random].includes(id)));
      assert.deepEqual(Object.fromEntries(Object.keys(petCombat(next)).map(k => [k, next[k]])), petCombat(next));
    }
  }
});
test('eligibility rejects invalid material, mutation identity, stock, selection and context', () => {
  const pet = new SessionProgress(initialHero()).roster.entries[1];
  for (const [target, item, inventory, selected, blocked] of [
    [pet, 'book:thunder', {}, 'pet', false], [pet, 'mutation-rejuvenation', { 'mutation-rejuvenation': 1 }, 'pet', false],
    [{ ...pet, isMutated: true }, 'rejuvenation', { rejuvenation: 1 }, 'pet', false],
    [pet, 'rejuvenation', {}, 'pet', false], [undefined, 'rejuvenation', { rejuvenation: 1 }, 'pet', false],
    [pet, 'rejuvenation', { rejuvenation: 1 }, pet.id, false], [pet, 'rejuvenation', { rejuvenation: 1 }, 'pet', true],
  ]) assert.throws(() => rejuvenationPlan(target, item, inventory, selected, blocked));
  for (const roll of [-1, NaN, 1.1]) assert.throws(() => rejuvenate(pet, () => roll), /随机/);
});
