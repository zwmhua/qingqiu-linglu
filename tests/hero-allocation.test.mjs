import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !specifier.endsWith('.ts')
    ? `${specifier}.ts` : specifier, context);
} });

const { Battle } = await import('../assets/scripts/Battle.ts');
const { adjustPotential, awardExperience, heroPanel, initialHero } = await import('../assets/logic/hero-progress.ts');
const { readProgress, saveProgress, resetProgress } = await import('../assets/logic/local-progress.ts');
const makeBattle = (hero, pets) => new Battle(() => 0, 1, 0, pets && { entries: pets },
  undefined, undefined, undefined, undefined, undefined, undefined, { hero });

test('04b previews the rounded panel without changing confirmed points', () => {
  const hero = awardExperience(initialHero(), 10);
  let preview = hero;
  for (let i = 0; i < 5; i++) preview = adjustPotential(hero, preview, 'strength', 1);
  const { attack, speed, spirit } = heroPanel(preview.stats);
  assert.deepEqual([preview.stats.strength, preview.potential, attack, speed, spirit], [16, 0, 11, 12, 20]);
  assert.equal(adjustPotential(hero, preview, 'agility', 1), preview);
  const returned = adjustPotential(hero, preview, 'strength', -1);
  assert.deepEqual([returned.stats.strength, returned.potential], [15, 1]);
  assert.equal(adjustPotential(hero, returned, 'endurance', -1), returned);
  assert.deepEqual([hero.stats.strength, hero.potential, heroPanel(hero.stats).attack], [11, 5, 7]);
});

test('04b commits partial allocation after battle, restores it and keeps 04a progress', () => {
  const values = new Map([['other', 'keep']]);
  const storage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const hero = awardExperience(initialHero(), 10);
  const battle = makeBattle(hero);
  const plus = preview => adjustPotential(hero, preview, 'strength', 1);
  const preview = plus(plus(hero));
  const persist = next => saveProgress(storage, battle, next);
  saveProgress(storage, battle);
  assert.equal(battle.confirmHeroAllocation(preview, persist), false);
  assert.deepEqual(readProgress(storage).hero, hero);
  assert.equal(battle.allies[0].attack, 7);
  for (const unit of battle.allies) unit.hp = 0;
  assert.equal(battle.checkWinner(), 'enemy');
  assert.throws(() => battle.confirmHeroAllocation(preview, () => { throw new Error('存储失败'); }), /存储失败/);
  assert.deepEqual(battle.heroProgress, hero);
  assert.equal(battle.confirmHeroAllocation(preview, persist), true);
  const saved = readProgress(storage);
  assert.deepEqual([saved.hero.stats.strength, saved.hero.potential, battle.allies[0].attack], [13, 3, 9]);
  assert.equal(adjustPotential(saved.hero, saved.hero, 'strength', -1), saved.hero);
  assert.equal(battle.confirmHeroAllocation(hero, persist), false);
  assert.equal(makeBattle(saved.hero, saved.pets).allies[0].attack, 9);
  const leveled = awardExperience(saved.hero, 20);
  assert.deepEqual([leveled.level, leveled.stats.strength, leveled.potential], [2, 14, 8]);
  assert.equal(resetProgress(storage, false), false);
  assert.deepEqual(readProgress(storage).hero, saved.hero);
  assert.equal(resetProgress(storage, true), true);
  assert.equal(readProgress(storage), null);
  assert.deepEqual(makeBattle(initialHero()).heroProgress, initialHero());
  assert.deepEqual([...values], [['other', 'keep']]);
});
