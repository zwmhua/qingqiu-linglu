import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !s.endsWith('.ts') ? `${s}.ts` : s, c); } });
const { TownMovement, TOWN, walkable } = await import('../assets/battle/logic/exploration.ts');

test('convex plaza includes spawn and edges with a world-unit tolerance', () => {
  assert.ok(walkable(TOWN.spawn));
  for (const point of TOWN.vertices) assert.ok(walkable(point));
  const [a, b] = TOWN.vertices;
  const edge = { x: (a.x + b.x) / 2, y: a.y };
  assert.ok(walkable({ ...edge, y: edge.y - TOWN.tolerance / 2 }));
  assert.equal(walkable({ ...edge, y: edge.y - TOWN.tolerance * 2 }), false);
  assert.equal(walkable({ x: NaN, y: 400 }), false);
});

test('180 units per second, partition invariance, replacement and exact arrival', () => {
  const one = new TownMovement(), split = new TownMovement();
  const target = { x: TOWN.spawn.x + 200, y: TOWN.spawn.y };
  for (const move of [one, split]) assert.ok(move.select(target));
  one.update(0.5);
  for (let i = 0; i < 5; i++) split.update(0.1);
  assert.ok(Math.abs(one.position.x - TOWN.spawn.x - 90) < 1e-8);
  assert.ok(Math.abs(one.position.x - split.position.x) < 1e-8);
  one.select(TOWN.spawn);
  one.update(10);
  assert.deepEqual(one.position, TOWN.spawn);
  assert.equal(one.target, undefined);
  split.update(10);
  assert.deepEqual(split.position, target);
});

test('invalid click and pause discard the old target; resume never catches up', () => {
  const move = new TownMovement();
  move.select({ x: 850, y: 500 });
  assert.equal(move.select({ x: 0, y: 0 }), false);
  move.update(10);
  assert.deepEqual(move.position, TOWN.spawn);
  move.select({ x: 850, y: 500 });
  move.stop();
  move.update(100);
  assert.deepEqual(move.position, TOWN.spawn);
});
