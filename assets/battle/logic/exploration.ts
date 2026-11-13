export type TownPoint = { x: number; y: number };
export const TOWN = {
  speed: 180, tolerance: 0.01, spawn: { x: 667, y: 500 },
  // Canvas coordinates, clockwise: clear paving between the stalls and ornaments.
  vertices: [{ x: 490, y: 310 }, { x: 900, y: 310 }, { x: 1090, y: 445 },
    { x: 970, y: 620 }, { x: 450, y: 620 }, { x: 390, y: 450 }],
};
export function walkable(p: TownPoint): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && TOWN.vertices.every((a, i, all) => {
    const b = all[(i + 1) % all.length];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
      >= -TOWN.tolerance * Math.hypot(b.x - a.x, b.y - a.y);
  });
}
export class TownMovement {
  position: TownPoint = { ...TOWN.spawn };
  target?: TownPoint;
  stop(): void { this.target = undefined; }
  select(point: TownPoint): boolean {
    this.stop();
    if (!walkable(point)) return false;
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
