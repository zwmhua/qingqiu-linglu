import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !s.endsWith('.ts') ? `${s}.ts` : s, c); } });
const { Battle } = await import('../assets/battle/scripts/Battle.ts');
const { petPanel, petCombat, effectivePetPanel, statPassives, regenAmount, petPanelPreview } = await import('../assets/battle/logic/pet-panel.ts');
const { initialHero, adjustPotential } = await import('../assets/battle/logic/hero-progress.ts');
const { petProgress } = await import('../assets/battle/logic/roster.ts');
const { readProgress, saveProgress, loadSessionProgress } = await import('../assets/battle/logic/local-progress.ts');
const { AutoCommands } = await import('../assets/battle/logic/auto.ts');
const { PET_SKILLS } = await import('../assets/battle/logic/pet-skills.ts');
const { wildCombat } = await import('../assets/battle/logic/wild-encounter.ts');
const skills = ['power', 'armor', 'swift', 'regen'];
const values = p => [p.attack, p.defense, p.speed];
test('victory and defeat never heal surviving regen units, including later command attempts', () => {
  for (const result of ['victory', 'defeat']) {
    const b = make(), survivor = result === 'victory' ? b.pets[1] : b.enemies[0];
    Object.assign(survivor, { hp: 100, level: 10, skillIds: ['regen'] });
    if (result === 'victory') {
      b.enemies.forEach(enemy => { enemy.hp = 1; });
      orders(b, 'attack', 'enemy-0', 'attack');
    } else {
      b.allies[0].hp = 0; b.pets[1].hp = 1;
      b.command('pet-2', 'attack', 'enemy-0');
    }
    assert.equal(b.result, result);
    const afterDamage = b.attackEvents.filter(event => event.targetId === survivor.id).at(-1).targetAfter;
    assert.equal(survivor.hp, afterDamage);
    const auto = new AutoCommands(); auto.toggle();
    b.timeout(); b.tick(60); auto.issue(b); b.checkWinner();
    assert.equal(survivor.hp, afterDamage);
    assert.deepEqual(b.log.filter(line => line.includes('回血')), []);
  }
});
function fixture(id, skillIds = []) {
  const pet = { id, name: '汀蛙', species: 'tingwa', level: 10, growth: 0.9, exp: 0, potential: 0,
    isBaby: false, isMutated: false, origin: 'initial', skillIds,
    baseStats: { constitution: 39, mana: 27, strength: 34, endurance: 31, agility: 19 },
    aptitudes: { attack: 1000, defense: 800, stamina: 2500, mana: 1100, dodge: 950, speed: 1174 } };
  return { ...pet, ...petCombat(pet) };
}
function make(selectedPetId = 'pet-2', entries = [fixture('pet'), fixture('pet-2', skills)], random = () => 0.9) {
  const b = new Battle(random, 2, 0, { entries }, () => 1, () => 0, () => 0, () => 0,
    () => 1, () => 0, { hero: initialHero(), selectedPetId }, () => 0);
  for (const enemy of b.enemies) Object.assign(enemy, { hp: 10000, maxHp: 10000, speed: 24, attack: 20 });
  return b;
}
function orders(b, command = 'defend', target, petCommand = 'defend') {
  b.command('hero', command, target);
  for (const pet of [...b.pending]) b.command(pet.id, petCommand, target);
}
test('single rounding uses raw values, real levels and live skill parameters', () => {
  const a = fixture('pet'), b = fixture('pet-2', skills);
  assert.deepEqual(values(petPanel(a)), [61, 53, 22]);
  assert.deepEqual(values(effectivePetPanel(b)), [65, 59, 25]);
  assert.equal(effectivePetPanel(b).maxHp, 236);
  assert.deepEqual(values(statPassives({ attack: 20.6, defense: 20.4, speed: 22.306 }, 2, skills)), [21, 22, 25]);
  for (const level of [0, 1, 20]) {
    const raw = { attack: 20.6, defense: 20.4, speed: 22.306 };
    assert.deepEqual(values(statPassives(raw, level, [])), [21, 20, 22]);
    assert.deepEqual(values(statPassives(raw, level, skills)), [Math.round(20.6 + level * 0.4), Math.round(20.4 + level * 0.6), 25]);
    const wild = wildCombat('pangui', level);
    assert.deepEqual(values(statPassives(wild, level, skills)), [Math.round(wild.attack + level * 0.4), Math.round(wild.defense + level * 0.6), Math.round(wild.speed * 1.1)]);
  }
  assert.deepEqual(effectivePetPanel({ ...b, level: 0, skillIds: ['power', 'armor'] }), petPanel({ ...b, level: 0 }));
  const previous = PET_SKILLS.swift.params.ratio;
  try { PET_SKILLS.swift.params.ratio = 0.5; assert.equal(effectivePetPanel(b).speed, 33); }
  finally { PET_SKILLS.swift.params.ratio = previous; }
});
test('displayed effective speed determines order; ties and physical damage retain existing rules', () => {
  for (const [id, first] of [['pet', false], ['pet-2', true]]) {
    const b = make(id), pet = b.pets.find(p => p.id === id);
    assert.equal(pet.speed, effectivePetPanel(b.roster.entries.find(p => p.id === id)).speed);
    orders(b, 'defend', 'enemy-0', 'attack');
    assert.equal(b.lastOrder.indexOf(id) < b.lastOrder.indexOf('enemy-0'), first);
    assert.equal(b.attackEvents.find(e => e.actorId === id).damage, Math.round((pet.attack - b.enemies[0].defense * 0.40) * 1.112));
    const tie = make(id);
    tie.enemies.forEach(e => { e.speed = tie.pets.find(p => p.id === id).speed; });
    orders(tie);
    assert.ok(tie.lastOrder.indexOf(id) < tie.lastOrder.indexOf('enemy-0'));
  }
});
test('regen runs once before commands, excludes inactive pets, caps healing and follows auto rounds', () => {
  const b = make(), pet = b.pets[1];
  assert.equal(b.round, 1);
  assert.equal(b.log.filter(s => s.includes('回血')).length, 0);
  for (const level of [0, 1, 10]) for (const missing of [0, 2, 10])
    assert.equal(regenAmount({ ...pet, level, hp: pet.maxHp - missing }), Math.min(Math.floor(level / 2), missing));
  for (const excluded of [{ deployed: false }, { left: true }, { hp: 0 }, { skillIds: [] }])
    assert.equal(regenAmount({ ...pet, hp: 100, ...excluded }), 0);
  pet.hp = 100;
  b.pets[0].skillIds = ['regen']; b.pets[0].hp = 100;
  orders(b);
  const after = b.attackEvents.filter(e => e.targetId === pet.id).at(-1).targetAfter;
  assert.equal(pet.hp, after + 5);
  assert.equal(b.pets[0].hp, 100);
  assert.match(b.log.at(-1), /第 2 回合.*汀蛙.*回血 5/);
  const hp = pet.hp, logs = b.log.length, auto = new AutoCommands(() => 0);
  auto.toggle(); auto.toggle(); b.tick(0);
  assert.deepEqual([pet.hp, b.log.length], [hp, logs]);
  auto.toggle(); auto.issue(b);
  assert.equal(pet.hp, b.attackEvents.filter(e => e.targetId === pet.id).at(-1).targetAfter + 5);
  orders(b, 'flee');
  const ended = pet.hp;
  b.timeout(); b.tick(30); auto.issue(b);
  assert.equal(pet.hp, ended);
});
test('summoning preserves this-battle hp until next round; swapping never stacks passives', () => {
  const b = make('pet'), incoming = b.pets[1];
  b.allies[0].speed = 100; incoming.hp = 77;
  orders(b, 'summon', incoming.id);
  assert.equal(b.attackEvents[0].targetBefore, 77);
  assert.equal(incoming.hp, b.attackEvents.at(-1).targetAfter + 5);
  orders(b, 'summon', 'pet');
  const waiting = incoming.hp;
  orders(b, 'summon', incoming.id);
  assert.equal(b.attackEvents[0].targetBefore, waiting);
  assert.deepEqual(values(incoming), [65, 59, 25]);
  for (const level of [0, 1]) {
    const low = make(); low.pets[1].level = level; low.pets[1].hp = 77;
    orders(low);
    assert.equal(low.pets[1].hp, low.attackEvents.at(-1).targetAfter);
  }
});
test('capture, upgrade, allocation and v4 reload retain base caches and ordered skills', () => {
  const b = make('pet-2', undefined, () => 0), enemy = b.enemies[0];
  Object.assign(enemy, { ...fixture('enemy-0', skills), isBaby: true, isMutated: true, hp: 8 });
  Object.assign(enemy, statPassives(petPanel(enemy), enemy.level, skills));
  b.allies[0].speed = 100;
  orders(b, 'capture', enemy.id);
  const caught = b.roster.entries.at(-1), unit = b.pets.at(-1);
  assert.deepEqual([caught.hp, unit.hp, caught.isBaby, caught.isMutated, caught.sourceEnemyId], [8, 8, true, true, 'enemy-0']);
  assert.deepEqual(caught.skillIds, skills);
  assert.deepEqual(values(caught), [61, 53, 22]);
  assert.deepEqual(values(unit), [65, 59, 25]);
  orders(b, 'summon', unit.id);
  caught.exp = 109; // level 10 needs 110; the surviving enemy awards enough to level up.
  b.enemies[1].hp = 0; b.checkWinner();
  assert.equal(caught.level, 11);
  assert.deepEqual(values(unit), values(effectivePetPanel(caught)));
  assert.equal(b.round, 3);
  const p = petProgress(caught), draft = adjustPotential(p, p, 'strength', 1);
  const preview = petPanelPreview(caught, draft);
  assert.deepEqual(preview.panel, effectivePetPanel({ ...caught, baseStats: draft.stats }));
  assert.equal(preview.delta('attack'), `+${preview.panel.attack - effectivePetPanel(caught).attack}`);
  let raw;
  const disk = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  assert.equal(b.confirmPetAllocation(caught.id, draft, pet => saveProgress(disk, b, undefined, pet)), true);
  assert.deepEqual(values(unit), values(preview.panel));
  assert.deepEqual(values(caught), values(petPanel(caught)));
  assert.equal(JSON.parse(raw).version, 4);
  assert.deepEqual(readProgress(disk).pets.at(-1).skillIds, skills);
  const session = loadSessionProgress(disk), next = new Battle(() => 0, 1, 0, session);
  assert.deepEqual(values(next.pets.at(-1)), values(unit));
  saveProgress(disk, next);
  assert.deepEqual(values(readProgress(disk).pets.at(-1)), values(caught));
});
