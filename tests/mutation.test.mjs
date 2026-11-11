import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { MUTATION_CONFIG, isMutation, mutateAptitudes } = await import('../assets/logic/mutation.ts');
const { APTITUDE_KEYS, APTITUDE_RANGES } = await import('../assets/logic/aptitude.ts');
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

test('only successful capture rolls mutation once; failed or dead targets never roll', () => {
  for (const [captureRoll, downed, expected] of [[0, false, 1], [1, false, 0], [0, true, 0]]) {
    let rolls = 0;
    const battle = new Battle(() => captureRoll, 1, 0, undefined, () => 1,
      () => 0, () => 0, () => 0, () => { rolls++; return 0; });
    battle.command('hero', 'capture', battle.enemies[0].id);
    if (downed) battle.enemies[0].hp = 0;
    battle.command('pet', 'defend');
    assert.equal(rolls, expected);
    assert.equal(battle.roster.entries.length, 2 + expected);
  }
  let normalRolls = 0;
  const normal = new Battle(() => 0, 1, 0, undefined, () => 1,
    () => 0, () => 0, () => 0, () => { normalRolls++; return 0.25; });
  normal.command('hero', 'capture', normal.enemies[0].id);
  normal.command('pet', 'defend');
  assert.equal(normalRolls, 1);
  assert.equal(normal.roster.entries[2].isMutated, false);
  const formerNormal = new Battle(() => 0, 1, 0, undefined, () => 1,
    () => 0, () => 0, () => 0, () => 0.025);
  formerNormal.command('hero', 'capture', formerNormal.enemies[0].id);
  formerNormal.command('pet', 'defend');
  assert.equal(formerNormal.roster.entries[2].isMutated, true);
});

test('baby mutation keeps growth, base stats and combat values through summon and next battle', () => {
  const battle = new Battle(() => 0, 2, 0, undefined, () => 0,
    () => 1, () => 0, () => 0.6, () => 0);
  const baby = battle.enemies[0];
  const original = { aptitudes: { ...baby.aptitudes }, growth: baby.growth,
    baseStats: { ...baby.baseStats }, combat: [baby.maxHp, baby.attack, baby.defense, baby.speed] };
  battle.command('hero', 'capture', baby.id);
  battle.command('pet', 'defend');
  const caught = battle.roster.entries[2];
  assert.equal(caught.isBaby, true);
  assert.equal(caught.isMutated, true);
  for (const key of APTITUDE_KEYS) assert.equal(caught.aptitudes[key], Math.round(original.aptitudes[key] * 1.18));
  assert.equal(caught.growth, original.growth);
  assert.deepEqual(caught.baseStats, original.baseStats);
  assert.deepEqual([caught.maxHp, caught.attack, caught.defense, caught.speed], original.combat);
  assert.ok(battle.log.some(line => line.includes('变异')));
  battle.command('hero', 'summon', caught.id);
  battle.command('pet', 'defend');
  assert.equal(battle.pets.find(pet => pet.id === caught.id).isMutated, true);
  const next = new Battle(() => 0.5, 1, 0, battle.roster, () => 1,
    () => 0, () => 0, () => 0, () => { throw new Error('re-rolled mutation'); });
  assert.deepEqual(next.roster.entries[2].aptitudes, caught.aptitudes);
  assert.equal(next.summonTargets().find(pet => pet.id === caught.id).isMutated, true);
  assert.equal(next.roster.entries[0].isMutated, false);
});
