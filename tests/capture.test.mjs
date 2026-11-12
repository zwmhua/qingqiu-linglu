import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { Battle } = await import('../assets/scripts/Battle.ts');
const { captureChance } = await import('../assets/logic/capture.ts');

test('capture uses the confirmed health formula and injected roll', () => {
  for (const hp of [1, 0.05, 0.22, 1]) {
    const expected = Math.min(0.82, Math.max(0.06, 0.20 + 0.58 * (1 - hp) ** 1.15));
    assert.ok(Math.abs(captureChance(hp * 100, 100) - expected) < 1e-12);
  }
});

test('only a living hero may target a living enemy', () => {
  const battle = new Battle(() => 0, 2);
  assert.throws(() => battle.command('pet', 'capture', 'enemy-0'));
  assert.throws(() => battle.command('hero', 'capture', 'missing'));
  battle.enemies[0].hp = 0;
  assert.throws(() => battle.command('hero', 'capture', 'enemy-0'), /已倒下/);
  battle.allies[0].hp = 0;
  assert.throws(() => battle.command('hero', 'capture', 'enemy-1'));
  assert.equal(battle.commands.size, 0);
});

test('success removes target in speed order without a kill; other enemies continue', () => {
  const battle = new Battle(() => 0, 2);
  battle.command('hero', 'capture', 'enemy-0');
  battle.command('pet', 'defend');
  assert.equal(battle.enemies[0].left, true);
  assert.equal(battle.enemies[0].hp, battle.enemies[0].maxHp);
  assert.deepEqual(battle.events.map(e => e.kind), ['captureSuccess', 'attack']);
  assert.ok(!battle.lastOrder.includes('enemy-0'));
  assert.ok(battle.lastOrder.includes('enemy-1'));
  assert.match(battle.log.join(' '), /抓取成功/);
  assert.equal(battle.winner, null);
  assert.throws(() => battle.command('hero', 'capture', 'enemy-0'));
});

test('failed capture keeps the target active', () => {
  const battle = new Battle(() => 0.99, 1);
  battle.command('hero', 'capture', 'enemy-0');
  battle.command('pet', 'defend');
  assert.equal(battle.enemies[0].left, false);
  assert.ok(battle.lastOrder.includes('enemy-0'));
  assert.equal(battle.events[0].kind, 'captureFail');
});

test('capture of the final enemy wins without dealing damage', () => {
  const battle = new Battle(() => 0, 1);
  battle.command('hero', 'capture', 'enemy-0');
  battle.command('pet', 'defend');
  assert.equal(battle.winner, 'ally');
  assert.equal(battle.enemies[0].hp, battle.enemies[0].maxHp);
  assert.deepEqual(battle.events.map(e => e.kind), ['captureSuccess']);
  assert.match(battle.log.join(' '), /抓取成功.*战斗胜利/);
});

test('a dead capture target retargets randomly among other living enemies', () => {
  for (const [choice, expected] of [[0, 'enemy-1'], [0.999, 'enemy-2']]) {
    const values = [0, choice, 0];
    let rolls = 0;
    const battle = new Battle(() => values[rolls++] ?? 0, 3, 0, undefined, () => 1);
    battle.pets[0].speed = 10;
    battle.enemies[0].hp = 1;
    battle.command('hero', 'capture', 'enemy-0');
    battle.command('pet', 'attack', 'enemy-0');
    assert.deepEqual(battle.events.filter(e => e.kind.startsWith('capture'))
      .map(e => [e.kind, e.targetId]), [['captureSuccess', expected]]);
    assert.equal(battle.roster.entries[2].sourceEnemyId, expected);
    assert.equal(battle.enemies[0].hp, 0);
    assert.equal(battle.enemies.find(enemy => enemy.id === expected).left, true);
    assert.match(battle.log.join(' '), /原抓取目标已倒下，改抓/);
  }
});

test('a redirected capture can fail without removing the new target', () => {
  const values = [0, 0.999, 0.99];
  let rolls = 0;
  const battle = new Battle(() => values[rolls++] ?? 0, 3, 0, undefined, () => 1);
  battle.pets[0].speed = 10;
  battle.enemies[0].hp = 1;
  battle.command('hero', 'capture', 'enemy-0');
  battle.command('pet', 'attack', 'enemy-0');
  assert.deepEqual(battle.events.filter(e => e.kind.startsWith('capture'))
    .map(e => [e.kind, e.targetId]), [['captureFail', 'enemy-2']]);
  assert.equal(battle.enemies[2].left, false);
  assert.equal(battle.roster.entries.length, 2);
});

test('when the last enemy dies before capture, no capture roll occurs', () => {
  let rolls = 0;
  const battle = new Battle(() => { rolls++; return 0; }, 1, 0, undefined, () => 1);
  battle.pets[0].speed = 10;
  battle.enemies[0].hp = 1;
  battle.command('hero', 'capture', 'enemy-0');
  battle.command('pet', 'attack', 'enemy-0');
  assert.equal(rolls, 1);
  assert.equal(battle.winner, 'ally');
  assert.ok(!battle.events.some(e => e.kind.startsWith('capture')));
  assert.match(battle.log.join(' '), /没有存活的敌人，抓取取消/);
});
