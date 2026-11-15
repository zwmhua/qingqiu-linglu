import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { Battle } = await import('../assets/battle/scripts/Battle.ts');
const { AutoCommands, nextAutoOrder } = await import('../assets/battle/logic/auto.ts');
const fight = session => new Battle(() => 0.5, 3, 0, session, () => 1,
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

function longFight(session) {
  const battle = fight(session);
  battle.allies[0].hp = 900;
  for (const enemy of battle.enemies) enemy.hp = enemy.maxHp = 900;
  return battle;
}

test('confirmed fireball survives exhaustion and a new fight until replaced by a manual attack', () => {
  const first = longFight(), pet = first.pets[0];
  pet.skillIds = first.roster.entries[0].skillIds = ['thunder', 'fireball'];
  pet.mana = 10;
  first.roster.entries[0].baseStats.mana = 10;
  first.command('hero', 'defend');
  first.command(pet.id, 'spell', 'enemy-0', 'fireball');

  const auto = new AutoCommands(() => 0.99);
  auto.toggle();
  auto.issue(first);
  const spell = first.events.find(e => e.kind === 'spell');
  assert.deepEqual([spell?.skillId, spell?.targets[0].targetId, pet.mana], ['fireball', 'enemy-2', 0]);
  auto.issue(first);
  assert.ok(first.attackEvents.some(e => e.actorId === pet.id && e.targetId === 'enemy-2'));
  assert.ok(first.log.some(line => line.includes('法力不足，改为普攻')));

  first.command('hero', 'flee');
  auto.issue(first);
  assert.equal(first.result, 'escaped');
  const next = longFight(first.session);
  auto.issue(next);
  assert.equal(next.lastCommands.get('hero').command, 'defend');
  assert.equal(next.events.find(e => e.kind === 'spell')?.skillId, 'fireball');

  auto.toggle();
  next.command('hero', 'defend');
  next.command(pet.id, 'attack', 'enemy-0');
  next.enemies[2].hp = 0;
  auto.toggle();
  auto.issue(next);
  assert.ok(next.attackEvents.some(e => e.actorId === pet.id && e.targetId === 'enemy-1'));
  assert.ok(!next.events.some(e => e.kind === 'spell' && e.actorId === pet.id));
});

test('summoning and protection are one-shot and each pet keeps its own confirmed order', () => {
  const b = longFight(), [pet, reserve] = b.pets;
  pet.skillIds = ['thunder', 'fireball'];
  reserve.skillIds = ['waterarrow'];
  pet.mana = reserve.mana = 15;
  b.allies[0].speed = 200;
  const auto = new AutoCommands(() => 0);
  b.command('hero', 'defend');
  b.command(pet.id, 'spell', 'enemy-0', 'fireball');

  b.command('hero', 'summon', reserve.id);
  auto.toggle(); auto.issue(b);
  auto.issue(b);
  assert.equal(b.lastCommands.get('hero').command, 'defend');
  assert.equal(b.events.find(e => e.kind === 'spell' && e.actorId === reserve.id)?.skillId, 'waterarrow');

  auto.toggle();
  b.command('hero', 'protect', reserve.id);
  b.command(reserve.id, 'defend');
  b.command('hero', 'summon', pet.id);
  auto.toggle(); auto.issue(b); auto.issue(b);
  assert.equal(b.lastCommands.get('hero').command, 'defend');
  assert.equal(b.events.find(e => e.kind === 'spell' && e.actorId === pet.id)?.skillId, 'fireball');

  b.command('hero', 'summon', reserve.id);
  auto.issue(b); auto.issue(b);
  assert.equal(b.lastCommands.get(reserve.id).command, 'defend');
});
