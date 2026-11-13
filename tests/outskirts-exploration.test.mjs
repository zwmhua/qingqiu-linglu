import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !s.endsWith('.ts') ? `${s}.ts` : s, c); } });
const { OUTSKIRTS, TownMovement, cameraOrigin, worldPoint, segmentWalkable } =
  await import('../assets/battle/logic/exploration.ts');

const rectangle = (left, right) => [
  { x: left, y: 0 }, { x: right, y: 0 }, { x: right, y: 10 }, { x: left, y: 10 },
];

test('the whole segment must stay in the union of convex regions', () => {
  const from = { x: 2, y: 5 }, to = { x: 18, y: 5 };
  const left = rectangle(0, 10), right = rectangle(10, 20);
  assert.equal(segmentWalkable(from, to, [rectangle(0, 20)]), true);
  assert.equal(segmentWalkable(from, to, [right, left]), true);
  assert.equal(segmentWalkable(to, from, [left, rectangle(9, 20)]), true);
  const gap = [left, rectangle(10.1, 20)];
  assert.equal(segmentWalkable(from, from, gap), true);
  assert.equal(segmentWalkable(to, to, gap), true);
  assert.equal(segmentWalkable(from, to, gap), false);
  assert.equal(segmentWalkable(from, to, [left, rectangle(10.01, 20)]), true);
  assert.equal(segmentWalkable(from, { x: Infinity, y: 5 }, gap), false);
});

test('camera clamps both edges, centers short axes and maps scrolled clicks', () => {
  const viewport = { width: 1334, height: 750 };
  const left = cameraOrigin({ x: 0, y: 375 }, OUTSKIRTS, viewport);
  const right = cameraOrigin({ x: OUTSKIRTS.width, y: 375 }, OUTSKIRTS, viewport);
  assert.deepEqual(left, { x: 0, y: 0 });
  assert.deepEqual(right, { x: OUTSKIRTS.width - 1334, y: 0 });
  assert.deepEqual(cameraOrigin({ x: 0, y: 0 }, { width: 600, height: 300 }, viewport),
    { x: -367, y: -225 });
  assert.deepEqual(worldPoint({ x: 100, y: 50 }, right, viewport),
    { x: right.x + 767, y: 325 });
});

test('camera motion does not contribute to travel and a rejected target stops movement', () => {
  const viewport = { width: 1334, height: 750 };
  const move = new TownMovement(OUTSKIRTS);
  assert.deepEqual(move.position, OUTSKIRTS.spawn);
  const start = { x: 710, y: 375 };
  move.position = start;
  const before = cameraOrigin(start, OUTSKIRTS, viewport);
  assert.ok(move.select({ x: 1000, y: 375 }));
  move.update(0.5);
  assert.deepEqual(move.position, { x: 800, y: 375 });
  assert.equal(cameraOrigin(move.position, OUTSKIRTS, viewport).x - before.x, 90);
  assert.equal(move.select({ x: 1800, y: 200 }), false);
  assert.equal(move.target, undefined);
  move.update(10);
  assert.deepEqual(move.position, { x: 800, y: 375 });
});
