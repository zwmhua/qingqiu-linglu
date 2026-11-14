import { segmentWalkable, TOWN, type TownPoint } from '../logic/exploration';

type Area = { width: number; height: number; spawn: TownPoint; regions: readonly (readonly TownPoint[])[] };
const distance = (a: TownPoint, b: TownPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const inside = (p: TownPoint, area: Area) => segmentWalkable(p, p, area.regions);

function nearestWalkable(point: TownPoint, area: Area): TownPoint | undefined {
  if (![point.x, point.y].every(Number.isFinite)) return;
  if (inside(point, area)) return { ...point };
  let nearest: TownPoint | undefined;
  let best = Infinity;
  for (const region of area.regions) for (let i = 0; i < region.length; i++) {
    const a = region[i], b = region[(i + 1) % region.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
    const candidate = { x: a.x + t * dx, y: a.y + t * dy };
    const length = distance(candidate, point);
    if (length < best && inside(candidate, area)) { best = length; nearest = candidate; }
  }
  return nearest;
}

export function planPath(from: TownPoint, click: TownPoint, area: Area, cell = 20): TownPoint[] | undefined {
  const goal = nearestWalkable(click, area);
  if (!goal || !inside(from, area)) return;
  if (segmentWalkable(from, goal, area.regions)) return [goal];
  const columns = Math.ceil(area.width / cell), rows = Math.ceil(area.height / cell);
  const point = (id: number): TownPoint => ({ x: (id % columns + 0.5) * cell,
    y: (Math.floor(id / columns) + 0.5) * cell });
  const passable = new Map<number, boolean>();
  const openCell = (id: number) => {
    if (!passable.has(id)) passable.set(id, inside(point(id), area));
    return passable.get(id)!;
  };
  const nearestCell = (p: TownPoint) => {
    let chosen = -1, best = Infinity;
    for (let id = 0; id < columns * rows; id++) {
      const candidate = point(id), d = distance(p, candidate);
      if (d < best && openCell(id) && segmentWalkable(p, candidate, area.regions)) {
        chosen = id;
        best = d;
      }
    }
    return chosen;
  };
  const start = nearestCell(from), end = nearestCell(goal);
  if (start < 0 || end < 0) return;
  const open = new Set([start]), closed = new Set<number>();
  const cost = new Map([[start, 0]]), parent = new Map<number, number>();
  while (open.size) {
    let current = -1, score = Infinity;
    for (const id of open) {
      const value = cost.get(id)! + distance(point(id), point(end));
      if (value < score) { current = id; score = value; }
    }
    if (current === end) {
      const route = [goal];
      for (let id = end; id !== start; id = parent.get(id)!) route.unshift(point(id));
      route.unshift(point(start));
      const all = [from, ...route], smooth: TownPoint[] = [];
      for (let i = 0; i < all.length - 1;) {
        let next = all.length - 1;
        while (next > i + 1 && !segmentWalkable(all[i], all[next], area.regions)) next--;
        smooth.push(all[next]);
        i = next;
      }
      return smooth;
    }
    open.delete(current);
    closed.add(current);
    const x = current % columns, y = Math.floor(current / columns);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x + dx < 0 || x + dx >= columns || y + dy < 0 || y + dy >= rows) continue;
      const next = (y + dy) * columns + x + dx;
      if (closed.has(next) || !openCell(next) || !segmentWalkable(point(current), point(next), area.regions)) continue;
      const nextCost = cost.get(current)! + Math.hypot(dx, dy) * cell;
      if (nextCost < (cost.get(next) ?? Infinity)) {
        cost.set(next, nextCost);
        parent.set(next, current);
        open.add(next);
      }
    }
  }
}

export class WalkMovement {
  position: TownPoint;
  target?: TownPoint;
  destination?: TownPoint;
  private route: TownPoint[] = [];
  private area: Area;
  private cell: number;
  constructor(area: Area, cell = 20) { this.area = area; this.cell = cell; this.position = { ...area.spawn }; }
  stop(): void { this.route = []; this.target = this.destination = undefined; }
  select(point: TownPoint): boolean {
    this.stop();
    const route = planPath(this.position, point, this.area, this.cell);
    if (!route?.length) return false;
    this.route = route;
    this.destination = route.at(-1);
    this.target = route[0];
    return true;
  }
  update(dt: number, intercept?: (distance: number) => number | undefined): void {
    if (!this.target || !Number.isFinite(dt) || dt <= 0) return;
    let step = TOWN.speed * dt;
    while (this.target && step > 0) {
      const length = distance(this.position, this.target);
      const travelled = Math.min(step, length);
      const hit = travelled > 0 ? intercept?.(travelled) : undefined;
      if (hit !== undefined) {
        this.position = { x: this.position.x + (this.target.x - this.position.x) * hit / length,
          y: this.position.y + (this.target.y - this.position.y) * hit / length };
        this.stop();
        return;
      }
      if (step >= length) {
        this.position = this.target;
        step -= length;
        this.route.shift();
        this.target = this.route[0];
        if (!this.target) this.stop();
      } else {
        this.position = { x: this.position.x + (this.target.x - this.position.x) * step / length,
          y: this.position.y + (this.target.y - this.position.y) * step / length };
        step = 0;
      }
    }
  }
}
