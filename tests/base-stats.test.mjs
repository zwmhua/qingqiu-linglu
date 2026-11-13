import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { BASE_STAT_KEYS, BASE_STATS_CONFIG, generateBaseStats, baseStatTotal } =
  await import('../assets/battle/logic/base-stats.ts');
const { Battle } = await import('../assets/battle/scripts/Battle.ts');

test('baby, normal and initial totals are exact and every stat has at least one point', () => {
  assert.equal(BASE_STATS_CONFIG.minPerStat, 1);
  for (const [level, total] of [[0, 50], [1, 60], [3, 80]]) {
    assert.equal(baseStatTotal(level), total);
    for (const roll of [0, 0.25, 0.5, 0.75, 1]) {
      const stats = generateBaseStats(level, () => roll);
      assert.equal(BASE_STAT_KEYS.reduce((sum, key) => sum + stats[key], 0), total);
      assert.ok(BASE_STAT_KEYS.every(key => Number.isInteger(stats[key]) && stats[key] >= 1));
    }
  }
});

test('each stat can receive extras and initial pets roll independently', () => {
  for (let i = 0; i < BASE_STAT_KEYS.length; i++) {
    const stats = generateBaseStats(0, () => (i + 0.1) / BASE_STAT_KEYS.length);
    assert.equal(stats[BASE_STAT_KEYS[i]], 46);
  }
  let calls = 0;
  const battle = new Battle(() => 0.5, 1, 0, undefined, () => 1,
    () => 0, () => 0, () => calls++ < 55 ? 0 : 0.9);
  const [first, second] = battle.roster.entries;
  assert.equal(BASE_STAT_KEYS.reduce((sum, key) => sum + first.baseStats[key], 0), 60);
  assert.equal(BASE_STAT_KEYS.reduce((sum, key) => sum + second.baseStats[key], 0), 60);
  assert.notDeepEqual(first.baseStats, second.baseStats);
});

test('captured baby keeps base stats through summon and next battle without changing combat values', () => {
  const battle = new Battle(() => 0, 2, 0, undefined, () => 0, () => 0,
    () => 0, () => 0.6);
  const baby = battle.enemies[0];
  assert.equal(BASE_STAT_KEYS.reduce((sum, key) => sum + baby.baseStats[key], 0), 50);
  const beforeCombat = [baby.maxHp, baby.attack, baby.defense, baby.speed];
  battle.command('hero', 'capture', baby.id);
  battle.command('pet', 'defend');
  const caught = battle.roster.entries[2];
  assert.deepEqual(caught.baseStats, baby.baseStats);
  battle.command('hero', 'summon', caught.id);
  battle.command('pet', 'defend');
  assert.deepEqual(battle.pets.find(pet => pet.id === caught.id).baseStats, baby.baseStats);
  let nextRolls = 0;
  const next = new Battle(() => 0.5, 1, 0, battle.roster, () => 1,
    () => 1, () => 1, () => { nextRolls++; return 0; });
  assert.equal(nextRolls, 55); // only the new wild level-one frog rolls
  assert.deepEqual(next.roster.entries[0].baseStats, battle.roster.entries[0].baseStats);
  assert.deepEqual(next.roster.entries[1].baseStats, battle.roster.entries[1].baseStats);
  assert.deepEqual(next.roster.entries[2].baseStats, baby.baseStats);
  assert.deepEqual(next.summonTargets().find(pet => pet.id === caught.id).baseStats, baby.baseStats);
  assert.deepEqual([baby.maxHp, baby.attack, baby.defense, baby.speed], beforeCombat);
});
