import test from 'node:test';
import assert from 'node:assert/strict';
import { runFacing } from '../assets/battle/scripts/run-facing.ts';

const downRight = { row: 0, flip: 1 };
const upLeft = { row: 1, flip: -1 };

// World coordinates increase downward, including on the scrolling map.
for (const [name, dx, dy, previous, expected] of [
  ['southeast', 3, 1, upLeft, downRight],
  ['southwest', -3, 1, upLeft, { row: 0, flip: -1 }],
  ['northeast', 3, -1, downRight, { row: 1, flip: 1 }],
  ['northwest', -3, -1, downRight, upLeft],
  ['east', 1, 0, upLeft, { row: 1, flip: 1 }],
  ['west', -1, 0, downRight, { row: 0, flip: -1 }],
  ['south', 0, 1, upLeft, { row: 0, flip: -1 }],
  ['north', 0, -1, downRight, { row: 1, flip: 1 }],
]) {
  test(`running ${name} keeps the last facing on the unchanged axis`, () => {
    assert.deepEqual(runFacing(dx, dy, previous), expected);
  });
}
