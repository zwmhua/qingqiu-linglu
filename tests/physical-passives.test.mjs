import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !specifier.endsWith('.ts') ? specifier + '.ts' : specifier, context);
} });
const { Battle } = await import('../assets/battle/scripts/Battle.ts');
const { initialHero } = await import('../assets/battle/logic/hero-progress.ts');

function sample(rolls = [], withExp = false) {
  let draws = 0;
  const b = new Battle(() => rolls[draws++] ?? 0.5, 1, 0, undefined, () => 1,
    undefined, undefined, undefined, undefined, undefined, withExp ? { hero: initialHero() } : undefined, () => 0);
  const [hero, pet] = b.allies, [enemy] = b.enemies;
  Object.assign(pet, { level: 10, hp: 20, maxHp: 100, attack: 50, defense: 10, speed: 100, skillIds: [] });
  Object.assign(enemy, { level: 10, hp: 80, maxHp: 80, attack: 24, defense: 25, speed: 1, skillIds: [] });
  return { b, hero, pet, enemy, draws: () => draws };
}
function attack({ b, hero, enemy }) {
  if (hero.hp) b.command('hero', 'defend');
  b.command('pet', 'attack', enemy.id);
}
const trace = b => b.events.map(e => e.kind === 'heal'
  ? [e.kind, e.targetId, e.amount, e.targetAfter]
  : [e.source, e.targetId, e.damage, e.targetAfter]);

test('two main hits roll crit separately; each event keeps its HP and only main hits trigger passives', () => {
  const s = sample([0, 0, 0.5, 0, 0, 0.5, 0.1, 0.5]);
  s.pet.skillIds = ['combo', 'crit', 'lifesteal', 'reflect', 'counter'];
  s.enemy.skillIds = ['reflect', 'counter', 'combo', 'crit', 'lifesteal'];
  attack(s);
  assert.deepEqual(trace(s.b), [
    ['main', s.enemy.id, 60, 20], ['heal', 'pet', 15, 35], ['reflect', 'pet', 15, 20],
    ['counter', 'pet', 10, 10], ['main', s.enemy.id, 30, 0], ['heal', 'pet', 5, 15],
  ]);
  assert.deepEqual([s.pet.hp, s.b.result, s.draws()], [15, 'victory', 8]);
});

test('strict probability cutoffs and fixed 100-sample hit counts', () => {
  const trials = {
    crit: [0.1, s => s.b.attackEvents[0].damage === 80],
    combo: [0.45, s => s.b.attackEvents.filter(e => e.actorId === 'pet').length === 2],
    reflect: [0.3, s => s.b.attackEvents.some(e => e.source === 'reflect')],
    counter: [0.3, s => s.b.attackEvents.some(e => e.source === 'counter')],
  };
  for (const [skill, [rate, triggered]] of Object.entries(trials)) {
    const trial = roll => {
      const reacts = skill === 'reflect' || skill === 'counter';
      const s = sample(reacts ? [0.5, roll, 0.5] : [roll, 0.5, 0.5]);
      (reacts ? s.enemy : s.pet).skillIds = [skill];
      attack(s);
      if (skill === 'combo' && roll >= rate) assert.equal(s.b.attackEvents[0].damage, 40);
      return triggered(s);
    };
    assert.deepEqual([rate - 0.001, rate, rate + 0.001].map(trial), [true, false, false], skill);
    assert.equal(Array.from({ length: 100 }, (_, i) => trial(i / 100)).filter(Boolean).length, rate * 100, skill);
  }
});

test('legacy main hit consumes only its damage draw when it wins', () => {
  const s = sample([0.5]);
  s.enemy.hp = 3;
  attack(s);
  assert.deepEqual(trace(s.b), [['main', s.enemy.id, 40, 0]]);
  assert.equal(s.draws(), 1);
});

test('protection pools actual loss for capped lifesteal; only an injured original target reacts', () => {
  for (const damage of [1, 40]) {
    const s = sample([0.9, 0.5, 0, 0, 0.5]);
    Object.assign(s.enemy, { hp: 70, speed: 200, attack: damage + 4, skillIds: ['lifesteal'] });
    Object.assign(s.pet, { hp: 75, skillIds: ['reflect', 'counter'] });
    Object.assign(s.hero, { hp: 6, skillIds: ['reflect', 'counter'] });
    s.b.command('hero', 'protect', 'pet');
    s.b.command('pet', 'defend');
    assert.deepEqual(trace(s.b), damage === 1 ? [['main', 'pet', 1, 75]] : [
      ['main', 'pet', 20, 65], ['heal', s.enemy.id, 4, 74], ['reflect', s.enemy.id, 2, 72],
      ['counter', s.enemy.id, 20, 52],
    ]);
    assert.deepEqual([s.hero.hp, s.b.heroRage, s.draws()], damage === 1 ? [5, 1, 2] : [0, 6, 5]);
  }
});

test('reflect and counter can each stop a second hit; zero reflect still lets counter act', () => {
  for (const [hp, reflectRoll, amount, sources, draws] of [
    [7, 0, 50, ['main', 'reflect'], 3], [10, 0.3, 50, ['main', 'counter'], 5],
    [10, 0, 12, ['main', 'reflect', 'counter'], 5],
  ]) {
    const s = sample([0, 0.5, reflectRoll, 0, 0.5]);
    Object.assign(s.pet, { hp, attack: amount, skillIds: ['combo', 'regen'] });
    s.hero.hp = 0;
    s.enemy.skillIds = ['reflect', 'counter', 'regen'];
    attack(s);
    assert.deepEqual(s.b.attackEvents.map(e => e.source), sources);
    if (amount === 12) assert.equal(s.b.attackEvents[1].damage, 0);
    assert.deepEqual([s.pet.hp, s.enemy.hp, s.b.round, s.b.result, s.draws()],
      [0, amount === 12 ? 78 : 50, 1, 'defeat', draws]);
  }
});

test('lethal first hit still heals, skips reactions and next-round regen, and awards exp once', () => {
  const s = sample([0, 0.5], true);
  Object.assign(s.pet, { hp: 99, skillIds: ['combo', 'lifesteal', 'regen'] });
  s.enemy.hp = 8;
  s.enemy.skillIds = ['reflect', 'counter'];
  attack(s);
  assert.deepEqual(trace(s.b), [['main', s.enemy.id, 30, 0], ['heal', 'pet', 1, 100]]);
  assert.deepEqual([s.b.round, s.b.result, s.draws()], [1, 'victory', 2]);
  assert.ok(s.b.earnedExp > 0);
  const progress = structuredClone([s.b.heroProgress, s.b.roster.entries]);
  s.b.allies.forEach(unit => { unit.hp = 0; });
  assert.equal(s.b.checkWinner(), 'ally');
  assert.deepEqual([s.b.heroProgress, s.b.roster.entries], progress);
  const tie = sample();
  tie.b.units.forEach(unit => { unit.hp = 0; });
  assert.equal(tie.b.checkWinner(), 'ally');
});
