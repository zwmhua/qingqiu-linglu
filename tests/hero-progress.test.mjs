import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !specifier.endsWith('.ts')
    ? `${specifier}.ts` : specifier, context);
} });

test('04a character progression and browser progress', async t => {
  const { Battle } = await import('../assets/battle/scripts/Battle.ts');
  const { awardExperience, heroPanel, initialHero, levelUpExp } = await import('../assets/battle/logic/hero-progress.ts');
  const { readProgress, saveProgress, resetProgress } = await import('../assets/battle/logic/local-progress.ts');
  const { petPanel } = await import('../assets/battle/logic/pet-panel.ts');
  const make = ({ hero = initialHero(), pets, selectedPetId, petRandom, enemy = () => 0 } = {}) =>
    new Battle(() => 0, 1, 0, pets && { entries: pets }, () => 1,
      undefined, undefined, undefined, () => 1, enemy, { hero, selectedPetId, petRandom });
  const points = stats => Object.values(stats).reduce((sum, value) => sum + value, 0);

  await t.test('starts at 0 and applies each level, preserving points through the cap', () => {
    const hero = initialHero();
    assert.deepEqual([hero.level, hero.exp, levelUpExp(0), hero.potential], [0, 0, 10, 0]);
    assert.deepEqual(Object.values(hero.stats), [10, 10, 10, 10, 10]);
    assert.deepEqual(heroPanel(hero.stats), { maxHp: 50, maxMana: 30, attack: 7, defense: 15, speed: 10, dodge: 10, spirit: 16 });
    const next = awardExperience(hero, 10);
    assert.deepEqual([next.level, next.exp, next.potential, ...Object.values(next.stats)], [1, 0, 5, 11, 11, 11, 11, 11]);
    assert.deepEqual(heroPanel(next.stats), { maxHp: 55, maxMana: 33, attack: 7, defense: 17, speed: 11, dodge: 11, spirit: 18 });
    const crossed = awardExperience(hero, 61);
    assert.deepEqual([crossed.level, crossed.exp, crossed.potential, points(crossed.stats)], [3, 1, 15, 65]);
    const capped = awardExperience(crossed, 2500);
    assert.deepEqual([levelUpExp(19), capped.level, capped.exp, capped.potential, points(capped.stats)], [200, 20, 0, 100, 150]);
    assert.deepEqual(awardExperience(capped, 100), capped);
  });

  await t.test('capture counts once, and a downed hero can earn victory experience', () => {
    const battle = make({ enemy: () => 0.81 });
    battle.command('hero', 'capture', 'enemy-0');
    battle.command('pet', 'defend');
    assert.equal(battle.winner, 'ally');
    assert.equal(battle.earnedExp, 18);
    assert.deepEqual([battle.heroProgress.level, battle.heroProgress.exp], [1, 8]);
    assert.equal(battle.checkWinner(), 'ally');
    assert.equal(battle.heroProgress.exp, 8);
    const next = make({ hero: battle.heroProgress });
    assert.deepEqual([next.allies[0].hp, next.allies[0].maxHp], [55, 55]);
    next.allies[0].hp = 0;
    next.enemies[0].hp = 1;
    next.command('pet', 'attack', 'enemy-0');
    assert.equal(next.winner, 'ally');
    assert.equal(next.heroProgress.exp, 18);
    const loss = make();
    for (const unit of loss.allies) unit.hp = 0;
    assert.equal(loss.checkWinner(), 'enemy');
    assert.equal(loss.earnedExp, 0);
    assert.equal(loss.heroProgress.exp, 0);
  });

  await t.test('round trips independent real pet levels, roster IDs, selection and hero progress', () => {
    const values = new Map([['unrelated', 'keep']]);
    const storage = { getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const rolls = [0, 0.99].values();
    const battle = make({ petRandom: () => rolls.next().value });
    const [first, second] = battle.roster.entries.map(petPanel);
    assert.deepEqual(battle.pets.map(p => [p.level, p.maxHp, points(p.baseStats)]), [[1, first.maxHp, 60], [5, second.maxHp, 100]]);
    battle.command('hero', 'summon', 'pet-2');
    battle.command('pet', 'defend');
    battle.command('hero', 'capture', 'enemy-0');
    battle.command('pet-2', 'defend');
    saveProgress(storage, battle);
    assert.equal(resetProgress(storage, false), false);
    const saved = readProgress(storage);
    assert.deepEqual(saved.hero, battle.heroProgress);
    assert.equal(saved.selectedPetId, 'pet-2');
    const restored = make(saved);
    assert.equal(restored.pets.find(p => p.deployed).id, 'pet-2');
    assert.deepEqual(restored.roster.entries.map(p => [p.id, p.level, p.baseStats, p.aptitudes, p.growth, p.isBaby, p.isMutated]),
      battle.roster.entries.map(p => [p.id, p.level, p.baseStats, p.aptitudes, p.growth, p.isBaby, p.isMutated]));
    restored.command('hero', 'capture', 'enemy-0');
    restored.command('pet-2', 'defend');
    assert.deepEqual(restored.roster.entries.map(p => p.id), ['pet', 'pet-2', 'caught-1', 'caught-2']);
    const key = [...values.keys()].find(k => k !== 'unrelated');
    values.set(key, '{"version":999}');
    assert.throws(() => readProgress(storage));
    values.set(key, 'invalid json');
    assert.throws(() => readProgress(storage));
    assert.equal(resetProgress(storage, true), true);
    assert.equal(readProgress(storage), null);
    assert.deepEqual([...values], [['unrelated', 'keep']]);
  });
});
