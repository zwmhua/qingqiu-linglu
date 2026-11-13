import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !s.endsWith('.ts') ? `${s}.ts` : s, c); } });
const { TownMovement, TOWN, MAPS, TOWN_PLACES, cameraOrigin, walkable } =
  await import('../assets/battle/logic/exploration.ts');

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
  assert.ok(move.select({ x: 850, y: TOWN.spawn.y }));
  assert.equal(move.select({ x: 0, y: 0 }), false);
  move.update(10);
  assert.deepEqual(move.position, TOWN.spawn);
  assert.ok(move.select({ x: 850, y: TOWN.spawn.y }));
  move.stop();
  move.update(100);
  assert.deepEqual(move.position, TOWN.spawn);
});

test('new town has a scrollable street network and five distinct map entrances', () => {
  const map = MAPS.town;
  assert.deepEqual([map.texture, map.width, map.height], ['town_qingqiu_streets', 1672, 941]);
  assert.deepEqual(TOWN_PLACES.map(place => place.id), ['bag', 'pet', 'fuse', 'notice', 'exit']);
  for (const [x, y] of [[690, 443], [632, 590], [1120, 306], [1460, 208], [385, 754]]) {
    assert.equal(walkable({ x, y }), true, `street ${x},${y}`);
  }
  for (const [x, y] of [[890, 194], [1210, 808], [481, 590], [748, 298], [878, 590]]) {
    assert.equal(walkable({ x, y }), false, `obstacle ${x},${y}`);
  }
  const move = new TownMovement();
  const origin = cameraOrigin(move.position, map, { width: 1334, height: 750 });
  assert.ok(move.select({ x: 840, y: 460 }));
  move.update(2);
  assert.deepEqual(move.position, { x: 840, y: 460 });
  const scrolled = cameraOrigin(move.position, map, { width: 1334, height: 750 });
  assert.ok(scrolled.x > origin.x && scrolled.y > origin.y);
  const gate = TOWN_PLACES.find(place => place.id === 'exit');
  assert.ok(gate.y - origin.y > 122, 'gate label clears the portrait row during approach');
  for (const [x, y] of [[960, 380], [1230, 292], [1390, 231], [gate.x, gate.y]]) {
    assert.ok(move.select({ x, y }), `gate route ${x},${y}`);
    move.update(10);
  }
  const edge = cameraOrigin(move.position, map, { width: 1334, height: 750 });
  assert.ok(gate.x - edge.x < 1334 && gate.y - edge.y > 0);
});
