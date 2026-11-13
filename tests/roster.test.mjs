import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { Battle } = await import('../assets/battle/scripts/Battle.ts');
const { CONFIG } = await import('../assets/battle/scripts/config.ts');
const { petPanel } = await import('../assets/battle/logic/pet-panel.ts');
const { initialHero } = await import('../assets/battle/logic/hero-progress.ts');
const { readProgress, resetProgress, saveProgress } = await import('../assets/battle/logic/local-progress.ts');

const winCapture = (battle, enemyId) => {
  battle.command('hero', 'capture', enemyId);
  battle.command(battle.selectedPetId, 'defend');
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

test('successful capture adds one independent wild pet with summon eligibility', () => {
  const battle = new Battle(() => 0, 3, 0, undefined, () => 1);
  winCapture(battle, 'enemy-0');
  assert.equal(battle.roster.entries.length, 3);
  const caught = battle.roster.entries[2];
  assert.equal(caught.name, '汀蛙');
  assert.equal(caught.origin, 'captured');
  assert.equal(caught.hp, Math.min(33, caught.maxHp));
  assert.notEqual(caught.id, 'enemy-0');
  assert.equal(battle.allies.filter(unit => unit.id === caught.id).length, 1);
  assert.deepEqual(battle.summonTargets().map(pet => pet.id), ['pet-2', caught.id]);
  assert.equal(battle.winner, null);
  assert.throws(() => battle.command('hero', 'capture', 'enemy-0'));
  assert.equal(battle.roster.addCaptured(battle.enemies[0]), false);
  assert.equal(battle.roster.entries.length, 3);
});

test('a captured pet can be summoned from the next hero command with its captured HP', () => {
  const battle = new Battle(() => 0, 2);
  battle.enemies[0].hp = 8;
  battle.command('hero', 'capture', 'enemy-0');
  assert.throws(() => battle.command('hero', 'summon', 'pet-2'));
  battle.command('pet', 'defend');
  assert.equal(battle.round, 2);
  const caught = battle.roster.entries[2];
  const incoming = battle.summonTargets().find(pet => pet.id === caught.id);
  assert.ok(incoming);
  assert.equal(incoming.hp, 8);
  const { maxHp, attack, speed } = petPanel(caught);
  assert.deepEqual([incoming.maxHp, incoming.attack, incoming.speed], [maxHp, attack, speed]);
  battle.command('hero', 'summon', caught.id);
  battle.command('pet', 'defend');
  assert.equal(battle.pets.find(pet => pet.id === 'pet').deployed, false);
  assert.equal(incoming.deployed, true);
  assert.equal(incoming.hp, 8);
  assert.equal(battle.pets.filter(pet => pet.deployed).length, 1);
  assert.equal(battle.allies.filter(unit => unit.id === caught.id).length, 1);
  assert.equal(battle.roster.entries.length, 3);
  assert.equal(battle.winner, null);
  assert.equal(battle.summonsUsed, 1);
});

test('three captures fill five slots; full roster rejects without spending command or rolling', () => {
  const battle = new Battle(() => 0, 3);
  for (let i = 0; i < 3; i++) winCapture(battle, `enemy-${i}`);
  assert.equal(battle.roster.entries.length, 5);
  assert.equal(new Set(battle.roster.entries.map(pet => pet.id)).size, 5);
  assert.equal(battle.winner, 'ally');
  let rejectedRolls = 0;
  const next = new Battle(() => { rejectedRolls++; return 0; }, 1, 0, undefined, () => 1);
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

test('release rejects an active battle, the deployed pet and the last pet', () => {
  const battle = new Battle(() => 0, 1);
  const unexpectedSave = () => assert.fail('blocked release must not save');
  assert.equal(battle.petReleaseBlock('pet-2'), '战斗中不能放生');
  assert.equal(battle.releasePet('pet-2', unexpectedSave), false);
  winCapture(battle, 'enemy-0');
  assert.equal(battle.petReleaseBlock('pet'), '出战中的召唤兽不能放生');
  assert.equal(battle.releasePet('pet', unexpectedSave), false);
  assert.equal(battle.releasePet('caught-1', () => {}), true);
  assert.equal(battle.releasePet('pet-2', () => {}), true);
  assert.deepEqual(battle.roster.entries.map(pet => pet.id), ['pet']);
  assert.equal(battle.petReleaseBlock('pet'), '出战中的召唤兽不能放生');
  assert.equal(battle.releasePet('pet', unexpectedSave), false);
});

test('release saves before removal, restores one carried pet and frees a capture slot', () => {
  const make = (count, previous, selectedPetId) => new Battle(() => 0, count, 0, previous, () => 1,
    undefined, undefined, undefined, () => 1, undefined, { hero: initialHero(), selectedPetId });
  let value = null;
  const storage = { getItem: () => value, setItem: (_key, next) => { value = next; },
    removeItem: () => { value = null; } };
  const battle = make(3, undefined, 'pet-2');
  for (let i = 0; i < 3; i++) winCapture(battle, `enemy-${i}`);
  assert.equal(battle.roster.full, true);
  const heroBefore = structuredClone(battle.heroProgress);
  assert.throws(() => battle.releasePet('caught-3', () => { throw new Error('写入失败'); }), /写入失败/);
  assert.equal(battle.roster.entries.length, 5);
  const persist = entries => saveProgress(storage, battle, undefined, undefined, entries);
  assert.equal(battle.releasePet('caught-3', persist), true);
  assert.equal(battle.roster.full, false);
  assert.equal(battle.roster.entries.length, 4);
  assert.equal(battle.pets.some(pet => pet.id === 'caught-3'), false);
  assert.deepEqual(battle.heroProgress, heroBefore);
  let saved = readProgress(storage);
  let next = make(1, { entries: saved.pets, nextCapturedId: saved.nextCapturedId }, saved.selectedPetId);
  winCapture(next, 'enemy-0');
  assert.equal(next.roster.full, true);
  assert.deepEqual(next.roster.entries.map(pet => pet.id), ['pet', 'pet-2', 'caught-1', 'caught-2', 'caught-4']);

  for (const id of ['pet', 'caught-1', 'caught-2', 'caught-4']) {
    assert.equal(next.releasePet(id, entries => saveProgress(storage, next, undefined, undefined, entries)), true);
  }
  saved = readProgress(storage);
  next = make(1, { entries: saved.pets, nextCapturedId: saved.nextCapturedId }, saved.selectedPetId);
  assert.deepEqual(next.pets.map(pet => [pet.id, pet.deployed]), [['pet-2', true]]);
  assert.equal(make(1, { entries: saved.pets }).selectedPetId, 'pet-2');
  assert.equal(resetProgress(storage, true), true);
  assert.equal(readProgress(storage), null);
  assert.equal(make(1).roster.entries.length, 2);
});
