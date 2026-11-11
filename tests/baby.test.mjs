import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { Battle } = await import('../assets/scripts/Battle.ts');
const { CONFIG } = await import('../assets/scripts/config.ts');

test('each encountered frog gets an independent 5% baby roll', () => {
  const values = [0, 0.05, 0.049999];
  let rolls = 0;
  const battle = new Battle(() => 0.5, 3, 0, undefined, () => values[rolls++]);
  assert.equal(CONFIG.baby.encounterRate, 0.05);
  assert.equal(rolls, 3);
  assert.deepEqual(battle.enemies.map(enemy => [enemy.name, enemy.level, enemy.isBaby]), [
    ['汀蛙宝宝', 0, true], ['野外汀蛙', 1, false], ['汀蛙宝宝', 0, true],
  ]);
  assert.deepEqual(battle.enemies.map(enemy => enemy.combatLevel), [1, 1, 1]);
  assert.deepEqual(battle.roster.entries.map(pet => [pet.level, pet.isBaby]), [[1, false], [1, false]]);
  assert.deepEqual(battle.pets.map(pet => pet.combatLevel), [1, 1]);
});

test('level-zero baby fights with the existing level-one stats', () => {
  const baby = new Battle(() => 0.5, 1, 0, undefined, () => 0).enemies[0];
  const normal = new Battle(() => 0.5, 1, 0, undefined, () => 1).enemies[0];
  assert.equal(baby.level, 0);
  assert.equal(baby.combatLevel, 1);
  assert.deepEqual([baby.hp, baby.attack, baby.defense, baby.speed],
    [normal.hp, normal.attack, normal.defense, normal.speed]);
  assert.equal(normal.isBaby, false);
});

test('capture, summon and another battle preserve baby identity and unique ID', () => {
  const battle = new Battle(() => 0, 2, 0, undefined, () => 0);
  battle.enemies[0].hp = 8;
  battle.command('hero', 'capture', 'enemy-0');
  battle.command('pet', 'defend');
  const caught = battle.roster.entries[2];
  assert.deepEqual([caught.name, caught.level, caught.isBaby, caught.hp], ['汀蛙宝宝', 0, true, 8]);
  assert.equal(battle.summonTargets().find(pet => pet.id === caught.id)?.isBaby, true);
  battle.command('hero', 'summon', caught.id);
  battle.command('pet', 'defend');
  assert.equal(battle.pets.find(pet => pet.id === caught.id).deployed, true);
  assert.equal(battle.pets.find(pet => pet.id === caught.id).level, 0);

  const next = new Battle(() => 0.5, 1, 0, battle.roster, () => 1);
  assert.deepEqual([next.roster.entries[2].id, next.roster.entries[2].level,
    next.roster.entries[2].isBaby, next.roster.entries[2].hp], [caught.id, 0, true, caught.maxHp]);
  assert.equal(next.summonTargets().find(pet => pet.id === caught.id)?.isBaby, true);
  assert.equal(new Battle(() => 0.5, 1, 0, undefined, () => 1).roster.entries.length, 2);
});

test('failed capture does not add a baby to the roster', () => {
  const battle = new Battle(() => 0.99, 1, 0, undefined, () => 0);
  battle.command('hero', 'capture', 'enemy-0');
  battle.command('pet', 'defend');
  assert.equal(battle.enemies[0].isBaby, true);
  assert.equal(battle.enemies[0].left, false);
  assert.equal(battle.roster.entries.length, 2);
});
