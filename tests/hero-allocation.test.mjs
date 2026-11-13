import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !specifier.endsWith('.ts')
    ? `${specifier}.ts` : specifier, context);
} });

const { Battle } = await import('../assets/battle/scripts/Battle.ts');
const { adjustPotential, awardExperience, heroPanel, heroPanelPreview, initialHero } = await import('../assets/battle/logic/hero-progress.ts');
const { readProgress, saveProgress, resetProgress } = await import('../assets/battle/logic/local-progress.ts');
const makeBattle = (hero, pets) => new Battle(() => 0, 1, 0, pets && { entries: pets },
  undefined, undefined, undefined, undefined, undefined, undefined, { hero });

test('character points preview compares rounded stats and clears on cancel', () => {
  const hero = { ...initialHero(), potential: 5 };
  let draft = hero;
  for (let i = 0; i < 5; i++) draft = adjustPotential(hero, draft, 'constitution', 1);
  const { panel, delta } = heroPanelPreview(hero, draft);
  assert.deepEqual(panel, { maxHp: 75, maxMana: 30, attack: 7, defense: 15, speed: 11, dodge: 10, spirit: 18 });
  assert.deepEqual([delta('maxHp'), delta('spirit'), delta('attack')], ['+25', '+2', '+0']);
  const cancelled = heroPanelPreview(hero);
  assert.deepEqual([cancelled.panel.maxHp, cancelled.panel.spirit], [50, 16]);
  assert.deepEqual([cancelled.delta('maxHp'), cancelled.delta('spirit')], ['', '']);
});

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
test('potential press applies once on tap and repeats at shortening intervals while held', async t => {
  const { HoldRepeat } = await import('../assets/battle/logic/hold-repeat.ts');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const repeat = new HoldRepeat();
  let steps = 0;
  const step = () => { steps++; return true; };
  repeat.start(step);
  t.mock.timers.tick(100);
  repeat.stop();
  t.mock.timers.tick(1000);
  assert.equal(steps, 1);

  repeat.start(step);
  assert.equal(steps, 2);
  for (const delay of [350, 228, 148]) {
    const before = steps;
    t.mock.timers.tick(delay - 1);
    assert.equal(steps, before);
    t.mock.timers.tick(1);
    assert.equal(steps, before + 1);
  }
  repeat.stop();
  t.mock.timers.tick(1000);
  assert.equal(steps, 5);
});

test('holding plus or minus stops at the existing preview boundaries', async t => {
  const { HoldRepeat } = await import('../assets/battle/logic/hold-repeat.ts');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hero = awardExperience(initialHero(), 10);
  const repeat = new HoldRepeat();
  let preview = hero;
  let steps = 0;
  const hold = change => repeat.start(() => {
    steps++;
    preview = adjustPotential(hero, preview, 'strength', change);
    return change === 1 ? preview.potential > 0 : preview.stats.strength > hero.stats.strength;
  });
  const exhaust = () => { for (let i = 0; i < 8; i++) t.mock.timers.tick(350); };
  hold(1);
  exhaust();
  assert.deepEqual([steps, preview.stats.strength, preview.potential], [5, 16, 0]);
  hold(-1);
  exhaust();
  assert.deepEqual([steps, preview.stats.strength, preview.potential], [10, 11, 5]);
  assert.deepEqual(preview, hero);
});
