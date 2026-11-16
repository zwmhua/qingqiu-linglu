import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !s.endsWith('.ts') ? `${s}.ts` : s, c); } });
const { ProgressLoader, progressSnapshot, resetProgress } = await import('../assets/battle/logic/local-progress.ts');
const { SessionProgress } = await import('../assets/battle/logic/session-progress.ts');
const { initialHero } = await import('../assets/battle/logic/hero-progress.ts');
const { wildCombat } = await import('../assets/battle/logic/wild-encounter.ts');
const { petCombat } = await import('../assets/battle/logic/pet-panel.ts');
const { Battle } = await import('../assets/battle/scripts/Battle.ts');
const key = 'qingqiu-linglu:test-progress';
function fixture(version) {
  const saved = JSON.parse(progressSnapshot(new SessionProgress(initialHero(), undefined, undefined, () => 0)));
  saved.version = version;
  delete saved.inventory; delete saved.lastSettledId;
  for (const pet of saved.pets) {
    delete pet.skillIds;
    pet.skill = '露珠弹';
    if (version < 3) Object.assign(pet, wildCombat(pet.species, pet.level));
    if (version === 1) { delete pet.exp; delete pet.potential; }
  }
  return saved;
}
function disk(saved) {
  const values = new Map([[key, JSON.stringify(saved)]]), attempts = [];
  return { values, attempts, fail: '', getItem(k) { if (this.fail === `read:${k}`) throw Error('read failed'); return values.get(k) ?? null; },
    setItem(k, v) { attempts.push([k, v]); if (this.fail === k) throw Error('write failed'); values.set(k, v); },
    removeItem(k) { values.delete(k); } };
}
test('each original version backs up exact bytes before committing and reloads without reroll', () => {
  for (const version of [1, 2, 3]) {
    const original = fixture(version);
    if (version === 3) {
      original.pets.splice(1);
      const pet = original.pets[0], stat = Object.keys(pet.baseStats).find(k => pet.baseStats[k] >= 4);
      pet.baseStats[stat] -= 3;
      pet.potential = 3;
      Object.assign(pet, petCombat(pet));
    }
    const storage = disk(original), raw = storage.values.get(key);
    const session = new ProgressLoader().load(storage, () => 0);
    assert.equal(storage.values.get(`${key}:backup:v${version}`), raw);
    assert.equal(JSON.parse(storage.values.get(key)).version, 5);
    assert.deepEqual(session.roster.entries.map(p => [p.baseStats, p.potential]), original.pets.map(p => [p.baseStats, p.potential ?? 0]));
    assert.deepEqual(storage.attempts.map(([k]) => k), [`${key}:backup:v${version}`, key]);
    for (let i = 0; i < 2; i++) assert.deepEqual(new ProgressLoader().load(storage, () => assert.fail('reroll')).roster.entries, session.roster.entries);
    resetProgress(storage, true);
    assert.equal(storage.values.get(`${key}:backup:v${version}`), raw);
    assert.equal(storage.values.has(key), false);
  }
});
test('backup faults, conflicts and main-write retries preserve original and candidate bytes', () => {
  const backup = `${key}:backup:v3`;
  for (const failure of [`read:${key}`, `read:${backup}`, backup, key]) {
    const storage = disk(fixture(3)), raw = storage.values.get(key), loader = new ProgressLoader();
    storage.fail = failure;
    assert.throws(() => loader.load(storage, () => 0), /failed/);
    assert.equal(storage.values.get(key), raw);
    const candidate = storage.attempts.find(([k]) => k === key)?.[1];
    storage.fail = '';
    loader.load(storage, candidate ? () => assert.fail('retry rerolled') : () => 0);
    if (candidate) assert.equal(storage.values.get(key), candidate);
  }
  const storage = disk(fixture(3)), raw = storage.values.get(key);
  storage.values.set(backup, 'different');
  assert.throws(() => new ProgressLoader().load(storage), /备份.*冲突/);
  assert.equal(storage.values.get(key), raw);
  assert.equal(storage.values.get(backup), 'different');
  storage.values.delete(backup);
  const loader = new ProgressLoader();
  storage.fail = key;
  assert.throws(() => loader.load(storage));
  storage.fail = '';
  storage.values.set(key, raw + ' ');
  assert.throws(() => loader.load(storage), /重新加载/);
});
test('unknown version, legacy skill and lost business fields reject without writes', () => {
  for (const mutate of [s => s.version = 99, s => s.pets[0].skill = 'alien', s => s.inventory = {}, s => s.pets[0].extra = 1]) {
    const input = fixture(3); mutate(input);
    const storage = disk(input), raw = storage.values.get(key);
    assert.throws(() => new ProgressLoader().load(storage));
    assert.equal(storage.values.get(key), raw);
    assert.equal(storage.attempts.length, 0);
  }
});

test('original panel rules reject mismatches, captured IDs survive and v4 validates owned skills', () => {
  for (const version of [1, 2, 3]) {
    const input = fixture(version), captured = { ...input.pets[0], id: 'caught-7', origin: 'captured' };
    input.pets.push(captured);
    input.selectedPetId = captured.id;
    const storage = disk(input), session = new ProgressLoader().load(storage, () => 0);
    assert.equal(session.selectedPetId, 'caught-7');
    assert.equal(session.roster.nextCapturedId, 8);
    const wrong = fixture(version);
    Object.assign(wrong.pets[0], version < 3 ? petCombat(wrong.pets[0]) : wildCombat('tingwa', 1));
    const invalid = disk(wrong);
    assert.throws(() => new ProgressLoader().load(invalid));
    assert.equal(invalid.attempts.length, 0);
  }
  const input = fixture(3), storage = disk(input);
  new ProgressLoader().load(storage, () => 0);
  const current = JSON.parse(storage.values.get(key));
  for (const ids of [['alien'], ['armor', 'armor'], Array(9).fill('regen')]) {
    const invalid = structuredClone(current);
    invalid.pets[0].skillIds = ids;
    assert.throws(() => new ProgressLoader().load(disk(invalid)));
  }
  const session = new ProgressLoader().load(storage), battle = new Battle(() => 0, 1, 0, session,
    () => 1, () => 0, () => 0, () => 0, () => 1, () => 0.4, undefined, () => 1);
  const ids = [...battle.enemies[0].skillIds];
  battle.command('hero', 'capture', 'enemy-0');
  battle.command('pet', 'defend');
  assert.deepEqual(session.roster.entries.at(-1).skillIds, ids);
  storage.setItem(key, progressSnapshot(session));
  assert.deepEqual(new ProgressLoader().load(storage).roster.entries.at(-1).skillIds, ids);
});

test('captured mutated babies level normally and existing mutated wild saves remain unchanged', () => {
  const session = new SessionProgress(initialHero());
  const battle = new Battle(() => 0, 1, 0, session, () => 0, () => 0, () => 0, () => 0, () => 0);
  const generated = battle.enemies[0];
  battle.command('hero', 'capture', generated.id);
  battle.command('pet', 'defend');
  const caught = session.roster.entries.at(-1);
  assert.deepEqual([caught.level, caught.isBaby, caught.isMutated], [0, true, true]);
  assert.deepEqual(caught.skillIds, generated.skillIds);
  session.roster.awardExperience(new Set([caught.id]), 10);
  assert.deepEqual([caught.level, caught.isBaby, caught.isMutated, caught.potential], [1, true, true, 5]);
  for (const isBaby of [true, false]) for (const version of [3, 4]) {
    const saved = JSON.parse(progressSnapshot(session));
    saved.version = version;
    delete saved.inventory; delete saved.lastSettledId;
    saved.pets.at(-1).isBaby = isBaby;
    if (version === 3) saved.pets.forEach(p => { delete p.skillIds; });
    const restored = new ProgressLoader().load(disk(saved), () => 0).roster.entries.at(-1);
    const { skill: _old, skillIds: _skills, ...expected } = saved.pets.at(-1);
    const { skill: _restoredOld, skillIds: _restoredSkills, ...actual } = restored;
    assert.deepEqual(actual, expected);
  }
});

test('v4 keeps exact ordered skills and progress, v5 validates inventory and settlement with fault-safe migration', () => {
  const source = new SessionProgress(initialHero());
  source.roster.entries[0].skillIds = ['regen', 'crit'];
  source.selectedPetId = 'pet-2';
  const old = JSON.parse(progressSnapshot(source));
  old.nextCapturedId = 12;
  old.version = 4; delete old.inventory; delete old.lastSettledId;
  for (const mutate of [s => s.pets[0].skillIds = ['alien'], s => s.pets[0].skillIds = ['regen', 'regen'],
    s => s.inventory = {}, s => s.lastSettledId = 0]) {
    const bad = structuredClone(old); mutate(bad); const storage = disk(bad), raw = storage.values.get(key);
    assert.throws(() => new ProgressLoader().load(storage));
    assert.equal(storage.values.get(key), raw); assert.equal(storage.attempts.length, 0);
  }
  for (const failure of ['', `read:${key}`, `read:${key}:backup:v4`, `${key}:backup:v4`, key, 'conflict']) {
    const storage = disk(old), raw = storage.values.get(key), loader = new ProgressLoader();
    if (failure === 'conflict') storage.values.set(`${key}:backup:v4`, 'keep');
    else storage.fail = failure;
    if (failure) {
      assert.throws(() => loader.load(storage, () => assert.fail('v4 reroll')));
      assert.equal(storage.values.get(key), raw);
      if (failure === 'conflict') { assert.equal(storage.values.get(`${key}:backup:v4`), 'keep'); continue; }
    }
    const attempted = storage.attempts.find(([k]) => k === key)?.[1];
    storage.fail = '';
    const restored = loader.load(storage, () => assert.fail('v4 reroll'));
    const saved = JSON.parse(storage.values.get(key));
    assert.deepEqual(saved, { ...old, version: 5, inventory: {}, lastSettledId: 0 });
    assert.equal(storage.values.get(`${key}:backup:v4`), raw);
    if (attempted) assert.equal(storage.values.get(key), attempted);
    restored.inventory = { rejuvenation: 100 }; restored.lastSettledId = 7;
    storage.setItem(key, progressSnapshot(restored));
    const refresh = loader.load(storage, () => assert.fail('refresh reroll'));
    assert.deepEqual(refresh.inventory, restored.inventory);
    assert.equal(new Battle(() => 0, 1, 0, refresh).battleId, 8);
    for (const mutate of [s => s.inventory = [], s => s.inventory = { alien: 1 }, s => s.lastSettledId = -1,
      s => s.lastSettledId = 0.5, s => s.lastSettledId = Number.MAX_SAFE_INTEGER + 1, s => delete s.inventory]) {
      const broken = structuredClone(saved); mutate(broken);
      const invalid = disk(broken), bytes = invalid.values.get(key);
      assert.throws(() => loader.load(invalid));
      assert.equal(invalid.values.get(key), bytes); assert.equal(invalid.attempts.length, 0);
    }
  }
});


test('v5 initial babies and captured mutation babies reload; old initial constraints and invalid data remain rejected', async () => {
  const { rejuvenate } = await import('../assets/battle/logic/rejuvenation.ts');
  const session = new SessionProgress(initialHero());
  Object.assign(session.roster.entries[1], rejuvenate(session.roster.entries[1], () => 0));
  const saved = JSON.parse(progressSnapshot(session));
  assert.equal(new ProgressLoader().load(disk(saved)).roster.entries[1].isBaby, true);
  for (const version of [1, 2, 3, 4]) {
    const legacy = structuredClone(saved); legacy.version = version;
    delete legacy.inventory; delete legacy.lastSettledId;
    if (version < 4) legacy.pets.forEach(p => { delete p.skillIds; });
    if (version < 3) legacy.pets.forEach(p => Object.assign(p, wildCombat(p.species, p.level)));
    if (version === 1) legacy.pets.forEach(p => { delete p.exp; delete p.potential; });
    const storage = disk(legacy), raw = storage.values.get(key);
    assert.throws(() => new ProgressLoader().load(storage));
    assert.equal(storage.values.get(key), raw); assert.equal(storage.attempts.length, 0);
  }
  for (const patch of [{ id: 'pet-3' }, { species: 'pangui' }, { isMutated: true }, { skillIds: ['unknown'] },
    { potential: 1 }, { level: 1 }, { attack: 999 }]) {
    const bad = structuredClone(saved); Object.assign(bad.pets[1], patch);
    assert.throws(() => new ProgressLoader().load(disk(bad)));
  }
  const captured = { ...session.roster.entries[1], id: 'caught-1', origin: 'captured', sourceEnemyId: 'enemy-0', isMutated: true };
  Object.assign(captured, rejuvenate(captured, () => 0));
  const next = new SessionProgress(initialHero(), { entries: [session.roster.entries[0], captured], nextCapturedId: 2 });
  const raw = progressSnapshot(next), restored = new ProgressLoader().load(disk(JSON.parse(raw)));
  assert.equal(progressSnapshot(restored), raw);
  assert.deepEqual(restored.roster.entries[1], { ...captured, skill: undefined });
});
