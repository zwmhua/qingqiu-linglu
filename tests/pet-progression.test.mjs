import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !specifier.endsWith('.ts')
    ? `${specifier}.ts` : specifier, context);
} });

const { Battle } = await import('../assets/scripts/Battle.ts');
const { initialHero, adjustPotential } = await import('../assets/logic/hero-progress.ts');
const { petProgress } = await import('../assets/logic/roster.ts');
const { wildCombat } = await import('../assets/logic/wild-encounter.ts');
const { petPanel } = await import('../assets/logic/pet-panel.ts');
const { readProgress, saveProgress, resetProgress } = await import('../assets/logic/local-progress.ts');
const make = ({ count = 1, previous, selectedPetId, babies = [], roll = 0 } = {}) =>
  new Battle(() => 0, count, 0, previous, () => babies.shift() ?? 1,
    () => 0, () => 0, () => 0, () => 0, () => roll, { hero: initialHero(), selectedPetId, petRandom: () => 0 });
const points = pet => Object.values(pet.baseStats).reduce((sum, value) => sum + value, 0);
const panel = pet => [pet.maxHp, pet.attack, pet.defense, pet.speed];
const state = pet => [pet.level, pet.exp, pet.potential];
function orders(battle, hero, target, petCommand = 'defend') {
  battle.command('hero', hero, target);
  battle.command(battle.selectedPetId, petCommand, target);
}

test('formal pet panel rounds each stat once and uses effective level for babies', () => {
  const baby = { level: 0, growth: 1.2, aptitudes: { stamina: 4000, mana: 1500, attack: 1200,
    defense: 1100, speed: 1300, dodge: 1100 },
  baseStats: { constitution: 11, mana: 8, strength: 12, endurance: 9, agility: 10 } };
  const expected = { maxHp: 83, maxMana: 32, attack: 19, defense: 17, speed: 13, dodge: 11, spirit: 16 };
  assert.deepEqual(petPanel(baby), expected);
  assert.deepEqual(petPanel({ ...baby, level: 1 }), expected);
});

test('preview and normal battles share the once-per-victory pet experience path', async () => {
  const source = (await import('node:fs')).readFileSync(new URL('../assets/scripts/BattleView.ts', import.meta.url), 'utf8');
  assert.equal([...source.matchAll(/if \(PREVIEW && params\.get\('(?:mutation|baby)Sample'\)[^;]+\{ hero, selectedPetId \}\);/g)].length, 2);
  const battle = make({ count: 3, babies: [0], roll: 0.4 });
  battle.allies[0].hp = 500;
  orders(battle, 'capture', 'enemy-0');
  orders(battle, 'capture', 'enemy-1');
  const [first, unused, baby, captured] = battle.roster.entries;
  for (const id of [baby.id, first.id, baby.id]) orders(battle, 'summon', id);
  battle.pets.find(pet => pet.id === first.id).hp = 0;
  battle.enemies[2].hp = 1;
  orders(battle, 'defend', 'enemy-2', 'attack');
  assert.equal(battle.winner, 'ally');
  assert.equal(battle.earnedExp, 38);
  assert.deepEqual(state(battle.heroProgress), [2, 8, 10]);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual([first, unused, baby, captured].map(state), [[2, 18, 5], [1, 0, 0], [2, 8, 10], [3, 0, 0]]);
    battle.checkWinner();
  }
  const loss = make();
  orders(loss, 'flee', undefined, 'retreat');
  assert.equal(loss.winner, 'enemy');
  assert.deepEqual(loss.roster.entries.map(state), [[1, 0, 0], [1, 0, 0]]);
});

test('baby growth, confirmed allocation and restored combat keep one individual', async t => {
  const capture = make({ babies: [0], roll: 0.4 });
  orders(capture, 'capture', 'enemy-0');
  const before = capture.roster.entries[2];
  assert.deepEqual([state(before), points(before)], [[0, 0, 0], 50]);
  const battle = make({ previous: capture.roster, selectedPetId: before.id });
  battle.enemies[0].hp = 1;
  orders(battle, 'defend', 'enemy-0', 'attack');
  const baby = battle.roster.entries[2];
  assert.deepEqual([state(baby), points(baby), panel(baby)], [[1, 0, 5], 55, [258, 5, 5, 2]]);
  const unit = battle.pets.find(pet => pet.id === baby.id);
  assert.equal(unit.hp, 258);
  assert.equal(battle.pets.find(pet => pet.id === baby.id).combatLevel, 1);
  assert.deepEqual(Object.values(baby.baseStats), Object.values(before.baseStats).map(value => value + 1));
  for (const key of ['id', 'species', 'name', 'isBaby', 'isMutated', 'aptitudes', 'growth'])
    assert.deepEqual(baby[key], before[key]);

  const values = new Map([['other', 'keep']]);
  const storage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  saveProgress(storage, battle);
  const progress = petProgress(baby);
  const { HoldRepeat } = await import('../assets/logic/hold-repeat.ts');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const repeat = new HoldRepeat();
  let draft = progress;
  for (const change of [1, -1]) {
    repeat.start(() => {
      draft = adjustPotential(progress, draft, 'strength', change);
      return change === 1 ? draft.potential > 0 : draft.stats.strength > progress.stats.strength;
    });
    for (let i = 0; i < 5; i++) t.mock.timers.tick(350);
    assert.equal(draft.potential, change === 1 ? 0 : progress.potential);
  }
  assert.deepEqual(draft, progress);
  const onePoint = adjustPotential(progress, progress, 'strength', 1);
  assert.deepEqual(adjustPotential(progress, onePoint, 'strength', -1), progress);
  const preview = adjustPotential(progress, adjustPotential(progress, onePoint, 'strength', 1), 'constitution', 1);
  assert.deepEqual([panel(baby), panel(unit)], [[258, 5, 5, 2], [258, 5, 5, 2]]);
  assert.deepEqual(readProgress(storage).pets[2], baby);
  const persist = pet => saveProgress(storage, battle, undefined, pet);
  assert.throws(() => battle.confirmPetAllocation(baby.id, preview, () => { throw new Error('写入失败'); }), /写入失败/);
  assert.deepEqual(petProgress(baby), progress);
  assert.equal(battle.confirmPetAllocation(baby.id, preview, persist), true);
  const saved = readProgress(storage);
  const restored = make({ previous: { entries: saved.pets }, selectedPetId: saved.selectedPetId });
  const same = restored.roster.entries[2];
  assert.deepEqual([same.baseStats.strength, same.potential, panel(same)], [before.baseStats.strength + 3, 2, [263, 7, 5, 2]]);
  assert.deepEqual(same, { ...battle.roster.entries[2], hp: 263 });
  assert.deepEqual(panel(unit), panel(same));
  assert.deepEqual(panel(restored.pets.find(pet => pet.id === same.id)), panel(same));
  assert.equal(adjustPotential(petProgress(same), petProgress(same), 'strength', -1).stats.strength, same.baseStats.strength);
  assert.equal(restored.confirmPetAllocation(same.id, preview, persist), false);
  restored.roster.awardExperience(new Set([same.id]), 10000);
  assert.deepEqual([state(same), points(same) + same.potential, panel(same)], [[20, 0, 97], 250, [440, 85, 67, 19]]);
  restored.roster.awardExperience(new Set([same.id]), 100);
  assert.deepEqual(state(same), [20, 0, 97]);
  assert.equal(resetProgress(storage, false), false);
  assert.deepEqual(readProgress(storage), saved);
  saveProgress(storage, restored);
  const capped = readProgress(storage);
  assert.deepEqual(state(capped.pets[2]), [20, 0, 97]);
  assert.equal(capped.pets[2].isBaby, true);
  assert.equal(resetProgress(storage, true), true);
  assert.equal(readProgress(storage), null);
  assert.deepEqual([...values], [['other', 'keep']]);
});

test('legacy pet records restore unchanged with zero experience and potential', () => {
  const battle = make();
  let raw;
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
  saveProgress(storage, battle);
  const legacy = JSON.parse(raw);
  legacy.version = 2;
  for (const pet of legacy.pets) Object.assign(pet, wildCombat(pet.species, pet.level));
  raw = JSON.stringify(legacy);
  assert.deepEqual(readProgress(storage).pets, battle.roster.entries);
  legacy.version = 1;
  for (const pet of legacy.pets) { delete pet.exp; delete pet.potential; }
  raw = JSON.stringify(legacy);
  assert.deepEqual(readProgress(storage).pets, battle.roster.entries);
});

test('all three temporary panels keep their coefficients through level 20', () => {
  for (const [species, low, two, five, twenty] of [
    ['tingwa', [33, 10, 9, 9], [37, 10, 9, 9], [49, 12, 11, 11], [109, 19, 18, 18]],
    ['pangui', [45, 9, 13, 7], [51, 9, 14, 7], [69, 11, 17, 9], [159, 18, 32, 16]],
    ['maomaochong', [26, 14, 7, 10], [29, 14, 7, 10], [38, 16, 9, 12], [83, 23, 16, 19]],
  ]) assert.deepEqual([0, 1, 2, 5, 20].map(level => panel(wildCombat(species, level))), [low, low, two, five, twenty]);
});
