import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleTarget, targetCommand } from '../assets/logic/targeting.ts';

test('default enemy click means ordinary attack', () => {
  assert.equal(targetCommand(null), 'attack');
});

test('targeted commands take precedence over default attack', () => {
  for (const command of ['attack', 'capture', 'protect']) {
    assert.equal(targetCommand(toggleTarget(null, command)), command);
    assert.equal(toggleTarget(command, command), null);
  }
  assert.equal(targetCommand(toggleTarget('capture', 'protect')), 'protect');
});
