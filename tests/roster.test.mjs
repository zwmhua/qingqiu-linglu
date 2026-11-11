import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { Battle } = await import('../assets/scripts/Battle.ts');
const { CONFIG } = await import('../assets/scripts/config.ts');

const winCapture = (battle, enemyId) => {
  battle.command('hero', 'capture', enemyId);
  battle.command('pet', 'defend');
};

test('roster starts with two distinct initial pets and one usable summon', () => {
  const battle = new Battle(() => 0, 3);
  assert.equal(battle.roster.entries.length, 2);
  assert.equal(battle.roster.capacity, 5);
  assert.equal(CONFIG.maxCarriedPets, 5);
  assert.equal(new Set(battle.roster.entries.map(pet => pet.id)).size, 2);
  assert.deepEqual(battle.roster.entries.map(pet => pet.origin), ['initial', 'initial']);
  assert.deepEqual(battle.summonTargets().map(pet => pet.id), ['pet-2']);
});

test('successful capture adds one independent wild pet, without summon eligibility', () => {
  const battle = new Battle(() => 0, 3);
  winCapture(battle, 'enemy-0');
  assert.equal(battle.roster.entries.length, 3);
  const caught = battle.roster.entries[2];
  assert.equal(caught.name, '汀蛙');
  assert.equal(caught.origin, 'captured');
  assert.equal(caught.hp, 33);
  assert.notEqual(caught.id, 'enemy-0');
  assert.ok(!battle.allies.some(unit => unit.id === caught.id));
  assert.deepEqual(battle.summonTargets().map(pet => pet.id), ['pet-2']);
  assert.equal(battle.winner, null);
  assert.throws(() => battle.command('hero', 'capture', 'enemy-0'));
  assert.equal(battle.roster.addCaptured(battle.enemies[0]), false);
  assert.equal(battle.roster.entries.length, 3);
});

test('three captures fill five slots; full roster rejects without spending command or rolling', () => {
  const battle = new Battle(() => 0, 3);
  for (let i = 0; i < 3; i++) winCapture(battle, `enemy-${i}`);
  assert.equal(battle.roster.entries.length, 5);
  assert.equal(new Set(battle.roster.entries.map(pet => pet.id)).size, 5);
  assert.equal(battle.winner, 'ally');
  let rejectedRolls = 0;
  const next = new Battle(() => { rejectedRolls++; return 0; }, 1);
  // A full roster is also guarded at the command boundary, before resolution.
  next.roster.entries.push(...battle.roster.entries.slice(2));
  assert.throws(() => next.command('hero', 'capture', 'enemy-0'), /携带已满（5\/5），无法抓取/);
  assert.equal(next.commands.size, 0);
  assert.equal(rejectedRolls, 0);
  assert.equal(next.enemies[0].left, false);
  assert.equal(next.roster.entries.length, 5);
  next.command('hero', 'defend');
  next.command('pet', 'attack', 'enemy-0');
  assert.equal(next.round, 2);
});

test('failed capture adds nothing and a new battle starts with two', () => {
  const battle = new Battle(() => 0.99, 1);
  winCapture(battle, 'enemy-0');
  assert.equal(battle.roster.entries.length, 2);
  assert.equal(battle.enemies[0].left, false);
  assert.equal(new Battle(() => 0, 1).roster.entries.length, 2);
});
