import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../tools/p2-14-balance.mjs';

test('the same seed and sample size reproduce the complete report', () => {
  const first = simulate(314, 12);
  assert.deepEqual(simulate(314, 12), first);
  assert.notDeepEqual(simulate(315, 12).encounters.distance, first.encounters.distance);
});

test('each statistic uses its own eligible population', () => {
  const { encounters, drops, books, rejuvenation, fusion, combat } = simulate(314, 80);
  const { counts, enemies, babies, mutated, protectionHits, cameraHits } = encounters;
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), 80);
  assert.equal(Object.entries(counts).reduce((sum, [size, count]) => sum + Number(size) * count, 0), enemies);
  assert.equal(encounters.babyRate, babies / enemies);
  assert.equal(encounters.mutationRate, mutated / babies);
  const conditional = encounters.mutationGivenBaby;
  assert.equal(conditional.eligible, 80);
  assert.equal(conditional.rate, conditional.hits / conditional.eligible);
  assert.deepEqual([protectionHits, cameraHits], [0, 0]);
  assert.equal(Object.keys(encounters.traits).length, 9);
  assert.ok(Object.values(encounters.traits).every(group => group.growth.n === 80));
  for (const { eligible, hits, titles } of Object.values(drops)) {
    assert.equal(eligible, 80);
    assert.equal(Object.values(titles).reduce((sum, count) => sum + count, 0), hits.book);
    assert.equal(Object.keys(titles).length, 12);
  }
  assert.equal(books[0].added, 80);
  assert.equal(books[8].added, 0);
  assert.ok(books[8].replaced.armor > 0);
  assert.ok(Object.values(rejuvenation).every(group => group.growth.n === 80));
  assert.ok(Object.values(fusion).every(group => group.growthChange.n === 80));
  assert.ok(Object.values(combat).every(group => group.rounds.n === 80));
  assert.ok(combat['combo+crit'].procs.crit.eligible >= combat['combo+crit'].procs.combo.eligible);
});

test('invalid seed and group size fail before sampling', () => {
  for (const seed of [-1, 2 ** 32, 1.5, NaN]) assert.throws(() => simulate(seed, 1), RangeError);
  for (const n of [0, -1, 1.5, Infinity]) assert.throws(() => simulate(0, n), RangeError);
});
