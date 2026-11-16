import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !s.endsWith('.ts') ? `${s}.ts` : s, c); } });
const { fusionPlan, fusePets, FUSION } = await import('../assets/battle/logic/pet-fusion.ts');
const { SessionProgress } = await import('../assets/battle/logic/session-progress.ts');
const { initialHero } = await import('../assets/battle/logic/hero-progress.ts');
const { WILD_SPECIES } = await import('../assets/battle/logic/wild-encounter.ts');
const { SKILL_POOLS, PET_SKILLS } = await import('../assets/battle/logic/pet-skills.ts');
const { petCombat } = await import('../assets/battle/logic/pet-panel.ts');
const parents = () => new SessionProgress(initialHero()).roster.entries.map((p, i) => ({ ...p,
  level: 10, isBaby: true, species: i ? 'pangui' : 'tingwa', skillIds: i ? ['armor', 'counter'] : ['combo', 'waterarrow'] }));
const sequence = (...values) => () => values.length ? values.shift() : 0;
test('fusion eligibility and configuration fail closed without randomness', () => {
  const [a, b] = parents();
  assert.equal(FUSION.minLevel, 10);
  for (const [entries, ids, selected, blocked, pool] of [
    [[a, b], [a.id, a.id], 'other', false], [[a], [a.id, b.id], 'other', false],
    [[{ ...a, level: 9 }, b], [a.id, b.id], 'other', false], [[a, b], [a.id, b.id], a.id, false],
    [[a, { ...b, isMutated: true }], [a.id, b.id], 'other', false], [[a, b], [a.id, b.id], 'other', true],
    [[a, b], [a.id, b.id], 'other', false, ['tingwa', 'pangui']],
  ]) assert.throws(() => fusionPlan(entries, ids, selected, blocked, pool));
  assert.deepEqual(fusionPlan([a, b], [a.id, b.id], 'other', false).parents, [a, b]);
  const innate = SKILL_POOLS.tingwa.innate;
  try { SKILL_POOLS.tingwa.innate = Object.keys(PET_SKILLS).slice(0, 9);
    assert.throws(() => fusionPlan([a, b], [a.id, b.id], 'other', false), /配置/);
  } finally { SKILL_POOLS.tingwa.innate = innate; }
});
test('species boundaries, independent factors, caps, low values and baby/wild budgets', () => {
  const [a, b] = parents();
  for (const [roll, species] of [[0, 'tingwa'], [0.4499, 'tingwa'], [0.45, 'pangui'], [0.8999, 'pangui'], [0.9, 'maomaochong'], [1, 'maomaochong']])
    assert.equal(fusePets(a, b, 'fused-1', sequence(roll)).species, species);
  for (const [roll, other, species] of [[0.8999, 0, 'tingwa'], [0.9, 0, 'pangui'], [0.9, 0.5, 'maomaochong'], [1, 1, 'maomaochong']])
    assert.equal(fusePets(a, { ...b, species: 'tingwa' }, 'fused-1', sequence(roll, other)).species, species);
  const low = { ...a, aptitudes: Object.fromEntries(Object.keys(a.aptitudes).map(k => [k, 100])), growth: 0.5 };
  const mixed = fusePets(low, { ...low, id: b.id }, 'fused-1', sequence(0, 0, 0.2, 0.4, 0.6, 0.8, 1, 1));
  assert.deepEqual(Object.values(mixed.aptitudes), [70, 78, 86, 94, 102, 110]); assert.equal(mixed.growth, 0.51);
  for (const isMutated of [false, true]) for (const isBaby of [false, true]) for (const edge of [0, 1]) {
    const left = { ...a, isMutated, isBaby }, right = { ...b, isMutated, level: 11 };
    const before = structuredClone([left, right]), child = fusePets(left, right, 'fused-7', () => edge);
    assert.deepEqual([left, right], before); assert.equal(child.level, 10); assert.equal(child.exp, 0);
    assert.equal(child.origin, 'fused'); assert.equal(child.id, 'fused-7'); assert.equal(child.isMutated, isMutated);
    assert.equal(child.isBaby, isBaby); assert.equal(child.potential, isBaby ? 50 : 0);
    assert.equal(Object.values(child.baseStats).reduce((a, b) => a + b), isBaby ? 100 : 150);
    assert.ok(Object.values(child.baseStats).every(n => n >= (isBaby ? 11 : 1)));
    for (const [key, value] of Object.entries(child.aptitudes)) assert.equal(value, Math.min(
      Math.round((left.aptitudes[key] + right.aptitudes[key]) / 2 * (edge ? 1.1 : 0.7)),
      Math.round(WILD_SPECIES[child.species].aptitudes[key][1] * (isMutated ? 1.18 : 1))));
    assert.equal(child.growth, Math.min(Number(((a.growth + b.growth) / 2 * (edge ? 1.02 : 0.96)).toFixed(3)), WILD_SPECIES[child.species].growth.max));
    assert.deepEqual(Object.fromEntries(Object.keys(petCombat(child)).map(k => [k, child[k]])), petCombat(child));
  }
  for (const value of [-1, NaN, 1.01]) assert.throws(() => fusePets(a, b, 'fused-1', () => value), /随机/);
});
test('parent-specific innate exclusion, deduplication, 40 percent and unbiased truncation', () => {
  const [a, b] = parents();
  assert.deepEqual(fusePets(a, b, 'fused-1', () => 0).skillIds, ['combo', 'waterarrow', 'counter']);
  const left = { ...a, skillIds: ['armor', 'thunder', 'fireball'] }, right = { ...b, skillIds: ['armor', 'thunder'] };
  assert.deepEqual(fusePets(left, right, 'fused-1', () => 0).skillIds, ['armor', 'thunder', 'fireball']);
  assert.deepEqual(fusePets(left, right, 'fused-1', sequence(0, ...Array(7).fill(0), ...Array(45).fill(0), 0.3999, 0.4, 0.4)).skillIds, ['armor']);
  const ids = Object.keys(PET_SKILLS), x = { ...a, skillIds: ids.slice(0, 8) }, y = { ...a, id: b.id, skillIds: ids.slice(4) };
  for (const edge of [0, 1]) {
    const child = fusePets(x, y, 'fused-1', sequence(0, ...Array(7 + 45 + 12).fill(0), ...Array(8).fill(edge)));
    assert.equal(child.skillIds.length, 8); assert.equal(new Set(child.skillIds).size, 8);
    assert.deepEqual(child.skillIds, edge ? ids.slice(4).reverse() : ids.slice(0, 8));
  }
});
