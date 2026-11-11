import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { MUTATION_CONFIG, isMutation, mutateAptitudes } = await import('../assets/logic/mutation.ts');
const { APTITUDE_KEYS, APTITUDE_RANGES, generateAptitudes } = await import('../assets/logic/aptitude.ts');
const { Battle } = await import('../assets/scripts/Battle.ts');

test('mutation boundary is exactly 25% and boosts all six without a cap', () => {
  assert.deepEqual(MUTATION_CONFIG, { rate: 0.25, multiplier: 1.18 });
  assert.equal(isMutation(0, MUTATION_CONFIG.rate), true);
  assert.equal(isMutation(0.025, MUTATION_CONFIG.rate), true);
  assert.equal(isMutation(0.249999, MUTATION_CONFIG.rate), true);
  assert.equal(isMutation(0.25, MUTATION_CONFIG.rate), false);
  const highs = Object.fromEntries(APTITUDE_KEYS.map(key => [key, APTITUDE_RANGES[key][1]]));
  const boosted = mutateAptitudes(highs, MUTATION_CONFIG.multiplier);
  for (const key of APTITUDE_KEYS) {
    assert.equal(boosted[key], Math.round(highs[key] * 1.18));
    assert.ok(boosted[key] > 130);
    assert.equal(highs[key], APTITUDE_RANGES[key][1]);
  }
  assert.equal(mutateAptitudes({ ...highs, attack: 999 }, 1.18).attack, 1179);
});

test('each wild encounter rolls mutation once, independently of baby identity', () => {
  const values = [0, 0.25, 0.249999];
  let rolls = 0;
  const battle = new Battle(() => 0.5, 3, 0, undefined,
    () => rolls === 1 ? 1 : 0, () => 0, () => 0, () => 0,
    () => values[rolls++]);
  assert.equal(rolls, 3);
  assert.deepEqual(battle.enemies.map(enemy => [enemy.isBaby, enemy.isMutated]),
    [[true, true], [false, false], [true, true]]);
  for (const enemy of battle.enemies) {
    const base = generateAptitudes(!!enemy.isBaby, () => 0);
    assert.deepEqual(enemy.aptitudes, enemy.isMutated
      ? mutateAptitudes(base, MUTATION_CONFIG.multiplier) : base);
  }
  assert.deepEqual(battle.roster.entries.map(pet => pet.isMutated), [false, false]);
});

test('capture copies encountered mutation; success, failure and downed targets never reroll', () => {
  for (const [captureRoll, downed, expectedCount] of [[0, false, 3], [1, false, 2], [0, true, 2]]) {
    let rolls = 0;
    const battle = new Battle(() => captureRoll, 1, 0, undefined, () => 1,
      () => 0, () => 0, () => 0, () => { if (++rolls > 1) throw new Error('mutation rerolled'); return 0; });
    const wild = battle.enemies[0];
    assert.equal(wild.isMutated, true);
    const aptitudes = { ...wild.aptitudes };
    battle.command('hero', 'capture', wild.id);
    if (downed) wild.hp = 0;
    battle.command('pet', 'defend');
    assert.equal(rolls, 1);
    assert.equal(battle.roster.entries.length, expectedCount);
    if (expectedCount === 3) {
      assert.equal(battle.roster.entries[2].isMutated, wild.isMutated);
      assert.deepEqual(battle.roster.entries[2].aptitudes, aptitudes);
    } else assert.equal(wild.isMutated, true);
  }
  const normal = new Battle(() => 0, 1, 0, undefined, () => 1,
    () => 0, () => 0, () => 0, () => 0.25);
  normal.command('hero', 'capture', normal.enemies[0].id);
  normal.command('pet', 'defend');
  assert.equal(normal.roster.entries[2].isMutated, false);
});

test('redirected capture keeps the new wild target mutation without reroll', () => {
  let rolls = 0;
  const battle = new Battle(() => 0, 2, 0, undefined, () => 1,
    () => 0, () => 0, () => 0, () => { rolls++; return rolls === 2 ? 0 : 0.25; });
  battle.command('hero', 'capture', battle.enemies[0].id);
  battle.enemies[0].hp = 0;
  battle.command('pet', 'defend');
  assert.equal(rolls, 2);
  assert.equal(battle.roster.entries[2].sourceEnemyId, battle.enemies[1].id);
  assert.equal(battle.roster.entries[2].isMutated, true);
  assert.deepEqual(battle.roster.entries[2].aptitudes, battle.enemies[1].aptitudes);
});

test('baby mutation keeps growth, base stats and combat values through summon and next battle', () => {
  const battle = new Battle(() => 0, 2, 0, undefined, () => 0,
    () => 1, () => 0, () => 0.6, () => 0);
  const baby = battle.enemies[0];
  assert.equal(baby.isBaby, true);
  assert.equal(baby.isMutated, true);
  const original = { aptitudes: { ...baby.aptitudes }, growth: baby.growth,
    baseStats: { ...baby.baseStats }, combat: [baby.maxHp, baby.attack, baby.defense, baby.speed] };
  battle.command('hero', 'capture', baby.id);
  battle.command('pet', 'defend');
  const caught = battle.roster.entries[2];
  assert.equal(caught.isBaby, true);
  assert.equal(caught.isMutated, true);
  assert.deepEqual(caught.aptitudes, original.aptitudes);
  assert.equal(caught.growth, original.growth);
  assert.deepEqual(caught.baseStats, original.baseStats);
  assert.deepEqual([caught.maxHp, caught.attack, caught.defense, caught.speed], original.combat);
  assert.ok(battle.log.some(line => line.includes('变异')));
  battle.command('hero', 'summon', caught.id);
  battle.command('pet', 'defend');
  assert.equal(battle.pets.find(pet => pet.id === caught.id).isMutated, true);
  let nextRolls = 0;
  const next = new Battle(() => 0.5, 1, 0, battle.roster, () => 1,
    () => 0, () => 0, () => 0, () => { nextRolls++; return 1; });
  assert.equal(nextRolls, 1);
  assert.deepEqual(next.roster.entries[2].aptitudes, caught.aptitudes);
  assert.equal(next.summonTargets().find(pet => pet.id === caught.id).isMutated, true);
  assert.equal(next.roster.entries[0].isMutated, false);
});
