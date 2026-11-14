export type RunFacing = { row: 0 | 1; flip: -1 | 1 };

// Map coordinates increase to the right and down.
export function runFacing(dx: number, dy: number, previous: RunFacing): RunFacing {
  const row = dy === 0 ? previous.row : dy < 0 ? 1 : 0;
  const flip = dx === 0 ? previous.flip : dx < 0 ? -1 : 1;
  return row === previous.row && flip === previous.flip ? previous : { row, flip };
}
