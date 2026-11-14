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
    assert.equal(JSON.parse(storage.values.get(key)).version, 4);
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
