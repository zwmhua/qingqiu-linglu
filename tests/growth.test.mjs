import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { TINGWA_GROWTH, generateGrowth } = await import('../assets/battle/logic/growth.ts');
const { Battle } = await import('../assets/battle/scripts/Battle.ts');
const { petCombat } = await import('../assets/battle/logic/pet-panel.ts');

test('normal and baby growth include their configured endpoints and use thousandths', () => {
  assert.deepEqual(TINGWA_GROWTH, { min: 0.882, max: 0.918, decimals: 3 });
  assert.equal(generateGrowth(false, () => 0), 0.882);
  assert.equal(generateGrowth(false, () => 1), 0.918);
  assert.equal(generateGrowth(true, () => 0), 0.900);
  assert.equal(generateGrowth(true, () => 1), 0.918);
  for (const baby of [false, true]) for (let i = 0; i <= 100; i++) {
    const growth = generateGrowth(baby, () => i / 100);
    assert.ok(growth >= (baby ? 0.900 : 0.882) && growth <= 0.918);
    assert.equal(growth * 1000, Math.round(growth * 1000));
    assert.match(growth.toFixed(3), /^0\.\d{3}$/);
  }
});

test('each initial pet rolls once and next battle keeps its own growth and combat stats', () => {
  let calls = 0;
  const battle = new Battle(() => 0.5, 1, 0, undefined, () => 1, () => 0, () => calls++ === 0 ? 0 : 1);
  assert.equal(calls, 3);
  assert.deepEqual(battle.roster.entries.map(pet => pet.growth), [0.882, 0.918]);
  assert.deepEqual(battle.pets.map(({ hp, maxHp, attack, defense, speed }) => ({ hp, maxHp, attack, defense, speed })),
    battle.roster.entries.map(petCombat));
  const next = new Battle(() => 0.5, 1, 0, battle.roster, () => 1, () => 1, () => { calls++; return 0; });
  assert.equal(calls, 4);
  assert.deepEqual(next.roster.entries.map(pet => pet.growth), [0.882, 0.918]);
});

test('captured baby keeps growth through summon and another battle', () => {
  const battle = new Battle(() => 0, 2, 0, undefined, () => 0, () => 0, () => 0);
  const baby = battle.enemies[0];
  assert.equal(baby.growth, 0.900);
  battle.command('hero', 'capture', baby.id);
  battle.command('pet', 'defend');
  const caught = battle.roster.entries[2];
  assert.equal(caught.growth, 0.900);
  battle.command('hero', 'summon', caught.id);
  battle.command('pet', 'defend');
  assert.equal(battle.pets.find(pet => pet.id === caught.id).growth, 0.900);
  const next = new Battle(() => 0.5, 1, 0, battle.roster, () => 1, () => 1, () => 1);
  assert.equal(next.roster.entries[2].growth, 0.900);
  assert.equal(next.summonTargets().find(pet => pet.id === caught.id).growth, 0.900);
});
