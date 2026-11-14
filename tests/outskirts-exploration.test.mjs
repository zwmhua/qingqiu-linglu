import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !s.endsWith('.ts') ? `${s}.ts` : s, c); } });
const { OUTSKIRTS, TownMovement, cameraOrigin, worldPoint, segmentWalkable } =
  await import('../assets/battle/logic/exploration.ts');

const rectangle = (left, right) => [
  { x: left, y: 0 }, { x: right, y: 0 }, { x: right, y: 10 }, { x: left, y: 10 },
];

test('distance protection, probability endpoints and fractional frame splitting', async () => {
  const { EncounterDistance } = await import('../assets/battle/logic/exploration.ts');
  assert.deepEqual(OUTSKIRTS.encounter, { protection: 180, interval: 60, probability: 0.1 });
  const counter = new EncounterDistance();
  let draws = 0;
  const hit = () => { draws++; return 0; };
  assert.equal(counter.advance(180, hit), undefined);
  assert.equal(counter.protection, 0);
  assert.equal(counter.advance(59.5, hit), undefined);
  assert.equal(draws, 0);
  assert.equal(counter.advance(10, hit), 0.5);
  assert.equal(draws, 1);
  const fractional = new EncounterDistance();
  let fractionalHit;
  for (let i = 0; i < 2400; i++) {
    const stop = fractional.advance(0.1, () => 0);
    if (stop !== undefined) fractionalHit = i * 0.1 + stop;
  }
  assert.ok(Math.abs(fractionalHit - 240) < 1e-9, 'decimal frame rounding must not miss the first threshold');
  for (const probability of [0, 1]) {
    const run = pieces => {
      const c = new EncounterDistance({ ...OUTSKIRTS.encounter, probability });
      let walked = 0;
      for (const piece of pieces) {
        const stop = c.advance(piece, () => 0.5);
        if (stop !== undefined) return { walked: walked + stop, c };
        walked += piece;
      }
      return { walked, c };
    };
    assert.deepEqual(run([300.25]), run(Array(1201).fill(0.25)));
    assert.equal(run([300.25]).walked, probability ? 240 : 300.25);
    assert.equal(run([300.25]).c.remainder, probability ? 0 : 0.25);
  }
  const multi = new EncounterDistance(), sequence = [0.9, 0.1, 0.09, 0];
  assert.equal(multi.advance(1000, () => sequence.shift()), 360);
  assert.deepEqual(sequence, [0]);
  multi.reset();
  assert.equal(multi.protection, 180);
  assert.equal(multi.remainder, 0);
});

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
