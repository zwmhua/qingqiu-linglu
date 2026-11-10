import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') && !specifier.endsWith('.ts')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { Battle } = await import('../assets/scripts/Battle.ts');

const fixed = () => 0.5;
const make = (count = 1) => new Battle(fixed, count);

test('encounter weights select one, two, or three enemies', () => {
  assert.equal(new Battle(() => 0, undefined).enemies.length, 1);
  assert.equal(new Battle(() => 0.5, undefined).enemies.length, 2);
  assert.equal(new Battle(() => 0.99, undefined).enemies.length, 3);
});

test('both allies choose commands, then speed and ties determine order', () => {
  const battle = make();
  battle.command('hero', 'attack', 'enemy-0');
  assert.equal(battle.phase, 'command');
  battle.command('pet', 'attack', 'enemy-0');
  assert.deepEqual(battle.lastOrder.slice(0, 3), ['pet', 'hero', 'enemy-0']);
});

test('defense starts before faster attacks and halves physical damage', () => {
  const battle = make();
  battle.allies[0].speed = 1;
  battle.enemies[0].speed = 20;
  battle.command('hero', 'defend');
  battle.command('pet', 'defend');
  assert.match(battle.log.join(' '), /防御减伤/);
  assert.equal(battle.allies[0].defending, false);
});

test('dead target redirects; dead units skip actions', () => {
  const battle = make(2);
  battle.enemies[0].hp = 1;
  battle.command('hero', 'attack', 'enemy-0');
  battle.command('pet', 'attack', 'enemy-0');
  assert.equal(battle.enemies[0].hp, 0);
  assert.ok(battle.enemies[1].hp < battle.enemies[1].maxHp);
  assert.ok(!battle.lastOrder.includes('enemy-0'));
});

test('one downed ally does not end battle; all downed allies do', () => {
  const battle = make();
  battle.allies[0].hp = 0;
  assert.equal(battle.winner, null);
  battle.allies[1].hp = 0;
  battle.checkWinner();
  assert.equal(battle.winner, 'enemy');
});

test('timeout gives each uncommanded living ally an attack', () => {
  const battle = make();
  battle.command('hero', 'defend');
  battle.timeout();
  assert.equal(battle.round, 2);
  assert.equal(battle.commands.size, 0);
  assert.ok(battle.enemies[0].hp < battle.enemies[0].maxHp);
});
