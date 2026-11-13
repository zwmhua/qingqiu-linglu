import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !specifier.endsWith('.ts')
    ? `${specifier}.ts` : specifier, context);
} });

const { Battle } = await import('../assets/battle/scripts/Battle.ts');
const { initialHero, adjustPotential } = await import('../assets/battle/logic/hero-progress.ts');
const { SessionProgress } = await import('../assets/battle/logic/session-progress.ts');
const { petProgress } = await import('../assets/battle/logic/roster.ts');
const { loadSessionProgress, saveProgress } = await import('../assets/battle/logic/local-progress.ts');

function storage() {
  return { raw: null, fail: false, getItem() { return this.raw; }, setItem(_key, value) {
    if (this.fail) throw new Error('写入失败');
    this.raw = value;
  } };
}

test('one session owns the initial pets, selection, experience and IDs across real battles', () => {
  let rolls = 0;
  const session = new SessionProgress(initialHero(), undefined, undefined, () => { rolls++; return 0; });
  const make = () => new Battle(() => 0, 1, 0, session, () => 1);
  const first = make();
  first.command('hero', 'capture', 'enemy-0');
  first.command('pet', 'defend');
  assert.equal(first.winner, 'ally');
  assert.equal(session.heroProgress.level, 1);
  assert.equal(session.roster.entries[0].exp, 10);
  const second = make();
  second.command('hero', 'summon', 'caught-1');
  second.command('pet', 'defend');
  assert.equal(session.selectedPetId, 'caught-1');
  second.command('hero', 'capture', 'enemy-0');
  second.command('caught-1', 'defend');
  assert.equal(second.winner, 'ally');
  assert.equal(make().pets.find(pet => pet.deployed).id, 'caught-1');
  assert.deepEqual(session.roster.entries.map(pet => pet.id), ['pet', 'pet-2', 'caught-1', 'caught-2']);
  assert.equal(session.roster.nextCapturedId, 3);
  assert.equal(rolls, 2);
});

test('non-battle allocation and release save first, and bad data cannot initialize a new session', () => {
  const disk = storage();
  disk.raw = '{bad';
  assert.throws(() => loadSessionProgress(disk), SyntaxError);
  assert.equal(disk.raw, '{bad');
  const stats = { constitution: 11, mana: 11, strength: 11, endurance: 11, agility: 11 };
  const hero = { level: 1, exp: 0, potential: 5, stats };
  const original = new SessionProgress(hero, undefined, undefined, () => 0);
  const pet = original.roster.entries[0];
  original.roster.awardExperience(new Set([pet.id]), 20);
  const strength = pet.baseStats.strength;
  const heroDraft = adjustPotential(hero, hero, 'constitution', 1);
  const points = petProgress(pet);
  const petDraft = adjustPotential(points, points, 'strength', 1);
  const actions = [
    inBattle => original.confirmHeroAllocation(inBattle, heroDraft, next => saveProgress(disk, original, next)),
    inBattle => original.confirmPetAllocation(inBattle, pet.id, petDraft, next => saveProgress(disk, original, undefined, next)),
    inBattle => original.releasePet(inBattle, 'pet-2', pets => saveProgress(disk, original, undefined, undefined, pets)),
  ];
  saveProgress(disk, original);
  const before = disk.raw;
  disk.fail = true;
  for (const action of actions) {
    assert.equal(action(true), false);
    assert.throws(() => action(false), /写入失败/);
  }
  assert.equal(disk.raw, before);
  assert.equal(original.heroProgress, hero);
  assert.equal(pet.potential, 5);
  assert.equal(original.roster.entries.length, 2);
  assert.equal(original.releasePet(false, pet.id, () => assert.fail('should not write')), false);
  disk.fail = false;
  for (const action of actions) assert.equal(action(false), true);
  const restored = loadSessionProgress(disk);
  assert.equal(restored.heroProgress.stats.constitution, 12);
  assert.equal(restored.roster.entries[0].baseStats.strength, strength + 1);
  assert.deepEqual(restored.roster.entries.map(entry => entry.id), [pet.id]);
  assert.equal(restored.selectedPetId, pet.id);
});
