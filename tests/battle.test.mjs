import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !specifier.endsWith('.ts')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { Battle } = await import('../assets/scripts/Battle.ts');
const { CONFIG } = await import('../assets/scripts/config.ts');
const { targetCommand, toggleTarget } = await import('../assets/logic/targeting.ts');

const fixed = () => 0.5;
const make = (count = 1) => {
  const battle = new Battle(fixed, count);
  Object.assign(battle.pets[0], { hp: 38, maxHp: 38, attack: 11, defense: 10, speed: 10 });
  return battle;
};

test('attack button then enemy and direct enemy click submit the same order and continue', () => {
  const direct = make();
  const selected = make();
  direct.command('hero', targetCommand(null), 'enemy-0');
  selected.command('hero', targetCommand(toggleTarget(null, 'attack')), 'enemy-0');
  assert.deepEqual([...selected.commands], [...direct.commands]);
  assert.deepEqual(selected.pending.map(unit => unit.id), ['pet']);
  assert.deepEqual(direct.pending.map(unit => unit.id), ['pet']);
  direct.command('pet', 'attack', 'enemy-0');
  selected.command('pet', 'attack', 'enemy-0');
  assert.equal(selected.round, 2);
  assert.equal(direct.round, 2);
  assert.deepEqual(selected.log, direct.log);
});

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

test('attack presentation events preserve resolved order, damage, and redirected targets', () => {
  const battle = make(2);
  battle.enemies[0].hp = 1;
  battle.command('hero', 'attack', 'enemy-0');
  battle.command('pet', 'attack', 'enemy-0');
  assert.deepEqual(battle.attackEvents.slice(0, 2).map(e => [e.actorId, e.targetId]),
    [['pet', 'enemy-0'], ['hero', 'enemy-1']]);
  for (const event of battle.attackEvents) {
    assert.ok(event.damage > 0);
    assert.equal(event.targetAfter, Math.max(0, event.targetBefore - event.targetDamage));
  }
  assert.equal(battle.attackEvents[0].targetAfter, 0);
  assert.equal(battle.enemies[1].hp, battle.attackEvents[1].targetAfter);
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

test('protection is active before a faster enemy and splits odd damage toward protector', () => {
  const battle = make();
  battle.allies[0].speed = 1;
  battle.enemies[0].speed = 20;
  battle.enemies[0].attack = 14;
  battle.command('hero', 'protect', 'pet');
  battle.command('pet', 'defend');
  assert.equal(battle.allies[0].hp, 55);
  assert.equal(battle.allies[1].hp, 36);
  assert.match(battle.log.join(' '), /保护.*分担/);
  assert.ok(!battle.lastOrder.includes('hero'));
});

test('protection rejects self, absent targets, and duplicate protectors', () => {
  const battle = make();
  assert.throws(() => battle.command('hero', 'protect', 'hero'));
  assert.throws(() => battle.command('hero', 'protect', 'enemy-0'));
  battle.command('hero', 'protect', 'pet');
  assert.throws(() => battle.command('pet', 'protect', 'pet'));
  battle.allies.push({ ...battle.allies[0], id: 'ally-3', slot: 2 });
  assert.throws(() => battle.command('ally-3', 'protect', 'pet'));
});

test('pet retreat and hero flee leave the battle without being downed', () => {
  const battle = make();
  battle.command('hero', 'flee');
  battle.command('pet', 'retreat');
  assert.equal(battle.winner, 'enemy');
  assert.equal(battle.allies[0].left, true);
  assert.equal(battle.allies[1].left, true);
  assert.equal(battle.allies[0].hp, 58);
  assert.equal(battle.allies[1].hp, 38);
});

test('one departing ally does not lose; enemies target the remaining ally', () => {
  const battle = make();
  battle.command('hero', 'defend');
  battle.command('pet', 'retreat');
  assert.equal(battle.winner, null);
  assert.equal(battle.allies[1].left, true);
  assert.equal(battle.allies[1].hp, 38);
  assert.ok(battle.allies[0].hp < 58);
  assert.deepEqual(battle.pending.map(u => u.id), ['hero']);
});

test('summon replaces the active pet in speed order and preserves withdrawn health', () => {
  const battle = make();
  const active = battle.allies.find(unit => unit.id === 'pet');
  const reserve = battle.allies.find(unit => unit.id === 'pet-2');
  assert.equal(reserve.deployed, false);
  active.hp = 19;
  battle.command('hero', 'summon', 'pet-2');
  battle.command('pet', 'attack', 'enemy-0');
  assert.deepEqual(battle.lastOrder.slice(0, 2), ['pet', 'hero']);
  assert.equal(active.deployed, false);
  assert.equal(active.hp, 19);
  assert.equal(reserve.deployed, true);
  assert.equal(battle.summonsUsed, 1);
  assert.deepEqual(battle.events.slice(0, 2).map(event => event.kind), ['attack', 'summon']);
  assert.deepEqual(battle.pending.map(unit => unit.id), ['hero', 'pet-2']);
});

test('retreated and downed pets cannot be summoned; summon count is capped', () => {
  const battle = make();
  assert.throws(() => battle.command('hero', 'summon', 'pet'));
  battle.allies.find(unit => unit.id === 'pet-2').hp = 0;
  assert.throws(() => battle.command('hero', 'summon', 'pet-2'));
  battle.allies.find(unit => unit.id === 'pet-2').hp = 38;
  battle.summonsUsed = CONFIG.summon.maxPerBattle;
  assert.deepEqual(battle.summonTargets(), []);
  assert.throws(() => battle.command('hero', 'summon', 'pet-2'));
});

test('hero rage follows actual health lost, caps at 150, and can carry into the next battle', () => {
  const battle = make();
  battle.command('hero', 'defend');
  battle.command('pet', 'retreat');
  assert.equal(battle.heroRage, 58 - battle.allies[0].hp);
  battle.heroRage = 149;
  battle.command('hero', 'defend');
  assert.equal(battle.heroRage, 150);
  assert.equal(new Battle(fixed, 1, battle.heroRage).heroRage, 150);
});
