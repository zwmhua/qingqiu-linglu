import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { APTITUDE_RANGES, APTITUDE_KEYS, generateAptitudes } =
  await import('../assets/logic/aptitude.ts');
const { Battle } = await import('../assets/scripts/Battle.ts');

test('all six normal and baby ranges use the confirmed inclusive boundaries', () => {
  assert.deepEqual(APTITUDE_RANGES, {
    attack: [918, 1080], defense: [714, 840], stamina: [2295, 2700],
    mana: [1020, 1200], dodge: [867, 1020], speed: [1122, 1320],
  });
  assert.equal(APTITUDE_KEYS.length, 6);
  const low = generateAptitudes(false, () => 0);
  const high = generateAptitudes(false, () => 1);
  const babyLow = generateAptitudes(true, () => 0);
  const babyHigh = generateAptitudes(true, () => 1);
  for (const key of APTITUDE_KEYS) {
    const [min, max] = APTITUDE_RANGES[key];
    assert.equal(low[key], min);
    assert.equal(high[key], max);
    assert.equal(babyLow[key], Math.ceil((min + max) / 2));
    assert.equal(babyHigh[key], max);
  }
});

test('each aptitude uses two independent integer rolls and rounds half upward', () => {
  const rolls = [0, 1, 1, 1, ...Array(8).fill(0)];
  let calls = 0;
  const result = generateAptitudes(false, () => rolls[calls++]);
  assert.equal(calls, 12);
  assert.equal(result.attack, 999);
  assert.equal(result.defense, 840);
  for (const key of APTITUDE_KEYS.slice(2)) assert.equal(result[key], APTITUDE_RANGES[key][0]);
});

test('separate wild frogs receive separate six-aptitude samples', () => {
  let rolls = 0;
  const battle = new Battle(() => 0.5, 2, 0, undefined, () => 1, () => rolls++ < 36 ? 0 : 1);
  assert.equal(rolls, 48);
  assert.notStrictEqual(battle.enemies[0].aptitudes, battle.enemies[1].aptitudes);
  for (const key of APTITUDE_KEYS) {
    assert.equal(battle.enemies[0].aptitudes[key], APTITUDE_RANGES[key][0]);
    assert.equal(battle.enemies[1].aptitudes[key], APTITUDE_RANGES[key][1]);
  }
});

test('initial pets independently double-roll normal aptitudes once without changing combat stats', () => {
  let rolls = 0;
  const battle = new Battle(() => 0.5, 1, 0, undefined, () => 1, () => rolls++ < 12 ? 0 : 1);
  assert.equal(rolls, 36);
  for (const pet of battle.pets) {
    assert.equal(pet.level, 1);
    assert.equal(pet.isBaby, false);
    assert.deepEqual([pet.hp, pet.attack, pet.defense, pet.speed], [38, 11, 10, 10]);
  }
  for (const key of APTITUDE_KEYS) {
    assert.equal(battle.pets[0].aptitudes[key], APTITUDE_RANGES[key][0]);
    assert.equal(battle.pets[1].aptitudes[key], APTITUDE_RANGES[key][1]);
  }
  assert.notStrictEqual(battle.pets[0].aptitudes, battle.pets[1].aptitudes);
  const next = new Battle(() => 0.5, 1, 0, battle.roster, () => 1, () => rolls++);
  assert.deepEqual(next.roster.entries.map(pet => pet.aptitudes), battle.roster.entries.map(pet => pet.aptitudes));
  assert.equal(rolls, 48);
});

test('capture, summon and next battle keep each pet aptitude and battle values', () => {
  const battle = new Battle(() => 0, 2, 0, undefined, () => 0, () => 0);
  const baby = battle.enemies[0];
  const original = { ...baby.aptitudes };
  assert.deepEqual([baby.hp, baby.attack, baby.defense, baby.speed], [33, 10, 9, 9]);
  battle.command('hero', 'capture', baby.id);
  battle.command('pet', 'defend');
  const caught = battle.roster.entries[2];
  assert.deepEqual(caught.aptitudes, original);
  assert.equal(caught.isBaby, true);
  assert.equal(caught.level, 0);
  assert.deepEqual(battle.summonTargets().find(pet => pet.id === caught.id)?.aptitudes, original);
  battle.command('hero', 'summon', caught.id);
  battle.command('pet', 'defend');
  assert.deepEqual(battle.pets.find(pet => pet.id === caught.id).aptitudes, original);
  const next = new Battle(() => 0.5, 1, 0, battle.roster, () => 1, () => 1);
  assert.deepEqual(next.roster.entries[0].aptitudes, battle.roster.entries[0].aptitudes);
  assert.deepEqual(next.roster.entries[2].aptitudes, original);
  assert.deepEqual(next.summonTargets().find(pet => pet.id === caught.id)?.aptitudes, original);
  assert.deepEqual([next.roster.entries[2].hp, next.roster.entries[2].attack,
    next.roster.entries[2].defense, next.roster.entries[2].speed], [33, 10, 9, 9]);
});
