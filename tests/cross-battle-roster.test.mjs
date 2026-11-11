import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { Battle } = await import('../assets/scripts/Battle.ts');

function capture(battle, enemyId = 'enemy-0') {
  battle.command('hero', 'capture', enemyId);
  battle.command(battle.pets.find(pet => pet.deployed).id, 'defend');
}

test('a captured pet keeps its real stats and identity, then returns at full health after victory', () => {
  const first = new Battle(() => 0, 2);
  assert.equal(first.roster.entries.length, 2);
  assert.equal(first.roster.capacity, 5);
  Object.assign(first.enemies[0], { hp: 8, maxHp: 41, level: 3,
    attack: 19, defense: 14, speed: 12, skill: 'dew_shot' });
  capture(first);
  const caught = first.roster.entries[2];
  assert.equal(caught.hp, 8);
  assert.equal(first.pets.find(pet => pet.id === caught.id).hp, 8);
  first.pets[0].hp = 1;
  first.pets[1].hp = 0;
  first.enemies[1].hp = 0;
  assert.equal(first.checkWinner(), 'ally');
  const oldPets = first.pets.map(pet => ({ id: pet.id, hp: pet.hp }));
  const oldRoster = structuredClone(first.roster.entries);
  const oldLog = [...first.log];

  const next = new Battle(() => 0, 1, first.heroRage, first.roster);
  assert.equal(next.roster.entries.length, 3);
  assert.equal(next.roster.capacity, 5);
  assert.deepEqual(next.roster.entries.map(pet => pet.id), first.roster.entries.map(pet => pet.id));
  assert.deepEqual(next.roster.entries.map(pet => pet.hp), next.roster.entries.map(pet => pet.maxHp));
  assert.deepEqual(next.pets.map(pet => pet.hp), next.pets.map(pet => pet.maxHp));
  assert.deepEqual(next.roster.entries[2], { ...caught, hp: caught.maxHp });
  assert.deepEqual([next.pets[2].level, next.pets[2].attack, next.pets[2].defense,
    next.pets[2].speed, next.pets[2].skill], [3, 19, 14, 12, 'dew_shot']);
  assert.deepEqual(next.pets.filter(pet => pet.deployed).map(pet => pet.id), ['pet']);
  assert.deepEqual(next.summonTargets().map(pet => pet.id), ['pet-2', caught.id]);
  assert.equal(next.summonsUsed, 0);
  next.command('hero', 'summon', caught.id);
  next.command('pet', 'defend');
  assert.equal(next.pets.find(pet => pet.id === caught.id).deployed, true);
  assert.equal(next.pets.filter(pet => pet.deployed).length, 1);
  assert.equal(next.summonsUsed, 1);
  assert.deepEqual(first.pets.map(pet => ({ id: pet.id, hp: pet.hp })), oldPets);
  assert.deepEqual(first.roster.entries, oldRoster);
  assert.deepEqual(first.log, oldLog);
});

test('a defeat also retains captured pets; a fresh session starts with two', () => {
  const first = new Battle(() => 0, 2);
  capture(first);
  for (const ally of first.allies.filter(unit => unit.deployed)) ally.hp = 0;
  assert.equal(first.checkWinner(), 'enemy');
  const next = new Battle(() => 0, 1, first.heroRage, first.roster);
  assert.equal(next.roster.entries.length, 3);
  assert.equal(next.pets[2].hp, next.pets[2].maxHp);
  assert.equal(new Battle(() => 0, 1).roster.entries.length, 2);
});

test('reused enemy IDs across battles make unique pets and capacity still blocks capture', () => {
  const first = new Battle(() => 0, 2);
  capture(first);
  const firstId = first.roster.entries[2].id;
  const second = new Battle(() => 0, 2, 0, first.roster);
  capture(second);
  const secondId = second.roster.entries[3].id;
  assert.notEqual(secondId, firstId);
  assert.equal(first.roster.entries.length, 3);
  assert.equal(second.roster.entries.length, 4);
  const third = new Battle(() => 0, 1, 0, second.roster);
  capture(third);
  assert.equal(third.roster.entries.length, 5);
  assert.equal(new Set(third.roster.entries.map(pet => pet.id)).size, 5);
  const full = new Battle(() => 0, 1, 0, third.roster);
  assert.throws(() => full.command('hero', 'capture', 'enemy-0'), /携带已满/);
  assert.equal(full.commands.size, 0);
  assert.equal(full.enemies[0].left, false);
});
