import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { CONFIG } = await import('../assets/battle/scripts/config.ts');

test('ten enemies occupy two parallel diagonal rows with three active slots centered', () => {
  const [middle, lowerLeft, upperRight] = CONFIG.positions.enemy;
  assert.equal(CONFIG.positions.enemy.length, 10);
  assert.ok(lowerLeft.x < middle.x && lowerLeft.y > middle.y);
  assert.ok(upperRight.x > middle.x && upperRight.y < middle.y);
  for (const other of [lowerLeft, upperRight]) {
    assert.equal(Math.abs(other.x - middle.x), CONFIG.positions.spacing.enemyColumnX);
    assert.equal(Math.abs(other.y - middle.y), CONFIG.positions.spacing.enemyColumnY);
  }
  const front = [CONFIG.positions.enemy[3], lowerLeft, middle, upperRight, CONFIG.positions.enemy[4]];
  const back = CONFIG.positions.enemy.slice(5);
  for (const row of [front, back]) for (let i = 1; i < row.length; i++) {
    assert.equal(row[i].x - row[i - 1].x, CONFIG.positions.spacing.enemyColumnX);
    assert.equal(row[i - 1].y - row[i].y, CONFIG.positions.spacing.enemyColumnY);
  }
  for (let i = 0; i < 5; i++) {
    assert.equal(front[i].x - back[i].x, CONFIG.positions.spacing.enemyRowX);
    assert.equal(front[i].y - back[i].y, CONFIG.positions.spacing.enemyRowY);
  }
});

test('five allied pets and heroes occupy parallel rows with room for art and labels', () => {
  assert.equal(CONFIG.positions.allyGroups.length, 5);
  const groups = [...CONFIG.positions.allyGroups].sort((a, b) => a.pet.x - b.pet.x);
  for (let i = 0; i < 5; i++) {
    const { pet, hero } = groups[i];
    assert.equal(hero.x - pet.x, CONFIG.positions.spacing.allyRowX);
    assert.equal(hero.y - pet.y, CONFIG.positions.spacing.allyRowY);
    assert.ok(hero.y + CONFIG.visual.nameGap + CONFIG.visual.nameSize * 2 < CONFIG.height);
    if (i > 0) {
      assert.equal(pet.x - groups[i - 1].pet.x, CONFIG.positions.spacing.allyColumnX);
      assert.equal(groups[i - 1].pet.y - pet.y, CONFIG.positions.spacing.allyColumnY);
    }
  }
  assert.equal(CONFIG.visual.unitScale, 0.5);
  assert.equal(CONFIG.visual.heroHeight * CONFIG.visual.unitScale, 120);
  assert.equal(CONFIG.visual.frogHeight * CONFIG.visual.unitScale, 85);
});

test('active pet stands in front of the unchanged hero in one to three enemy encounters', () => {
  const { pet, hero } = CONFIG.positions.allyGroups[0];
  assert.deepEqual(hero, { x: 1025, y: 570 });
  assert.ok(pet.x <= hero.x - 120);
  assert.ok(pet.y >= hero.y - 90 && pet.y <= hero.y - 50);
  const enemy = CONFIG.positions.enemy[0];
  assert.ok(Math.abs((hero.y - pet.y) / (hero.x - pet.x) -
    (hero.y - enemy.y) / (hero.x - enemy.x)) < 0.02);
  for (const count of [1, 2, 3]) {
    assert.ok(CONFIG.positions.enemy.slice(0, count).every(enemy => enemy.x < pet.x));
  }
});

test('sprite opaque feet align with the ground-ring center', () => {
  const { unitScale, footOffset } = CONFIG.visual;
  assert.ok(Math.abs(footOffset.frog - (35 * unitScale + 4)) <= 0.5);
  assert.ok(Math.abs(footOffset.hero - (3 * unitScale + 4)) <= 0.5);
});

test('full formation keeps unit art, health bars, and foot labels apart', () => {
  const enemy = CONFIG.positions.enemy.map((point, index) => ({ id: `enemy-${index}`, type: 'enemy', ...point }));
  const allies = CONFIG.positions.allyGroups.flatMap(({ pet, hero }, index) => [
    { id: `pet-${index}`, type: 'pet', ...pet },
    { id: `hero-${index}`, type: 'hero', ...hero },
  ]);
  const units = [...enemy, ...allies];
  const v = CONFIG.visual;
  const rect = (x, y, width, height) => ({ x, y, width, height });
  const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height;
  const areas = units.flatMap(unit => {
    const hero = unit.type === 'hero';
    const pet = unit.type === 'pet';
    const height = (hero ? v.heroHeight : v.frogHeight) * v.unitScale;
    const barY = unit.y - height - v.headGap - v.barHeight - (hero || pet ? v.barHeight + v.barGap : 0);
    const nameWidth = pet ? v.petNameWidth : v.nameWidth;
    return [
      { id: unit.id, kind: 'art', box: rect(unit.x - (hero ? 42 : 45), unit.y - height,
        hero ? 84 : 90, height) },
      { id: unit.id, kind: 'bar', box: rect(unit.x + (hero ? v.heroHeadOffsetX : 0) - v.barWidth / 2,
        barY, v.barWidth, hero || pet ? 17 : 8) },
      { id: unit.id, kind: 'name', box: rect(unit.x + (pet ? v.petNameOffsetX : 0) - nameWidth / 2,
        unit.y + 19 + v.nameGap, nameWidth, v.nameSize * 1.7) },
    ];
  });
  for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++) {
    if (areas[i].id === areas[j].id) continue;
    assert.ok(!intersects(areas[i].box, areas[j].box),
      `${areas[i].id} ${areas[i].kind} overlaps ${areas[j].id} ${areas[j].kind}`);
  }
});
