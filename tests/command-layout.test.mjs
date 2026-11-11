import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, COMMAND_LAYOUT, COMMAND_ICON_SIZE } from '../assets/scripts/config.ts';

test('command slots form the requested L with a shared flee/retreat position', () => {
  const vertical = ['道具', '灵术', '攻击'].map(name => COMMAND_LAYOUT[name]);
  const bottom = ['抓取', '逃跑', '召唤', '保护', '防御'].map(name => COMMAND_LAYOUT[name]);
  assert.ok(vertical.every(slot => slot.x === vertical[0].x));
  const column = [...vertical, bottom.at(-1)];
  const verticalStep = (column.at(-1).y - column[0].y) / 3;
  assert.ok(column.every((slot, i) => i === 0 || Math.abs(slot.y - column[i - 1].y - verticalStep) < 0.001));
  assert.ok(column.every((slot, i) => i === 0 || slot.y - column[i - 1].y >= COMMAND_ICON_SIZE + 30));
  assert.ok(bottom.every(slot => slot.y === bottom[0].y));
  assert.equal(COMMAND_LAYOUT['自动'].y, bottom[0].y);
  assert.equal(bottom[0].x - COMMAND_LAYOUT['自动'].x, bottom[1].x - bottom[0].x);
  assert.ok(bottom.every((slot, i) => i === 0 || slot.x - bottom[i - 1].x === bottom[1].x - bottom[0].x));
  assert.equal(bottom.at(-1).x, vertical[0].x);
  assert.ok(vertical[0].y >= 178); // below the upper-right command panel
  assert.equal(bottom.at(-1).y, CONFIG.height - COMMAND_ICON_SIZE - 30);
  assert.deepEqual(COMMAND_LAYOUT['撤退'], COMMAND_LAYOUT['逃跑']);
});

test('command icons fit the screen and avoid visible allied labels', () => {
  assert.ok(COMMAND_ICON_SIZE >= 78);
  const bottom = ['抓取', '逃跑', '召唤', '保护', '防御'].map(name => COMMAND_LAYOUT[name]);
  const first = bottom[0], last = bottom.at(-1);
  assert.ok(first.x > 540); // battle log ends at x=540
  assert.ok(last.x + COMMAND_ICON_SIZE <= CONFIG.width);
  assert.ok(first.y + COMMAND_ICON_SIZE + 30 <= CONFIG.height);
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w &&
    a.y < b.y + b.h && b.y < a.y + a.h;
  for (const slot of [...bottom, COMMAND_LAYOUT['自动'], ...['攻击', '灵术', '道具'].map(name => COMMAND_LAYOUT[name])])
    for (const { pet, hero } of bottom.includes(slot) ? CONFIG.positions.allyGroups : CONFIG.positions.allyGroups.slice(0, 1)) {
    for (const [unit, width] of [[pet, CONFIG.visual.petNameWidth], [hero, CONFIG.visual.nameWidth]]) {
      const name = { x: unit.x - width / 2, y: unit.y + 19 + CONFIG.visual.nameGap,
        w: width, h: CONFIG.visual.nameSize * 1.7 };
      assert.ok(!overlaps({ x: slot.x, y: slot.y, w: COMMAND_ICON_SIZE,
        h: COMMAND_ICON_SIZE + 30 }, name));
    }
  }
  for (const { pet, hero } of CONFIG.positions.allyGroups) {
    for (const [unit, width] of [[pet, CONFIG.visual.petNameWidth], [hero, CONFIG.visual.nameWidth]]) {
      const nameTop = unit.y + 19 + CONFIG.visual.nameGap;
      const nameRight = unit.x + width / 2;
      assert.ok(first.x >= unit.x + 128 / 2 || first.y >= unit.y);
      assert.ok(first.x >= nameRight || first.y >= nameTop + CONFIG.visual.nameSize * 1.7);
    }
  }
});
