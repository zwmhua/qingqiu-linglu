import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !s.endsWith('.ts') ? `${s}.ts` : s, c); } });
const { ITEMS, BOOK_IDS, DROP_RATES, rollDrops, addInventory, validateInventory,
  planWarehouseTransfer, warehouseItemIds, warehouseQuantity } = await import('../assets/battle/logic/inventory.ts');
const { PET_SKILLS } = await import('../assets/battle/logic/pet-skills.ts');
test('catalog, fixed rates, independent thresholds and twelve equal book intervals', () => {
  assert.equal(Object.keys(ITEMS).length, 14);
  assert.deepEqual(BOOK_IDS, Object.keys(PET_SKILLS).map(id => `book:${id}`));
  assert.deepEqual(DROP_RATES, { formal: [0.08, 0.03, 0.01], test: [0.5, 0.3, 0.1] });
  for (const mode of ['formal', 'test']) for (let category = 0; category < 3; category++) {
    for (const hit of [false, true]) {
      const sequence = DROP_RATES[mode].map((rate, i) => i === category ? rate - Number(hit) * 0.000001 : 1);
      if (hit && category === 0) sequence.push(0.5);
      let calls = 0;
      const drops = rollDrops(mode, () => sequence[calls++]);
      assert.equal(calls, 3 + Number(hit && category === 0));
      assert.deepEqual(drops, hit ? { [[BOOK_IDS[6], 'rejuvenation', 'mutation-rejuvenation'][category]]: 1 } : {});
    }
    for (let book = 0; book < 12; book++) for (const edge of [0, 0.999999]) {
      let calls = 0;
      const sequence = [0, 0, 0, (book + edge) / 12];
      assert.deepEqual(rollDrops(mode, () => sequence[calls++]),
        { [BOOK_IDS[book]]: 1, rejuvenation: 1, 'mutation-rejuvenation': 1 });
      assert.equal(calls, 4);
    }
  }
});
test('one slot beyond 99, invalid IDs and quantities reject without mutating inputs', () => {
  const before = { rejuvenation: 99 };
  assert.deepEqual(addInventory(before, { rejuvenation: 1 }), { rejuvenation: 100 });
  assert.deepEqual(before, { rejuvenation: 99 });
  for (const invalid of [null, [], { alien: 1 }, { rejuvenation: -1 }, { rejuvenation: 0.5 },
    { rejuvenation: '1' }, { rejuvenation: Number.MAX_SAFE_INTEGER + 1 }, { rejuvenation: NaN }])
    assert.throws(() => validateInventory(invalid));
  assert.throws(() => addInventory({ rejuvenation: Number.MAX_SAFE_INTEGER }, { rejuvenation: 1 }));
  assert.doesNotThrow(() => validateInventory({ rejuvenation: 0 }));
  for (const value of [-1, NaN, 1.1]) assert.throws(() => rollDrops('formal', () => value));
});

test('warehouse transfers conserve each item, merge past 99, and clear whole stacks', () => {
  const id = 'rejuvenation', inventory = { [id]: 7, 'book:thunder': 1 }, warehouse = { [id]: 98 };
  const partial = planWarehouseTransfer(inventory, warehouse, 'deposit', id, 3);
  assert.deepEqual(partial, { inventory: { [id]: 4, 'book:thunder': 1 }, warehouse: { [id]: 101 } });
  assert.equal(inventory[id] - partial.inventory[id], partial.warehouse[id] - warehouse[id]);
  const whole = planWarehouseTransfer(partial.inventory, partial.warehouse, 'withdraw', id, 101);
  assert.deepEqual(whole, { inventory: { [id]: 105, 'book:thunder': 1 }, warehouse: {} });
  assert.deepEqual(inventory, { [id]: 7, 'book:thunder': 1 });
  assert.deepEqual(warehouse, { [id]: 98 });
});

test('warehouse rejects invalid actions without editing either side', () => {
  const id = 'rejuvenation', inventory = { [id]: 7 }, warehouse = { [id]: Number.MAX_SAFE_INTEGER };
  for (const [direction, item, count] of [
    ['other', id, 1], ['deposit', 'constructor', 1], ['deposit', 'book:thunder', 1],
    ['deposit', id, 0], ['deposit', id, -1], ['deposit', id, 0.5], ['deposit', id, '1'],
    ['deposit', id, NaN], ['deposit', id, Infinity], ['deposit', id, 8], ['deposit', id, 1],
  ]) assert.throws(() => planWarehouseTransfer(inventory, warehouse, direction, item, count), /无效|不足/);
  assert.deepEqual(inventory, { [id]: 7 });
  assert.deepEqual(warehouse, { [id]: Number.MAX_SAFE_INTEGER });
});

test('warehouse display uses record order by default and catalogue order on request', () => {
  const inventory = { rejuvenation: 7, [BOOK_IDS[1]]: 2, [BOOK_IDS[0]]: 1, 'mutation-rejuvenation': 0 };
  const original = JSON.stringify(inventory);
  const sorted = [BOOK_IDS[0], BOOK_IDS[1], 'rejuvenation'];
  assert.deepEqual(warehouseItemIds(inventory, false), ['rejuvenation', BOOK_IDS[1], BOOK_IDS[0]]);
  assert.deepEqual(warehouseItemIds(inventory, true), sorted);
  assert.deepEqual(warehouseItemIds(inventory, true), sorted);
  assert.equal(JSON.stringify(inventory), original);
});

test('warehouse quantity accepts only whole numbers in the available range', () => {
  assert.equal(warehouseQuantity('1', 7), 1);
  assert.equal(warehouseQuantity('7', 7), 7);
  assert.equal(warehouseQuantity(String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  for (const input of ['', '0', '-1', '3.5', '8', '1e0', '9007199254740992']) {
    assert.equal(warehouseQuantity(input, 7), undefined);
  }
});
