import { BABY_CONFIG } from './baby';
import { BATTLE_RULES } from './battle-rules';
import { MUTATION_CONFIG } from './mutation';
import { speciesKeys, wildLevels } from './wild-encounter';

export type TownPoint = { x: number; y: number };
type Size = { width: number; height: number };
type ConvexRegion = readonly TownPoint[];
type WalkArea = { spawn: TownPoint; regions: readonly ConvexRegion[] };
export type Region = 'town' | 'outskirts';

export const TOWN = {
  speed: 180, tolerance: 0.01, spawn: { x: 667, y: 500 },
  // Canvas coordinates, clockwise: clear paving between the stalls and ornaments.
  vertices: [{ x: 490, y: 310 }, { x: 900, y: 310 }, { x: 1090, y: 445 },
    { x: 970, y: 620 }, { x: 450, y: 620 }, { x: 390, y: 450 }],
};

export const OUTSKIRTS = {
  width: 3344 * 750 / 941, height: 750, spawn: { x: 540, y: 375 },
  // The near bank bends southeast below the bridge. Every polygon is clockwise.
  regions: [
    [{ x: 65, y: 365 }, { x: 590, y: 365 }, { x: 590, y: 530 }, { x: 65, y: 530 }],
    [{ x: 420, y: 350 }, { x: 1700, y: 350 }, { x: 1700, y: 470 }, { x: 420, y: 470 }],
    [{ x: 1530, y: 420 }, { x: 1700, y: 402 }, { x: 2595, y: 585 },
      { x: 2595, y: 630 }, { x: 1720, y: 524 }, { x: 1530, y: 470 }],
  ],
  pool: { species: speciesKeys, levels: wildLevels, counts: BATTLE_RULES.encounter,
    baby: BABY_CONFIG, mutation: MUTATION_CONFIG },
};

const townArea = { spawn: TOWN.spawn, regions: [TOWN.vertices] };
export const MAPS = {
  town: { name: '城里', texture: 'map_qingqiu_town', width: 2048, height: 1152, area: townArea },
  outskirts: { name: '野外', texture: 'map_qingqiu_outskirts_wide', ...OUTSKIRTS, area: OUTSKIRTS },
};

export function cameraOrigin(point: TownPoint, world: Size, viewport: Size): TownPoint {
  const axis = (coordinate: number, size: number, extent: number) => size <= extent
    ? (size - extent) / 2 : Math.max(0, Math.min(size - extent, coordinate - extent / 2));
  return { x: axis(point.x, world.width, viewport.width), y: axis(point.y, world.height, viewport.height) };
}

export function worldPoint(local: TownPoint, origin: TownPoint, viewport: Size): TownPoint {
  return { x: local.x + viewport.width / 2 + origin.x, y: viewport.height / 2 - local.y + origin.y };
}

export function walkable(p: TownPoint): boolean {
  return segmentWalkable(p, p, townArea.regions);
}

function coveredInterval(from: TownPoint, to: TownPoint, region: ConvexRegion): [number, number] | undefined {
  let entry = 0, exit = 1;
  for (const [i, a] of region.entries()) {
    const b = region[(i + 1) % region.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const distance = (p: TownPoint) => (dx * (p.y - a.y) - dy * (p.x - a.x)) / Math.hypot(dx, dy);
    const start = distance(from) + TOWN.tolerance, end = distance(to) + TOWN.tolerance;
    if (start < 0 && end < 0) return;
    if (start < 0) entry = Math.max(entry, start / (start - end));
    if (end < 0) exit = Math.min(exit, start / (start - end));
    if (entry > exit) return;
  }
  return [entry, exit];
}

export function segmentWalkable(from: TownPoint, to: TownPoint, regions: readonly ConvexRegion[]): boolean {
  if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) return false;
  const intervals = regions.flatMap(region => {
    const interval = coveredInterval(from, to, region);
    return interval ? [interval] : [];
  }).sort(([a], [b]) => a - b);
  let covered = 0;
  for (const [entry, exit] of intervals) {
    if (entry > covered) return false;
    covered = Math.max(covered, exit);
    if (covered === 1) return true;
  }
  return false;
}

export class TownMovement {
  position: TownPoint;
  target?: TownPoint;
  private readonly area: WalkArea;
  constructor(area: WalkArea = townArea) {
    this.area = area;
    this.position = { ...area.spawn };
  }
  stop(): void { this.target = undefined; }
  select(point: TownPoint): boolean {
    this.stop();
    if (!segmentWalkable(this.position, point, this.area.regions)) return false;
    this.target = { ...point };
    return true;
  }
  update(dt: number): void {
    if (!this.target || !Number.isFinite(dt) || dt <= 0) return;
    const dx = this.target.x - this.position.x, dy = this.target.y - this.position.y;
    const distance = Math.hypot(dx, dy), step = TOWN.speed * dt;
    if (step >= distance) {
      this.position = this.target;
      this.stop();
    } else this.position = { x: this.position.x + dx * step / distance, y: this.position.y + dy * step / distance };
  }
}
