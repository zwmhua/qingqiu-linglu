import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !s.endsWith('.ts') ? `${s}.ts` : s, c); } });
const { segmentWalkable, MAPS, TOWN } = await import('../assets/battle/logic/exploration.ts');
const { WALKABLE_CONFIG } = await import('../assets/battle/scripts/config.ts');
const { WalkMovement, planPath } = await import('../assets/battle/scripts/walkable-path.ts');

const rect = (x0, y0, x1, y1) => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];
const ring = { width: 120, height: 120, spawn: { x: 10, y: 60 }, regions: [
  rect(0, 0, 120, 40), rect(0, 80, 120, 120),
  rect(0, 40, 40, 80), rect(80, 40, 120, 80),
] };

test('A* avoids a blocked center, smooths the route and projects an invalid click', () => {
  const route = planPath(ring.spawn, { x: 110, y: 60 }, ring);
  assert.ok(route && route.length > 1);
  assert.deepEqual(route.at(-1), { x: 110, y: 60 });
  for (const [i, point] of route.entries()) {
    assert.ok(segmentWalkable(i ? route[i - 1] : ring.spawn, point, ring.regions));
  }
  const projected = planPath(ring.spawn, { x: 60, y: 60 }, ring);
  assert.ok(projected);
  assert.ok(Math.abs(Math.hypot(projected.at(-1).x - 60, projected.at(-1).y - 60) - 20) < 2);
  assert.ok(segmentWalkable(projected.at(-1), projected.at(-1), ring.regions));
});

test('routed movement keeps 180 units/s, replaces a route and stops without catch-up', () => {
  const clear = new WalkMovement({ width: 120, height: 120,
    spawn: { x: 10, y: 60 }, regions: [rect(0, 0, 120, 120)] });
  assert.ok(clear.select({ x: 110, y: 60 }));
  clear.update(0.5);
  assert.deepEqual(clear.position, { x: 100, y: 60 });
  const move = new WalkMovement(ring);
  assert.ok(move.select({ x: 110, y: 60 }));
  assert.deepEqual(move.destination, { x: 110, y: 60 });
  move.update(0.5);
  assert.ok(move.target);
  assert.ok(move.select({ x: 60, y: 60 }));
  assert.ok(Math.abs(Math.hypot(move.destination.x - 60, move.destination.y - 60) - 20) < 2);
  move.stop();
  const stopped = { ...move.position };
  move.update(100);
  assert.deepEqual(move.position, stopped);
  assert.equal(move.target, undefined);
});

test('town routes reach all entrances and the far bridge bank without crossing obstacles', () => {
  const area = { ...MAPS.town, spawn: TOWN.spawn, regions: WALKABLE_CONFIG.townRegions };
  for (const [name, point] of Object.entries({
    market: { x: 385, y: 350 }, pet: { x: 520, y: 690 },
    notice: { x: 1000, y: 600 }, furnace: { x: 1200, y: 480 },
    gate: { x: 1450, y: 230 }, bridgeFarBank: { x: 1510, y: 685 },
  })) {
    const route = planPath(area.spawn, point, area);
    assert.ok(route, `${name} has a route`);
    assert.ok(Math.hypot(route.at(-1).x - point.x, route.at(-1).y - point.y) < 25, `${name} reached`);
    for (const [i, waypoint] of route.entries()) {
      assert.ok(segmentWalkable(i ? route[i - 1] : area.spawn, waypoint, area.regions), `${name} segment ${i}`);
    }
  }
  for (const [i, region] of area.regions.entries()) {
    const center = { x: region.reduce((sum, p) => sum + p.x, 0) / region.length,
      y: region.reduce((sum, p) => sum + p.y, 0) / region.length };
    assert.ok(planPath(area.spawn, center, area), `walkable region ${i + 1} connects to the plaza`);
  }
  for (const [name, p] of Object.entries({
    plaza: [700,470,760,490,950,485], marketLeft: [160,400,230,400,300,420], petGate: [495,650,530,680,580,690],
    noticeBottom: [700,650,640,730,600,760,550,790], furnaceFront: [1170,475,1200,530,1200,550],
    bridgeDeck: [1150,555,1250,590,1350,605,1450,640,1510,685],
  })) for (let i = 2; i < p.length; i += 2) assert.ok(segmentWalkable(
    { x: p[i - 2], y: p[i - 1] }, { x: p[i], y: p[i + 1] }, area.regions), `${name} segment ${i / 2}`);
  assert.equal(segmentWalkable({ x: 1200, y: 450 }, { x: 1200, y: 450 }, area.regions), false, 'furnace platform rim');
  for (const point of [{ x: 200, y: 200 }, { x: 340, y: 610 }, { x: 875, y: 590 }, { x: 885, y: 715 }, { x: 775, y: 675 }, { x: 985, y: 640 },
    { x: 770, y: 280 }, { x: 1220, y: 350 }, { x: 1230, y: 810 }]) {
    assert.equal(segmentWalkable(point, point, area.regions), false, `obstacle ${point.x},${point.y}`);
  }
});

test('outskirts use the same route planner with their existing regions', () => {
  const area = { ...MAPS.outskirts, spawn: MAPS.outskirts.spawn, regions: MAPS.outskirts.regions };
  const route = planPath(area.spawn, { x: 2400, y: 600 }, area);
  assert.ok(route);
  for (const [i, point] of route.entries()) {
    assert.ok(segmentWalkable(i ? route[i - 1] : area.spawn, point, area.regions));
  }
});
