import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !s.endsWith('.ts') ? `${s}.ts` : s, c); } });
const { bookPlan, bookOptions, applyBook } = await import('../assets/battle/logic/skill-books.ts');
const all = ['armor', 'crit', 'combo', 'counter', 'reflect', 'power', 'swift', 'regen'];
const pet = (ids, species = 'tingwa') => ({ skillIds: ids, species });
const plan = (ids, species) => bookPlan(pet(ids, species), 'book:thunder', { 'book:thunder': 2 }, false);
test('book bands, exact thresholds, deterministic branches and every replacement slot', () => {
  for (const [n, rate] of [[0, 1], [1, 1], [2, .6], [3, .3], [4, 0], [8, 0]]) {
    const ids = all.slice(0, n), p = plan(ids);
    assert.equal(p.rate, rate);
    for (const roll of [Math.max(0, rate - .00001), rate, Math.min(1, rate + .00001)]) {
      let calls = 0;
      const result = applyBook(ids, p, () => { calls++; return calls === 1 && rate > 0 && rate < 1 ? roll : 0; });
      const added = rate === 1 || roll < rate;
      assert.equal(result.skillIds.length, n + Number(added));
      assert.equal(calls, rate === 1 ? 0 : rate === 0 ? 1 : added ? 1 : 2);
      assert.deepEqual(result.skillIds, added ? [...ids, 'thunder'] : ['thunder', ...ids.slice(1)]);
    }
  }
  for (const species of ['tingwa', 'pangui']) {
    const ids = all.slice(0, 4), p = plan(ids, species);
    const indexes = species === 'pangui' ? [1, 2, 3] : [0, 1, 2, 3];
    indexes.forEach((index, i) => {
      const result = applyBook(ids, p, () => (i + .5) / indexes.length);
      const expected = [...ids]; expected[index] = 'thunder';
      assert.deepEqual(result.skillIds, expected);
      assert.equal(result.replaced, ids[index]);
    });
  }
});
test('invalid eligibility and artificial empty replacement pool reject before drawing', () => {
  for (const [p, item, inv, battle, message] of [
    [pet(['thunder']), 'book:thunder', { 'book:thunder': 1 }, false, /已学/],
    [pet([]), 'book:thunder', {}, false, /不足/],
    [pet([]), 'rejuvenation', { rejuvenation: 1 }, false, /技能书/],
    [pet([]), 'book:unknown', {}, false, /技能书/],
    [pet([]), 'book:thunder', { 'book:thunder': 1 }, true, /战斗/],
    [undefined, 'book:thunder', { 'book:thunder': 1 }, false, /携带/],
  ]) assert.throws(() => bookPlan(p, item, inv, battle), message);
  assert.throws(() => bookOptions(['armor', 'crit'], ['armor', 'crit']), /只有必带技能/);
  for (const value of [-1, NaN, 1.1]) assert.throws(() => applyBook(all, plan(all), () => value), /随机/);
});
