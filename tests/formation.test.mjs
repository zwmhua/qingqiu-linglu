import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../assets/scripts/config.ts';

test('the active enemies fan out from a middle slot along an ascending diagonal', () => {
  const [middle, lowerLeft, upperRight] = CONFIG.positions.enemy;
  assert.equal(CONFIG.positions.enemy.length, 10);
  assert.ok(lowerLeft.x < middle.x && lowerLeft.y > middle.y);
  assert.ok(upperRight.x > middle.x && upperRight.y < middle.y);
  for (const other of [lowerLeft, upperRight]) {
    assert.ok(Math.abs(other.x - middle.x) >= 105 && Math.abs(other.x - middle.x) <= 115);
    assert.ok(Math.abs(other.y - middle.y) >= 55 && Math.abs(other.y - middle.y) <= 65);
  }
});

test('the five ally pairs put the hero about 90 pixels behind the pet', () => {
  assert.equal(CONFIG.positions.allyGroups.length, 5);
  const { pet, hero } = CONFIG.positions.allyGroups[0];
  assert.ok(hero.x > pet.x && hero.y > pet.y);
  const gap = Math.hypot(hero.x - pet.x, hero.y - pet.y);
  assert.ok(gap >= 85 && gap <= 95);
  assert.equal(CONFIG.visual.unitScale, 0.5);
  assert.equal(CONFIG.visual.heroHeight * CONFIG.visual.unitScale, 120);
  assert.equal(CONFIG.visual.frogHeight * CONFIG.visual.unitScale, 85);
});
