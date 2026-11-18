import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !specifier.endsWith('.ts')
    ? `${specifier}.ts` : specifier, context);
} });

const { Battle } = await import('../assets/battle/scripts/Battle.ts');
const { initialHero, adjustPotential } = await import('../assets/battle/logic/hero-progress.ts');
const { SessionProgress } = await import('../assets/battle/logic/session-progress.ts');
const { petProgress } = await import('../assets/battle/logic/roster.ts');
const { loadSessionProgress, saveProgress } = await import('../assets/battle/logic/local-progress.ts');

test('a turtle can lose innate armor, reload v5 unchanged and learn another book; v4 stays strict', async () => {
  const { progressSnapshot } = await import('../assets/battle/logic/local-progress.ts');
  const entries = new SessionProgress(initialHero()).roster.entries, disk = storage(), pet = entries[1];
  Object.assign(pet, { id: 'caught-1', origin: 'captured', species: 'pangui', skillIds: ['armor', 'crit', 'power', 'regen'] });
  const session = new SessionProgress(initialHero(), { entries, nextCapturedId: 2 });
  session.inventory = { 'book:thunder': 1, 'book:fireball': 1 };
  const persist = (next, inventory) => disk.setItem('', progressSnapshot(session, undefined, next, undefined, inventory));
  assert.equal(session.prepareSkillBook(false, pet.id, 'book:thunder').execute(false, persist, () => 0).replaced, 'armor');
  const raw = disk.raw, restored = loadSessionProgress(disk);
  assert.equal(progressSnapshot(restored), raw);
  assert.deepEqual(restored.roster.entries[1].skillIds, ['thunder', 'crit', 'power', 'regen']);
  assert.equal(restored.inventory['book:thunder'], 0);
  assert.equal(restored.prepareSkillBook(false, pet.id, 'book:fireball').rate, 0);
  const old = JSON.parse(raw); old.version = 4; delete old.inventory; delete old.lastSettledId; delete old.nextFusedId; delete old.warehouse;
  disk.raw = JSON.stringify(old);
  assert.throws(() => loadSessionProgress(disk), /技能不兼容/);
});

function storage() {
  return { raw: null, fail: false, getItem() { return this.raw; }, setItem(_key, value) {
    if (this.fail) throw new Error('写入失败');
    this.raw = value;
  } };
}

test('one session owns the initial pets, selection, experience and IDs across real battles', () => {
  let rolls = 0;
  const session = new SessionProgress(initialHero(), undefined, undefined, () => { rolls++; return 0; });
  const make = () => new Battle(() => 0, 1, 0, session, () => 1);
  const first = make();
  first.command('hero', 'capture', 'enemy-0');
  first.command('pet', 'defend');
  assert.equal(first.winner, 'ally');
  assert.equal(session.heroProgress.level, 1);
  assert.equal(session.roster.entries[0].exp, 10);
  const second = make();
  second.command('hero', 'summon', 'caught-1');
  second.command('pet', 'defend');
  assert.equal(session.selectedPetId, 'caught-1');
  second.command('hero', 'capture', 'enemy-0');
  second.command('caught-1', 'defend');
  assert.equal(second.winner, 'ally');
  assert.equal(make().pets.find(pet => pet.deployed).id, 'caught-1');
  assert.deepEqual(session.roster.entries.map(pet => pet.id), ['pet', 'pet-2', 'caught-1', 'caught-2']);
  assert.equal(session.roster.nextCapturedId, 3);
  assert.equal(rolls, 2);
});

test('non-battle allocation and release save first, and bad data cannot initialize a new session', () => {
  const disk = storage();
  disk.raw = '{bad';
  assert.throws(() => loadSessionProgress(disk), SyntaxError);
  assert.equal(disk.raw, '{bad');
  const stats = { constitution: 11, mana: 11, strength: 11, endurance: 11, agility: 11 };
  const hero = { level: 1, exp: 0, potential: 5, stats };
  const original = new SessionProgress(hero, undefined, undefined, () => 0);
  const pet = original.roster.entries[0];
  const largest = Object.keys(pet.baseStats).sort((a, b) => pet.baseStats[b] - pet.baseStats[a])[0];
  pet.baseStats[largest] -= 5;
  pet.potential = 5; // Existing wild-pet balance remains manually allocatable.
  original.roster.awardExperience(new Set([pet.id]), 20);
  const strength = pet.baseStats.strength;
  const heroDraft = adjustPotential(hero, hero, 'constitution', 1);
  const points = petProgress(pet);
  const petDraft = adjustPotential(points, points, 'strength', 1);
  const actions = [
    inBattle => original.confirmHeroAllocation(inBattle, heroDraft, next => saveProgress(disk, original, next)),
    inBattle => original.confirmPetAllocation(inBattle, pet.id, petDraft, next => saveProgress(disk, original, undefined, next)),
    inBattle => original.releasePet(inBattle, 'pet-2', pets => saveProgress(disk, original, undefined, undefined, pets)),
  ];
  saveProgress(disk, original);
  const before = disk.raw;
  disk.fail = true;
  for (const action of actions) {
    assert.equal(action(true), false);
    assert.throws(() => action(false), /写入失败/);
  }
  assert.equal(disk.raw, before);
  assert.equal(original.heroProgress, hero);
  assert.equal(pet.potential, 5);
  assert.equal(original.roster.entries.length, 2);
  assert.equal(original.releasePet(false, pet.id, () => assert.fail('should not write')), false);
  disk.fail = false;
  for (const action of actions) assert.equal(action(false), true);
  const restored = loadSessionProgress(disk);
  assert.equal(restored.heroProgress.stats.constitution, 12);
  assert.equal(restored.roster.entries[0].baseStats.strength, strength + 1);
  assert.deepEqual(restored.roster.entries.map(entry => entry.id), [pet.id]);
  assert.equal(restored.selectedPetId, pet.id);
});

test('skill books save one complete candidate before publishing, preserve failures and expire confirmations', async () => {
  const { progressSnapshot } = await import('../assets/battle/logic/local-progress.ts');
  const session = new SessionProgress(initialHero(), undefined, undefined, () => 0);
  const pet = session.roster.entries[0], disk = storage();
  pet.skillIds = ['waterarrow', 'armor', 'crit', 'power'];
  session.inventory = { 'book:thunder': 3 };
  session.autoOrders.set(pet.id, { command: 'spell', skillId: 'waterarrow' });
  session.autoOrders.set('pet-2', { command: 'defend' });
  saveProgress(disk, session);
  const before = disk.raw, original = structuredClone(pet), orders = [...session.autoOrders];
  let writes = 0, rolls = 0;
  const random = () => { rolls++; return 0; };
  const persist = (next, inventory) => { disk.setItem('', progressSnapshot(session, undefined, next, undefined, inventory)); writes++; };
  disk.fail = true;
  const failed = session.prepareSkillBook(false, pet.id, 'book:thunder');
  assert.throws(() => failed.execute(false, persist, random), /写入失败/);
  assert.equal(failed.execute(false, persist, random), undefined);
  assert.equal(disk.raw, before); assert.deepEqual(pet, original);
  assert.deepEqual([...session.autoOrders], orders); assert.equal(writes, 0);
  disk.fail = false;
  const success = session.prepareSkillBook(false, pet.id, 'book:thunder');
  assert.equal(success.execute(false, persist, random).replaced, 'waterarrow');
  assert.equal(success.execute(false, persist, random), undefined);
  assert.equal(writes, 1); assert.equal(rolls, 2);
  assert.deepEqual(pet, { ...original, skillIds: ['thunder', 'armor', 'crit', 'power'] });
  assert.equal(session.inventory['book:thunder'], 2);
  assert.equal(session.autoOrders.has(pet.id), false);
  assert.deepEqual(session.autoOrders.get('pet-2'), { command: 'defend' });
  const restored = loadSessionProgress(disk);
  assert.equal(progressSnapshot(restored), disk.raw);
  assert.equal(restored.selectedPetId, session.selectedPetId);
  assert.deepEqual(restored.inventory, session.inventory);
  const battle = new Battle(() => 0, 1, 0, session, () => 1);
  assert.ok(battle.pets.find(p => p.id === pet.id).skillIds.includes('thunder'));
  const { AutoCommands } = await import('../assets/battle/logic/auto.ts');
  battle.enemies.forEach(enemy => { enemy.hp = enemy.maxHp = 10000; enemy.speed = 1; });
  session.autoOrders.set('hero', { command: 'defend' });
  const auto = new AutoCommands(() => 0); auto.enabled = true; auto.issue(battle);
  assert.ok(battle.events.some(event => event.kind === 'spell' && event.actorId === pet.id && event.skillId === 'thunder'));
  for (const change of ['battle', 'missing', 'stock', 'skills']) {
    pet.skillIds = ['crit']; session.inventory['book:thunder'] = 1;
    const pending = session.prepareSkillBook(false, pet.id, 'book:thunder');
    if (change === 'missing') session.roster.entries.splice(0, 1);
    if (change === 'stock') session.inventory['book:thunder'] = 0;
    if (change === 'skills') pet.skillIds = ['crit', 'armor'];
    assert.throws(() => pending.execute(change === 'battle', persist, random));
    if (change === 'missing') session.roster.entries.unshift(pet);
  }
  assert.equal(writes, 1); assert.equal(rolls, 2);
});


test('rejuvenation rechecks live state and saves exactly once before publishing the full candidate', async () => {
  const { progressSnapshot } = await import('../assets/battle/logic/local-progress.ts');
  const session = new SessionProgress(initialHero(), undefined, undefined, () => 0), disk = storage();
  const pet = session.roster.entries[1];
  pet.skillIds = ['thunder']; session.inventory = { rejuvenation: 3, 'book:fireball': 4 };
  session.autoOrders.set(pet.id, { command: 'spell', skillId: 'thunder' });
  session.autoOrders.set('pet', { command: 'defend' });
  saveProgress(disk, session);
  const before = disk.raw, original = structuredClone(pet), orders = [...session.autoOrders];
  let writes = 0, rolls = 0;
  const random = () => { rolls++; return 0; };
  const persist = (next, inventory) => { disk.setItem('', progressSnapshot(session, undefined, next, undefined, inventory)); writes++; };
  for (const change of ['battle', 'selected', 'stock', 'missing', 'mutation', 'changed']) {
    const tx = session.prepareRejuvenation(false, pet.id, 'rejuvenation');
    if (change === 'selected') session.selectedPetId = pet.id;
    if (change === 'stock') session.inventory.rejuvenation = 0;
    if (change === 'missing') session.roster.entries.pop();
    if (change === 'mutation') pet.isMutated = true;
    if (change === 'changed') pet.exp++;
    assert.throws(() => tx.execute(change === 'battle', persist, random));
    assert.equal(tx.execute(false, persist, random), undefined);
    session.selectedPetId = 'pet'; session.inventory.rejuvenation = 3;
    if (change === 'missing') session.roster.entries.push(pet);
    Object.assign(pet, structuredClone(original));
  }
  assert.equal(rolls, 0); assert.equal(writes, 0); assert.equal(disk.raw, before);
  disk.fail = true;
  const failed = session.prepareRejuvenation(false, pet.id, 'rejuvenation');
  assert.throws(() => failed.execute(false, persist, random), /写入失败/);
  const failedRolls = rolls;
  assert.equal(failed.execute(false, persist, random), undefined); assert.equal(rolls, failedRolls);
  assert.equal(disk.raw, before); assert.deepEqual(pet, original); assert.deepEqual([...session.autoOrders], orders);
  assert.equal(progressSnapshot(session), before);
  disk.fail = false;
  const tx = session.prepareRejuvenation(false, pet.id, 'rejuvenation');
  assert.match(tx.execute(false, persist, random).message, /还童成功/);
  assert.equal(tx.execute(false, persist, random), undefined); assert.equal(writes, 1);
  assert.equal(session.inventory.rejuvenation, 2); assert.equal(session.autoOrders.has(pet.id), false);
  assert.deepEqual(session.autoOrders.get('pet'), { command: 'defend' });
  const restored = loadSessionProgress(disk);
  assert.equal(progressSnapshot(restored), disk.raw);
  const old = JSON.parse(before), saved = JSON.parse(disk.raw);
  for (const field of ['hero', 'selectedPetId', 'nextCapturedId', 'lastSettledId']) assert.deepEqual(saved[field], old[field]);
  assert.deepEqual(saved.pets[0], old.pets[0]); assert.equal(saved.inventory['book:fireball'], 4);
  restored.roster.awardExperience(new Set([pet.id]), 20, () => assert.fail('baby upgrade reroll'));
  assert.equal(restored.roster.entries[1].potential, 5);
  saveProgress(disk, restored);
  assert.equal(progressSnapshot(loadSessionProgress(disk)), disk.raw);
});


test('fusion persists once before replacing parents, retries same child against current progress and never reuses IDs', async () => {
  const { progressSnapshot } = await import('../assets/battle/logic/local-progress.ts');
  const { petCombat } = await import('../assets/battle/logic/pet-panel.ts');
  const session = new SessionProgress(initialHero()), disk = storage();
  const a = session.roster.entries[1], b = { ...a, id: 'caught-1', origin: 'captured' };
  for (const p of [a, b]) Object.assign(p, { level: 10, isBaby: true, potential: 50,
    baseStats: { constitution: 20, mana: 20, strength: 20, endurance: 20, agility: 20 } });
  for (const p of [a, b]) Object.assign(p, petCombat(p));
  session.roster.entries.push(b); session.autoOrders.set(a.id, { command: 'defend' });
  session.inventory = { rejuvenation: 4 }; saveProgress(disk, session);
  const before = disk.raw, parents = structuredClone(session.roster.entries);
  let rolls = 0, writes = 0, attempted;
  const random = () => { rolls++; return 0; };
  const persist = (pets, sequence) => {
    assert.deepEqual(session.roster.entries, parents); assert.equal(session.roster.nextFusedId, 1);
    attempted = progressSnapshot(session, undefined, undefined, pets, undefined, undefined, sequence);
    disk.setItem('', attempted); writes++;
  };
  for (const change of ['battle', 'selected', 'level']) {
    const tx = session.prepareFusion(false, [a.id, b.id]);
    if (change === 'selected') session.selectedPetId = a.id;
    if (change === 'level') a.level = 9;
    assert.throws(() => tx.execute(change === 'battle', persist, random));
    session.selectedPetId = 'pet'; a.level = 10;
    assert.equal(tx.execute(false, persist, random), undefined);
  }
  assert.equal(rolls, 0); assert.equal(disk.raw, before);
  const cancelled = session.prepareFusion(false, [a.id, b.id]); assert.equal(rolls, 0); // No execute means no generation/write.
  disk.fail = true; const tx = session.prepareFusion(false, [a.id, b.id]);
  assert.throws(() => tx.execute(false, persist, random), /写入失败/);
  const failedChild = JSON.parse(attempted).pets.at(-1), used = rolls;
  assert.equal(tx.execute(false, persist, random), undefined); assert.equal(rolls, used);
  assert.equal(disk.raw, before); assert.deepEqual(session.roster.entries, parents); assert.equal(session.autoOrders.size, 1);
  session.inventory.rejuvenation = 9; session.lastSettledId = 17; disk.fail = false;
  const retry = session.prepareFusion(false, [b.id, a.id]);
  const child = retry.execute(false, persist, () => assert.fail('retry reroll'));
  assert.deepEqual(child, failedChild); assert.equal(writes, 1); assert.equal(session.roster.nextFusedId, 2);
  assert.equal(session.selectedPetId, 'pet'); assert.equal(session.autoOrders.size, 0);
  assert.equal(JSON.parse(disk.raw).inventory.rejuvenation, 9); assert.equal(JSON.parse(disk.raw).lastSettledId, 17);
  assert.equal(retry.execute(false, persist, random), undefined); assert.throws(() => cancelled.execute(false, persist, random));
  assert.equal(loadSessionProgress(disk).roster.nextFusedId, 2);
  session.releasePet(false, child.id, pets => saveProgress(disk, session, undefined, undefined, pets));
  const restored = loadSessionProgress(disk); assert.equal(restored.roster.nextFusedId, 2);
  restored.roster.entries.push(...parents.slice(1));
  const next = restored.prepareFusion(false, [a.id, b.id]).execute(false, (pets, seq) =>
    disk.setItem('', progressSnapshot(restored, undefined, undefined, pets, undefined, undefined, seq)), random);
  assert.equal(next.id, 'fused-2'); assert.equal(loadSessionProgress(disk).roster.nextFusedId, 3);
});

test('mutation rejuvenation consumes a bag bottle and preserves the warehouse on reload', async () => {
  const { progressSnapshot } = await import('../assets/battle/logic/local-progress.ts');
  const session = new SessionProgress(initialHero()), disk = storage(), pet = session.roster.entries[1];
  Object.assign(pet, { id: 'caught-1', origin: 'captured', isMutated: true });
  const item = 'mutation-rejuvenation';
  session.inventory = { [item]: 2 };
  session.warehouse = { [item]: 7 };
  session.prepareRejuvenation(false, pet.id, item).execute(false, (updated, inventory) =>
    disk.setItem('', progressSnapshot(session, undefined, updated, undefined, inventory)), () => 0);
  const restored = loadSessionProgress(disk);
  assert.deepEqual(restored.inventory, { [item]: 1 });
  assert.deepEqual(restored.warehouse, { [item]: 7 });
  assert.equal(restored.roster.entries[1].isBaby, true);
});

test('warehouse session publishes only after persistence and prevents reentrant writes', () => {
  const session = new SessionProgress(initialHero()), id = 'rejuvenation';
  const inventory = { [id]: 7 }, warehouse = { [id]: 2 };
  session.inventory = inventory; session.warehouse = warehouse;
  const first = session.prepareWarehouseTransfer('deposit', id, 7);
  const nested = session.prepareWarehouseTransfer('deposit', id, 7);
  const persist = next => {
    assert.equal(session.inventory, inventory);
    assert.equal(session.warehouse, warehouse);
    assert.deepEqual(next, { inventory: {}, warehouse: { [id]: 9 } });
    assert.equal(nested(false, () => assert.fail('reentrant write')), false);
  };
  assert.equal(first(false, persist), true);
  assert.deepEqual(session.inventory, {});
  assert.deepEqual(session.warehouse, { [id]: 9 });
  assert.equal(first(false, () => assert.fail('duplicate write')), false);
});
