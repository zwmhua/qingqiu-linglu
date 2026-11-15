import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { Battle } = await import('../assets/battle/scripts/Battle.ts');
const { AutoCommands, nextAutoOrder } = await import('../assets/battle/logic/auto.ts');
const fight = () => new Battle(() => 0.5, 3, 0, undefined, () => 1,
  undefined, undefined, undefined, undefined, undefined, undefined, () => 0);

test('first-round auto issues both attacks immediately with injected random targets', () => {
  const battle = fight();
  const rolls = [0, 0.99, 0.5, 0.5];
  const auto = new AutoCommands(() => rolls.shift());
  auto.toggle();
  auto.issue(battle);
  assert.equal(battle.round, 2);
  assert.deepEqual([...battle.lastCommands.values()], [
    { command: 'attack', target: 'enemy-0' }, { command: 'attack', target: 'enemy-2' },
  ]);
  auto.issue(battle);
  assert.equal(battle.round, 3);
  assert.deepEqual([...battle.lastCommands.values()], [
    { command: 'attack', target: 'enemy-1' }, { command: 'attack', target: 'enemy-1' },
  ]);
  assert.equal(rolls.length, 0);
});

test('auto repeats each actor attack or defense; other prior commands fall back to attack', () => {
  const battle = fight();
  battle.command('hero', 'defend');
  battle.command('pet', 'attack', 'enemy-0');
  const auto = new AutoCommands(() => 0.99);
  auto.toggle();
  auto.issue(battle);
  assert.deepEqual([...battle.lastCommands.values()], [
    { command: 'defend', target: undefined }, { command: 'attack', target: 'enemy-2' },
  ]);
  for (const previous of [undefined, 'capture', 'summon', 'flee', 'retreat', 'protect', 'item', 'skill']) {
    assert.deepEqual(nextAutoOrder(previous, battle.enemies, () => 0),
      { command: 'attack', target: 'enemy-0' });
  }
  battle.enemies[0].hp = 0;
  assert.equal(nextAutoOrder('attack', battle.enemies, () => 0).target, 'enemy-1');
  battle.enemies[1].left = true;
  assert.equal(nextAutoOrder('attack', battle.enemies, () => 0).target, 'enemy-2');
});

test('cancel restores manual commands; enabled auto carries into the next battle', () => {
  const battle = fight();
  const auto = new AutoCommands(() => 0);
  auto.toggle();
  auto.issue(battle);
  auto.toggle();
  auto.issue(battle);
  assert.deepEqual(battle.pending.map(unit => unit.id), ['hero', 'pet']);
  assert.equal(battle.commands.size, 0);
  auto.toggle();
  battle.enemies.forEach(enemy => { enemy.hp = 0; });
  battle.checkWinner();
  auto.issue(battle);
  assert.equal(auto.enabled, true);
  const next = fight();
  auto.issue(next);
  assert.equal(next.round, 2);
  assert.equal(new AutoCommands(() => 0).enabled, false);
});

test('auto keeps hero defense, picks the first learned affordable spell and falls back to attack', () => {
  const battle = fight(), pet = battle.pets[0], rolls = [0.99, 0.5];
  Object.assign(pet, { skillIds: ['armor', 'fireball', 'thunder'], mana: 5, speed: 100 });
  battle.lastCommands.set('hero', { command: 'defend' });
  const auto = new AutoCommands(() => rolls.shift());
  auto.toggle(); auto.issue(battle);
  const spell = battle.events.find(e => e.kind === 'spell');
  assert.deepEqual([spell?.skillId, spell?.targets[0].targetId, pet.mana], ['fireball', 'enemy-2', 0]);
  auto.issue(battle);
  assert.equal(battle.lastCommands.get('hero').command, 'defend');
  assert.ok(battle.attackEvents.some(e => e.actorId === pet.id && e.targetId === 'enemy-1'));
  assert.equal(rolls.length, 0);
});
