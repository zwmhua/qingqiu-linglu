import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { petTint } = await import('../assets/logic/pet-visual.ts');
const { CONFIG } = await import('../assets/scripts/config.ts');
const { Battle } = await import('../assets/scripts/Battle.ts');

test('pet tint is determined only by mutation identity', () => {
  const colors = CONFIG.visual.petTint;
  assert.equal(petTint(false, colors), colors.normal);
  assert.equal(petTint(undefined, colors), colors.normal);
  assert.equal(petTint(true, colors), colors.mutated);
  assert.notEqual(colors.normal, colors.mutated);
});

test('a hit leaves captured mutation identity and its recovery tint intact', () => {
  let roll = 0;
  const battle = new Battle(() => roll, 2, 0, undefined, () => 1,
    () => 0, () => 0, () => 0, () => 0);
  battle.command('hero', 'capture', 'enemy-0');
  battle.command('pet', 'defend');
  const caught = battle.roster.entries[2];
  assert.equal(caught.isMutated, true);
  roll = 0.9;
  battle.command('hero', 'summon', caught.id);
  battle.command('pet', 'defend');
  assert.ok(battle.events.some(event => event.kind === 'attack' && event.targetId === caught.id));
  const deployed = battle.pets.find(pet => pet.id === caught.id);
  assert.equal(deployed.isMutated, true);
  assert.equal(caught.isMutated, true);
  assert.equal(petTint(deployed.isMutated, CONFIG.visual.petTint), CONFIG.visual.petTint.mutated);
});
