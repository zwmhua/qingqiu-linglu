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
const { Battle } = await import('../assets/battle/scripts/Battle.ts');
const { BATTLE_RULES } = await import('../assets/battle/logic/battle-rules.ts');
const { targetCommand, toggleTarget } = await import('../assets/battle/logic/targeting.ts');

const fixed = () => 0.5;
const make = (count = 1) => {
  const battle = new Battle(fixed, count, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => 0);
  Object.assign(battle.pets[0], { hp: 38, maxHp: 38, attack: 11, defense: 10, speed: 10 });
  return battle;
};

function spellFight() {
  const battle = make(2), [hero, pet] = battle.allies, [enemy, other] = battle.enemies;
  Object.assign(pet, { level: 0, spirit: 24, mana: 5, speed: 100, hp: 30,
    skillIds: ['thunder', 'fireball', 'waterarrow', 'combo', 'crit', 'lifesteal', 'reflect', 'counter'] });
  Object.assign(enemy, { hp: 120, spirit: 19, defense: 800, speed: 1, skillIds: ['armor', 'reflect', 'counter'] });
  Object.assign(other, { hp: 120, speed: 1, skillIds: [] });
  return { battle, hero, pet, enemy, other };
}

test('three spells spend mana on execution and ignore armor, defense and physical passives', () => {
  for (const skill of ['thunder', 'fireball', 'waterarrow']) {
    const { battle, pet, hero, enemy } = spellFight();
    enemy.defending = true;
    battle.command(pet.id, 'spell', enemy.id, skill);
    assert.equal(pet.mana, 5);
    battle.command(hero.id, 'defend');
    assert.deepEqual(battle.events[0].targets, [{ targetId: enemy.id, damage: 23, hpAfter: 97 }]);
    assert.deepEqual([battle.events[0].skillId, battle.events[0].manaAfter, pet.mana], [skill, 0, 0]);
    assert.ok(!battle.events.some(e => e.kind === 'heal' || e.source === 'reflect' || e.source === 'counter'));
  }
});

test('enemy uses the first affordable spell, bypasses protection, and only draws its original target roll', () => {
  const { battle, pet, hero, enemy, other } = spellFight();
  Object.assign(enemy, { mana: 5, speed: 110, spirit: 0, skillIds: ['armor', 'waterarrow', 'fireball'] });
  other.hp = 0;
  let draws = 0;
  battle.random = () => { draws++; return 0.9; };
  battle.command(hero.id, 'protect', pet.id);
  battle.command(pet.id, 'defend');
  assert.deepEqual(battle.events[0].targets, [{ targetId: pet.id, damage: 1, hpAfter: 29 }]);
  assert.deepEqual([battle.events[0].skillId, enemy.mana, hero.hp, draws], ['waterarrow', 0, hero.maxHp, 1]);
  pet.skillIds = [];
  battle.command(hero.id, 'defend'); battle.command(pet.id, 'defend');
  assert.deepEqual([battle.events[0].kind, draws], ['attack', 3]);
});

test('spell validation preserves mana and a queued shortfall uses the existing attack fallback', () => {
  const { battle, pet, hero, enemy, other } = spellFight();
  pet.mana = 4;
  pet.skillIds = ['thunder', 'armor'];
  assert.throws(() => battle.command(pet.id, 'spell', enemy.id, 'thunder'), /法力不足/);
  assert.throws(() => battle.command(hero.id, 'spell', enemy.id, 'thunder'));
  assert.throws(() => battle.command(pet.id, 'spell', enemy.id, 'armor'));
  assert.throws(() => battle.command(pet.id, 'spell', enemy.id, 'fireball'));
  assert.throws(() => battle.command(pet.id, 'spell', hero.id, 'thunder'));
  assert.deepEqual([pet.mana, battle.commands.size], [4, 0]);
  pet.mana = 5;
  battle.command(pet.id, 'spell', enemy.id, 'thunder');
  pet.mana = 4; enemy.hp = 0;
  battle.command(hero.id, 'defend');
  assert.deepEqual([battle.events[0].kind, battle.events[0].targetId, pet.mana], ['attack', other.id, 4]);
  assert.ok(battle.log.some(line => line.includes('法力不足，改为普攻')));
});

test('inactive, displaced, flees and lost targets spend no mana; resummoning preserves it', () => {
  for (const reason of ['down', 'summon', 'flee', 'target', 'victory']) {
    const { battle, pet, hero, enemy, other } = spellFight();
    battle.command(pet.id, 'spell', enemy.id, 'thunder');
    if (reason === 'down') Object.assign(other, { attack: 1000, speed: 200 });
    if (reason === 'target' || reason === 'victory') {
      enemy.hp = 1; hero.speed = 200;
      if (reason === 'victory') other.hp = 0;
    }
    if (reason === 'summon') hero.speed = 200;
    if (reason === 'down') battle.random = () => 0.9;
    battle.command(hero.id, reason === 'target' || reason === 'victory' ? 'attack'
      : reason === 'down' ? 'defend' : reason, reason === 'summon' ? 'pet-2' : enemy.id);
    assert.equal(pet.mana, 5, reason);
  }
  const { battle, pet, hero, enemy } = spellFight();
  battle.command(pet.id, 'spell', enemy.id, 'thunder'); battle.command(hero.id, 'defend');
  for (const incoming of ['pet-2', pet.id]) {
    battle.command(hero.id, 'summon', incoming); battle.command(battle.selectedPetId, 'defend');
  }
  assert.deepEqual([pet.deployed, pet.mana], [true, 0]);
  const fresh = new Battle(fixed, 1, 0, battle.session).pets[0];
  assert.ok(fresh.mana > 0);
  assert.equal(fresh.mana, fresh.maxMana);
});

test('hero flee withdraws the whole team before attacks, with an explicit result and no reward', () => {
  const battle = make(2);
  assert.throws(() => battle.command('hero', 'retreat'));
  assert.throws(() => battle.command('pet', 'flee'));
  const hp = battle.units.map(unit => unit.hp);
  battle.command('hero', 'flee');
  battle.command('pet', 'attack', 'enemy-0');
  assert.equal(battle.result, 'escaped');
  assert.equal(battle.phase, 'ended');
  assert.ok(battle.allies.every(unit => unit.left));
  assert.deepEqual(battle.units.map(unit => unit.hp), hp);
  assert.deepEqual(battle.events, []);
  assert.equal(battle.earnedExp, 0);
  const down = make();
  down.allies[0].hp = 0;
  assert.throws(() => down.command('hero', 'flee'));
  down.command('pet', 'retreat');
  assert.equal(down.result, 'defeat');
});

test('capture continues until the last enemy; victory rewards are applied exactly once', async () => {
  const { SessionProgress } = await import('../assets/battle/logic/session-progress.ts');
  const { initialHero } = await import('../assets/battle/logic/hero-progress.ts');
  const session = new SessionProgress(initialHero(), undefined, undefined, () => 0);
  const battle = new Battle(() => 0, 2, 0, session, () => 1, undefined, undefined, undefined, undefined, undefined, undefined, () => 0);
  battle.command('hero', 'capture', 'enemy-0');
  battle.command('pet', 'defend');
  assert.equal(battle.result, undefined);
  assert.equal(battle.earnedExp, 0);
  assert.equal(session.roster.entries.length, 3);
  battle.command('hero', 'capture', 'enemy-1');
  battle.command('pet', 'defend');
  assert.equal(battle.result, 'victory');
  assert.equal(battle.earnedExp, 20);
  const candidate = JSON.stringify(session);
  battle.checkWinner();
  battle.timeout();
  assert.equal(JSON.stringify(session), candidate);
});

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
  assert.equal(new Battle(() => 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => 0).enemies.length, 1);
  assert.equal(new Battle(() => 0.5, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => 0).enemies.length, 2);
  assert.equal(new Battle(() => 0.99, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => 0).enemies.length, 3);
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
  battle.summonsUsed = BATTLE_RULES.summon.maxPerBattle;
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
  assert.equal(new Battle(fixed, 1, battle.heroRage, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => 0).heroRage, 150);
});


test('fused IDs use pet combat, skills and deployment after reload', async () => {
  const { SessionProgress } = await import('../assets/battle/logic/session-progress.ts');
  const { initialHero } = await import('../assets/battle/logic/hero-progress.ts');
  const { progressSnapshot, loadSessionProgress } = await import('../assets/battle/logic/local-progress.ts');
  const session = new SessionProgress(initialHero()), pet = session.roster.entries[1];
  Object.assign(pet, { id: 'fused-1', origin: 'fused', skillIds: ['thunder'] });
  session.roster.publishFusion(session.roster.entries.slice(), 2); session.selectedPetId = pet.id;
  const raw = progressSnapshot(session), battle = new Battle(fixed, 1, 0, loadSessionProgress({ getItem: () => raw }));
  const deployed = battle.pets.find(p => p.deployed);
  assert.equal(deployed.id, pet.id); assert.deepEqual(deployed.skillIds, ['thunder']); assert.equal(deployed.attack, pet.attack);
});
