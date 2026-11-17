import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const ts = createRequire(import.meta.url)(process.env.COCOS_TYPESCRIPT);
globalThis.townDisk = { raw: null, writes: 0, fail: false, getItem() { return this.raw; }, setItem(_key, raw) {
  if (this.fail) throw new Error('write failed');
  this.writes++;
  this.raw = raw;
} };
globalThis.window = { location: { search: '?devPreview=1' }, URLSearchParams };
const cc = `export const _decorator = { ccclass: () => x => x, property: () => () => {} };
export const sys = { isBrowser: true, localStorage: globalThis.townDisk };
export const view = { setDesignResolutionSize() {} };
export const ResolutionPolicy = { SHOW_ALL: 1, FIXED_WIDTH: 2 };
export class Component { node = { children: [], addChild() {} }; }
export class Node {
  static EventType = { TOUCH_START: 'start', TOUCH_END: 'end', TOUCH_CANCEL: 'cancel' };
  constructor(name) { this.name = name; }
  children = [];
  active = true;
  handlers = {};
  addChild(node) { this.children.push(node); node.parent = this; }
  addComponent() { return this; }
  getComponent() { return this; }
  setContentSize(width, height) { this.size = [width, height]; }
  setAnchorPoint() {}
  setPosition(x, y) { this.position = { x, y }; }
  setScale(x, y) { this.scale = [x, y]; }
  setSkin(name) { this.skin = name; }
  setAnimation(track, name, loop) { this.played = [track, name, loop]; }
  circle() {}
  stroke() {}
  convertToNodeSpaceAR(p) { return p; }
  on(event, callback) { this.handlers[event] = callback; }
  destroy() {
    this.destroyed = true;
    for (const child of [...this.children]) child.destroy();
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
  }
}
export const game = {
  on(event, callback) { globalThis[event === 'hide' ? 'townHide' : 'townShow'] = callback; },
  off(event) { globalThis[event === 'hide' ? 'townHide' : 'townShow'] = undefined; },
}, Game = { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' };
export const assetManager = { loadBundle(name, cb) {
  globalThis.loadedBundle = name; globalThis.townLoad = cb;
  (globalThis.bundleLoads ??= {})[name] = cb;
} };
export class Vec3 { static ZERO = { x: 0, y: 0 }; constructor(x, y) { this.x = x; this.y = y; } }
export class Rect { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }
export class Size {}
export class Color {}
export class SpriteFrame { reset({ rect }) { this.rect = rect; } destroy() {} }
export class Texture2D {
  width = 864;
  height = 512;
  addRef() { return this; }
  decRef() {}
}
export const sp = { Skeleton: class {}, SkeletonData: class {} };
export const BlockInputEvents = 0, EventTouch = 0, Graphics = 0, Label = { HorizontalAlign: { CENTER: 1 } },
Mask = { Type: { GRAPHICS_ELLIPSE: 1 } },
UIOpacity = 0,
RichText = 0, Sprite = { SizeMode: { CUSTOM: 1 } }, tween = 0, Tween = 0, UITransform = 0;`;
registerHooks({
  resolve(s, c, next) {
    if (s === 'cc' || s === 'cc/env') return { url: `mock:${s}`, shortCircuit: true };
    return next(s.startsWith('.') && !s.endsWith('.ts') ? `${s}.ts` : s, c);
  },
  load(url, c, next) {
    if (url.startsWith('mock:')) return { format: 'module', shortCircuit: true,
      source: url === 'mock:cc' ? cc : 'export const PREVIEW = true; export let WECHAT = false; export const enableWechat = () => { WECHAT = true; return () => { WECHAT = false; }; };' };
    if (/\/(BattleView|TownView|pet-fusion)\.ts$/.test(url)) return { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: {
        target: url.endsWith('/pet-fusion.ts') ? ts.ScriptTarget.ES5 : ts.ScriptTarget.ES2022,
        downlevelIteration: false, module: ts.ModuleKind.ESNext, experimentalDecorators: true,
      } }).outputText };
    return next(url, c);
  },
});
const { BattleView } = await import('../assets/battle/scripts/BattleView.ts');
const { Texture2D } = await import('cc');
const { SessionProgress } = await import('../assets/battle/logic/session-progress.ts');
const { initialHero, awardExperience, adjustPotential } = await import('../assets/battle/logic/hero-progress.ts');
const { petProgress } = await import('../assets/battle/logic/roster.ts');
const { loadSessionProgress, saveProgress } = await import('../assets/battle/logic/local-progress.ts');
const { OUTSKIRTS, TOWN, TOWN_PLACES } = await import('../assets/battle/logic/exploration.ts');
const { PET_SKILLS } = await import('../assets/battle/logic/pet-skills.ts');

test('release downlevel fusion preserves species, skill order and random consumption', async () => {
  const low = await import('../assets/battle/logic/pet-fusion.ts');
  const native = await import('../assets/battle/logic/pet-fusion.ts?native');
  const [first, second] = new SessionProgress(initialHero()).roster.entries;
  const a = { ...first, level: 10, isBaby: true, species: 'tingwa', skillIds: ['thunder', 'combo'] };
  const pool = ['tingwa', 'pangui', 'maomaochong', 'pangui', 'maomaochong'];
  for (const species of ['tingwa', 'pangui']) {
    const b = { ...second, level: 10, isBaby: true, species, skillIds: ['armor', 'combo', 'waterarrow', 'thunder'] };
    assert.deepEqual(low.fusionPlan([a, b], [a.id, b.id], '', false, pool).other,
      species === 'tingwa' ? ['pangui', 'maomaochong'] : ['maomaochong']);
    for (const edge of [0, 0.45, 0.9, 1]) {
      const calls = [0, 0];
      const run = (module, index) => module.fusePets(a, b, 'fused-1', () => calls[index]++ === 0 ? edge : 0, pool);
      const child = run(low, 0), expected = run(native, 1);
      assert.deepEqual(child, expected);
      assert.equal(calls[0], calls[1]);
      assert.equal(child.species, edge >= 0.9 ? (species === 'tingwa' ? 'pangui' : 'maomaochong')
        : edge < 0.45 ? 'tingwa' : species);
      assert.deepEqual(child.skillIds, child.species === 'pangui' ? ['armor', 'thunder', 'combo', 'waterarrow']
        : species === 'pangui' ? ['thunder', 'combo', 'waterarrow'] : ['thunder', 'combo', 'armor', 'waterarrow']);
      assert.equal(calls[0], 53 + (edge >= 0.9 ? 1 : 0) +
        (species === 'tingwa' && child.species !== 'pangui' ? 4 : 3));
    }
  }
});

test('passive attributes render consistently and playback reveals healing before the next commands', async () => {
  const { Battle } = await import('../assets/battle/scripts/Battle.ts');
  const { petCombat } = await import('../assets/battle/logic/pet-panel.ts');
  const session = new SessionProgress(initialHero()), pet = session.roster.entries[0];
  Object.assign(pet, { level: 10, growth: 0.9, skillIds: ['power', 'armor', 'swift', 'regen'],
    baseStats: { constitution: 39, mana: 27, strength: 34, endurance: 31, agility: 19 },
    aptitudes: { attack: 1000, defense: 800, stamina: 2500, mana: 1100, dodge: 950, speed: 1174 } });
  Object.assign(pet, petCombat(pet));
  const v = new BattleView(), labels = [];
  v.townPreview = false;
  v.battle = new Battle(() => 0.9, 1, 0, session, () => 1, undefined, undefined, undefined, undefined, undefined, undefined, () => 0);
  v.text = value => labels.push(value);
  v.petInfoBar = () => {};
  v.renderPetAttributes(pet);
  assert.deepEqual(labels.filter(value => /^\d+$/.test(value)).slice(0, 3), ['65', '59', '25']);
  const b = v.battle, unit = b.pets[0];
  unit.hp = 100;
  const hp = v.captureHp(), deployment = v.captureDeployment();
  b.command('hero', 'defend'); b.command('pet', 'defend');
  assert.equal(unit.hp, b.attackEvents.at(-1).targetAfter + 5);
  v.render = () => {};
  const play = v.playNextAttack;
  v.playNextAttack = () => {};
  assert.equal(v.startPlayback(1, 'command', hp, deployment), true);
  assert.equal(v.displayedHp.get('pet'), 100);
  v.animationQueue = [];
  v.auto.enabled = true;
  let seen;
  v.runAuto = () => { seen = [v.displayedHp, unit.hp, v.playing]; };
  play.call(v);
  assert.deepEqual(seen, [null, unit.hp, false]);
  const healed = unit.hp;
  v.renderPetAttributes(pet); b.tick(0);
  assert.equal(unit.hp, healed);
});


test('physical playback groups each strike and its passives at both speeds', () => {
  for (const speed of [1, 2]) {
    const v = new BattleView(), pending = [], shown = [], numbers = [], logs = [], waits = [];
    v.node.getChildByName = () => undefined;
    v.townPreview = false;
    v.speedMultiplier = speed;
    const pet = { id: 'pet', side: 'ally' };
    v.unitPoint = () => ({ x: 500, y: 400 });
    const strikeNumber = v.numberLayout?.(pet, speed, 60, '连打·暴击');
    assert.equal(strikeNumber?.color, '#FF7772');
    assert.equal(v.numberLayout(pet, speed, -15, '', true).color, '#9EE685');
    assert.ok(strikeNumber.y + strikeNumber.size * 1.65 < v.healthBarY(pet, 400));
    const hit = (source, targetId, targetDamage, targetAfter) =>
      ({ kind: 'attack', source, actorId: targetId === 'pet' ? 'enemy-0' : 'pet', targetId, targetDamage, targetAfter,
        targetBefore: targetAfter + targetDamage,
        caption: { reflect: '反弹', counter: '还击' }[source] ?? (targetDamage === 60 ? '连打·暴击' : '连打') });
    const log = ['准备', '连打·暴击 60', '噬血 +15', '反弹 −15', '还击 −10', '连打 30', '噬血 +5', '回合回血'];
    v.battle = { phase: 'command', round: 2, log, events: [
      hit('main', 'enemy-0', 60, 20), { kind: 'heal', targetId: 'pet', amount: 15, targetAfter: 35 },
      hit('reflect', 'pet', 15, 20), hit('counter', 'pet', 10, 10), hit('main', 'enemy-0', 30, 0),
      { kind: 'heal', targetId: 'pet', amount: 5, targetAfter: 15 },
    ].map((event, index) => ({ ...event, logIndex: index + 1 })), units: [{ id: 'pet', hp: 20 }] };
    v.scheduleOnce = (next, delay) => { pending.push(next); waits.push(delay); };
    v.animateHp = (id, hp) => {
      shown.push([id, v.displayedHp.get(id), hp]);
      v.displayedHp.set(id, hp);
    };
    v.damageNumber = (id, damage, _speed, caption, done, small = false) => {
      numbers.push([id, damage, caption, small]);
      if (done) pending.push(done);
    };
    v.render = () => {
      logs.push(v.logLines().at(-1).text);
      if (!v.playing) shown.push([v.battle.units[0].hp]);
    };
    assert.ok(v.startPlayback(1, 'command', new Map([['pet', 20], ['enemy-0', 80]]), new Map()));
    const first = [['enemy-0', 60, '暴击', false], ['pet', -15, '', true], ['pet', 25, '', true]];
    assert.deepEqual(numbers, first);
    assert.deepEqual(shown, [['enemy-0', 80, 20], ['pet', 20, 10]]);
    assert.deepEqual(v.logLines().map(line => line.text), log.slice(1, 5));
    assert.equal(pending.length, 3);
    pending.splice(0, 2).forEach(done => done());
    assert.deepEqual(numbers, first);
    pending.shift()();
    assert.deepEqual(numbers.slice(3), [['enemy-0', 30, '', false], ['pet', -5, '', true]]);
    assert.deepEqual(shown.slice(2), [['enemy-0', 20, 0], ['pet', 10, 15]]);
    while (pending.length) pending.shift()();
    assert.deepEqual(shown.at(-1), [20]);
    assert.equal(v.displayedHp, null);
    assert.equal(v.animationQueue.length, 0);
    assert.deepEqual(logs, [log[0], log[4], log[6], log[7]]);
    assert.deepEqual(waits, []);
    assert.deepEqual(v.floatingNumberTiming(speed), speed === 1 ? [0.25, 0.4] : [0.125, 0.2]);
  }
});
test('spell playback staggers targets, hits at the glow peak, and waits for both numbers', () => {
  const v = new BattleView(), pulses = [], timers = [], impacts = [];
  v.townPreview = false;
  const units = ['hero', 'pet', 'enemy-0', 'enemy-1'].map(id => ({ id, hp: 20 }));
  v.battle = { phase: 'command', round: 2, log: ['准备', '群体施法', '闪避'], units, events: [] };
  v.render = () => {};
  v.magicPulse = (id, atFeet, _speed, peak, done) => pulses.push({ id, atFeet, peak, done });
  v.scheduleOnce = (fn, delay) => timers.push({ fn, delay });
  v.showImpact = (id, damage, hp, _dx, _dy, _speed, caption, done) => {
    v.displayedHp.set(id, hp);
    impacts.push({ id, damage, hp, caption, done });
  };
  const hp = new Map(units.map(u => [u.id, u.hp]));
  const events = [
    { kind: 'spell', actorId: 'pet', logIndex: 1, targets: [
      { targetId: 'enemy-0', damage: 5, hpAfter: 15 },
      { targetId: 'enemy-1', damage: 4, hpAfter: 16 },
    ] },
    { kind: 'dodge', targetId: 'hero', logIndex: 2 },
  ];
  assert.ok(v.startPlayback(1, 'command', hp, new Map(), events));
  assert.deepEqual(pulses.map(p => [p.id, p.atFeet]), [['pet', true]]);
  pulses[0].done();
  assert.equal(timers[0].delay, 0.08);
  assert.equal(impacts.length, 0);
  pulses[1].peak();
  timers[0].fn();
  pulses[2].peak();
  assert.deepEqual(impacts.map(i => [i.id, i.damage, i.hp]), [['enemy-0', 5, 15], ['enemy-1', 4, 16]]);
  impacts[0].done();
  assert.equal(v.animationQueue.length, 1);
  impacts[1].done();
  assert.deepEqual([impacts[2].caption, impacts[2].hp], ['闪避', 20]);
  impacts[2].done();
  assert.deepEqual([v.playing, v.animationQueue.length, v.displayedHp], [false, 0, null]);
});

test('real spell playback keeps mana and HP separate until cast and impact, then settles once', async () => {
  const { Battle } = await import('../assets/battle/scripts/Battle.ts');
  const v = new BattleView(), pulses = [];
  v.townPreview = false;
  const b = v.battle = new Battle(() => 0.5, 1, 0, new SessionProgress(initialHero(), undefined, undefined, () => 0));
  Object.assign(b.pets[0], { skillIds: ['thunder'], mana: 5, speed: 100 });
  b.roster.entries[0].exp = 19;
  b.enemies[0].hp = 1;
  const hp = v.captureHp(), deployed = v.captureDeployment();
  v.render = () => {};
  v.finishBattle = () => { assert.equal(v.playing, false); pulses.push('finish'); };
  v.magicPulse = (_id, _feet, _speed, peak, done) => pulses.push({ peak, done });
  v.showImpact = (id, _damage, hp, _dx, _dy, _speed, _caption, done) => { v.displayedHp.set(id, hp); done(); };
  b.command('hero', 'defend'); b.command('pet', 'spell', 'enemy-0', 'thunder');
  assert.equal(b.events[0]?.kind, 'spell');
  assert.ok(v.startPlayback(1, 'command', hp, deployed));
  assert.deepEqual([v.displayedMana.get('pet'), v.displayedHp.get('enemy-0')], [5, 1]);
  pulses[0].peak(); pulses[0].done();
  assert.deepEqual([v.displayedMana.get('pet'), v.displayedHp.get('enemy-0')], [0, 1]);
  pulses[1].peak();
  assert.deepEqual([pulses[2], v.displayedMana, b.result], ['finish', null, 'victory']);
  assert.deepEqual([b.pets[0].level, b.pets[0].mana], [2, b.pets[0].maxMana]);
});

test('WeChat map keeps the hero visible after battle, while moving and when stopped', async t => {
  const { enableWechat } = await import('cc/env');
  const { TownView } = await import('../assets/battle/scripts/TownView.ts');
  t.after(enableWechat());
  const town = new TownView(new BattleView().node, () => {}), idle = { rect: { width: 153, height: 241 } };
  town.load('outskirts'); townLoad(null, { load: (_path, _type, ready) => ready(null, {}) });
  town.draw(idle, () => false, () => {});
  bundleLoads.battle(null, { load: (_path, _type, ready) => ready(null, new Texture2D()) });
  town.root.active = false; town.root.active = true; town.update(0);
  assert.deepEqual([town.actor.active, town.actor.spriteFrame, town.loadingSpine], [true, idle, false]);
  const { x, y } = town.movement.position;
  assert.ok(town.movement.select({ x: x + 40, y: y + 15 })); town.update(0.01);
  assert.equal(town.actor.active, true); assert.notEqual(town.actor.spriteFrame, idle);
  town.update(1); assert.equal(town.actor.active, true); assert.equal(town.actor.spriteFrame, idle);
});
test('town and outskirts use Spine run downhill, frame run uphill and keep one foot baseline', () => {
  const v = new BattleView();
  v.render = () => {};
  v.start();
  const view = v.town;
  const idle = { rect: { width: 153, height: 241 } };
  let textureLoaded;
  const atlas = { load(path, _type, complete) {
    assert.equal(path, 'textures/units/hero_run/texture');
    textureLoaded = complete;
  } };
  const map = { load(_path, _type, complete) { complete(null, {}); } };
  for (const region of ['town', 'outskirts']) {
    view.load(region);
    townLoad(null, map);
    view.draw(idle, () => false, () => {});
    const world = view.root.children[0];
    const actor = world.children.findLast(child => child.name === 'town-hero');
    assert.equal(actor.spriteFrame, idle);
    const [, height] = actor.size;
    if (region === 'town') {
      assert.equal(loadedBundle, 'battle');
      townLoad(null, atlas);
      textureLoaded(null, new Texture2D());
      bundleLoads.town(null, { load(path, _type, complete) {
        assert.equal(path, 'spine/skeleton');
        complete(null, { addRef() { return this; }, decRef() {} });
      } });
    }
    const spine = world.children.findLast(child => child.name === 'town-hero-idle');
    assert.ok(spine);
    assert.equal(spine.active, true);
    assert.deepEqual(spine.played, [0, 'idle', true]);
    const { x, y } = view.movement.position;
    assert.ok(view.movement.select({ x: x - 60, y: y - 12 }));
    view.update(0.01);
    assert.equal(spine.active, false);
    const first = actor.spriteFrame;
    assert.equal(first.rect.y, 256);
    assert.equal(first.rect.x, 0);
    assert.deepEqual(actor.scale, [-1, 1]);
    assert.equal(actor.size[1], height);
    assert.equal(actor.position.y, -view.movement.position.y - 3);
    view.update(0.09);
    assert.equal(actor.spriteFrame.rect.x, 144);
    assert.equal(actor.spriteFrame.rect.y, 256);
    view.stop();
    assert.equal(spine.active, true);
    assert.deepEqual(spine.played, [0, 'idle', true]);
    assert.equal(actor.active, false);
    assert.equal(Math.sign(spine.scale[0]), -1);
    const scale = height * 250 / (256 * 697);
    assert.equal(spine.scale[1], scale);
    assert.equal(spine.position.y, -view.movement.position.y - 3 - 37 * scale);
    assert.equal(actor.spriteFrame, idle);
    assert.deepEqual(actor.scale, [-1, 1]);
    const current = view.movement.position;
    assert.ok(view.movement.select({ x: current.x - 30, y: current.y + 0.2 }));
    view.update(0.01);
    assert.equal(actor.spriteFrame.rect.y, 256);
    view.update(0.25);
    assert.equal(actor.spriteFrame, idle);
    assert.equal(actor.position.y, -(current.y + 0.2) - 3);
    const down = view.movement.position;
    assert.ok(view.movement.select({ x: down.x + 40, y: down.y + 15 }));
    view.update(0.01);
    assert.equal(spine.active, true);
    assert.equal(actor.active, false);
    assert.deepEqual(spine.played, [0, 'run', true]);
    assert.equal(Math.sign(spine.scale[0]), 1);
    assert.ok(Math.abs(spine.timeScale - 11 / 9) < 1e-12);
    assert.equal(spine.position.y, actor.position.y - 37 * scale);
    view.stop();
    assert.deepEqual(spine.played, [0, 'idle', true]);
    const left = view.movement.position;
    assert.ok(view.movement.select({ x: left.x - 40, y: left.y + 15 }));
    view.update(0.01);
    assert.deepEqual(spine.played, [0, 'run', true]);
    assert.equal(Math.sign(spine.scale[0]), -1);
    view.stop();
    assert.equal(Math.sign(spine.scale[0]), -1);
  }
});

test('real view routes town without Battle; retry and redraw keep the same progress', () => {
  const v = new BattleView();
  v.render = () => {};
  v.start();
  assert.equal(v.battle, undefined);
  const session = v.progress;
  const before = townDisk.raw;
  townLoad(new Error('map failed'));
  assert.match(v.town.error, /加载失败/);
  v.town.load();
  townLoad(null, { load(_path, _type, cb) { cb(null, {}); } });
  assert.equal(v.town.error, '');
  assert.equal(v.progress, session);
  assert.equal(townDisk.raw, before);
  assert.ok(v.town.movement.select({ x: 850, y: TOWN.spawn.y }));
  v.stopPotentialRepeat({ type: 'blur' });
  assert.equal(v.town.movement.target, undefined);
  assert.ok(v.town.movement.select({ x: 850, y: TOWN.spawn.y }));
  v.onDisable();
  v.update(30);
  assert.equal(v.town.movement.target, undefined);
  let blocked;
  v.town.draw = (_hero, check) => { blocked = check; };
  v.town.frame = undefined;
  v.rect = () => ({ addComponent() {} });
  v.text = () => {};
  v.enabledInHierarchy = false;
  v.renderTown();
  assert.equal(blocked(), true);
  v.enabledInHierarchy = true;
  assert.equal(blocked(), false);
  townDisk.raw = '{bad';
  const broken = new BattleView();
  broken.render = () => {};
  broken.start();
  assert.equal(broken.battle, undefined);
  assert.equal(broken.progressReadFailed, true);
  assert.equal(townDisk.raw, '{bad');
});

test('town panel callbacks use correct IDs, preserve failed writes and persist confirmed changes', () => {
  const v = new BattleView();
  v.render = () => {};
  v.townSession = new SessionProgress(awardExperience(initialHero(), 10), undefined, undefined, () => 0);
  const session = v.progress, pet = session.roster.entries[1];
  const largest = Object.keys(pet.baseStats).sort((a, b) => pet.baseStats[b] - pet.baseStats[a])[0];
  pet.baseStats[largest] -= 5;
  pet.potential = 5;
  session.roster.awardExperience(new Set([pet.id]), 30);
  saveProgress(townDisk, session);
  const before = townDisk.raw;
  v.selectedPetId = pet.id;
  const heroDraft = adjustPotential(session.heroProgress, session.heroProgress, 'strength', 1);
  const petDraft = adjustPotential(petProgress(pet), petProgress(pet), 'strength', 1);
  townDisk.fail = true;
  assert.throws(() => v.confirmHeroPoints(heroDraft), /write failed/);
  assert.throws(() => v.confirmPetPoints(pet.id, petDraft), /write failed/);
  assert.throws(() => v.releaseProgressPet(pet.id), /write failed/);
  assert.equal(townDisk.raw, before);
  assert.equal(session.heroProgress.potential, 5);
  assert.equal(session.roster.entries.length, 2);
  townDisk.fail = false;
  assert.equal(v.releaseProgressPet(session.selectedPetId), false);
  assert.ok(v.confirmHeroPoints(heroDraft));
  assert.ok(v.confirmPetPoints(pet.id, petDraft));
  assert.equal(loadSessionProgress(townDisk).roster.entries[1].baseStats.strength, petDraft.stats.strength);
  assert.equal(session.selectedPetId, 'pet');
  assert.ok(v.releaseProgressPet(pet.id));
  const restored = loadSessionProgress(townDisk);
  assert.equal(restored.heroProgress.stats.strength, heroDraft.stats.strength);
  assert.deepEqual(restored.roster.entries.map(p => p.id), ['pet']);
});

test('town and outskirts share fixed portraits and the original progress panel entries', () => {
  const v = new BattleView();
  v.render = () => {};
  v.start();
  v.enabledInHierarchy = true;
  const session = v.progress, writes = townDisk.writes;
  v.town.frame = {};
  v.town.loading = false;
  v.town.draw = () => {};
  const blockers = [];
  v.rect = (x, y, w, h) => ({ addComponent() { blockers.push([x, y, w, h]); } });
  v.button = () => ({ addComponent() {} });
  v.text = v.unitColor = v.petArt = () => {};
  for (const region of ['town', 'outskirts', 'town']) {
    v.town.region = region;
    v.rosterOpen = false;
    v.detailsOpen = null;
    v.renderTown();
    const pet = v.layer.children.find(node => node.name === 'portrait-pet');
    const hero = v.layer.children.find(node => node.name === 'portrait-hero');
    assert.ok(pet && hero, `${region} must show both portraits`);
    assert.equal(pet.parent.name, 'town-ui');
    assert.equal(hero.parent, pet.parent);
    assert.deepEqual(pet.position, { x: 271, y: 321 });
    assert.deepEqual(hero.position, { x: 467, y: 321 });
    assert.ok(blockers.some(rect => String(rect) === '906,18,192,104'));
    assert.ok(blockers.some(rect => String(rect) === '1102,18,192,104'));
    pet.handlers.end();
    assert.equal(v.rosterOpen, true);
    assert.equal(v.selectedPetId, session.selectedPetId);
    assert.equal(v.mapBlocked, true);
    v.rosterOpen = false;
    hero.handlers.end();
    assert.equal(v.detailsOpen, 'hero');
    assert.equal(v.mapBlocked, true);
    assert.equal(v.progress, session);
  }
  assert.equal(townDisk.writes, writes);
});

test('outskirts loading is atomic, ignores stale callbacks, and round trips without a save', () => {
  const v = new BattleView();
  v.render = () => {};
  v.start();
  const session = v.progress, writes = townDisk.writes, raw = townDisk.raw;
  const view = v.town;
  let finish;
  const bundle = { load(path, _type, cb) { finish = cb; return path; } };
  townLoad(null, bundle);
  const townFrame = {};
  finish(null, townFrame);
  const places = [];
  view.draw(null, () => false, place => places.push(place.id));
  const [world, labels] = view.root.children;
  assert.deepEqual(labels?.children.map(node => node.name), ['bag', 'pet', 'fuse', 'notice', 'exit']);
  assert.equal(world.children.some(node => node.name === 'exit'), false);
  const map = view.root.children[0].children[0];
  const touch = (id, x, y = 500) => ({
    getID: () => id,
    getUILocation: () => ({ x: x - 667 - view.origin.x, y: 375 + view.origin.y - y }),
  });
  map.handlers.start(touch(1, 700, 450));
  map.handlers.start(touch(2, 850));
  map.handlers.end(touch(2, 850));
  assert.equal(view.movement.target, undefined);
  map.handlers.end(touch(1, 700, 450));
  assert.deepEqual(view.movement.target, { x: 700, y: 450 });
  assert.equal(view.ripple.active, true);
  view.update(0.5);
  assert.equal(view.ripple.active, false);
  map.handlers.start(touch(5, 800, 500));
  map.handlers.end(touch(5, 800, 500));
  assert.ok(Math.hypot(view.movement.destination.x - 800, view.movement.destination.y - 500) < 20);
  assert.notDeepEqual(view.movement.destination, { x: 800, y: 500 });
  assert.deepEqual(view.ripple.position, { x: view.movement.destination.x, y: -view.movement.destination.y });
  for (const place of TOWN_PLACES) {
    const event = touch(4, place.x, place.y);
    map.handlers.start(event);
    map.handlers.end(event);
    assert.equal(view.movement.target, undefined);
  }
  assert.deepEqual(places, ['bag', 'pet', 'fuse', 'notice', 'exit']);
  map.handlers.start(touch(3, 850));
  map.handlers.cancel(touch(3, 850));
  map.handlers.end(touch(3, 850));
  assert.equal(view.movement.target, undefined);
  v.onEnable();
  view.movement.select({ x: 800, y: 500 });
  townHide();
  assert.equal(view.movement.target, undefined);
  v.onDisable();
  assert.equal(townHide, undefined);
  v.enabledInHierarchy = true;
  v.onEnable();
  v.detailsOpen = 'hero';
  v.rect = v.button = () => ({ addComponent() {} });
  v.text = v.renderHeroPanel = () => {};
  view.movement.select({ x: 800, y: 500 });
  v.renderTown();
  assert.equal(view.movement.target, undefined);
  v.detailsOpen = null;
  const buttons = [], portraits = [];
  v.button = (label, _x, _y, _w, _h, enabled) => {
    buttons.push([label, enabled]);
    return { addComponent() {} };
  };
  v.statusCard = (kind, x, unit) => portraits.push([kind, x, unit.id]);
  v.renderTown();
  assert.deepEqual(buttons, [['下场掉率：正式', true], ['人物', true], ['宠物', true], ['背包', true], ['合宠', true], ['出城', true]]);
  assert.deepEqual(portraits, [['pet', 906, session.selectedPetId], ['hero', 1102, 'hero']]);
  assert.ok(view.movement.select({ x: 800, y: 500 }));
  let activate;
  view.draw = (_hero, _blocked, onPlace) => { activate = onPlace; };
  v.renderTown();
  for (const place of TOWN_PLACES.filter(p => ['bag', 'fuse', 'notice'].includes(p.id))) {
    activate(place);
    if (place.id === 'fuse') {
      assert.equal(v.fusionOpen, true); assert.equal(view.movement.target, undefined);
      v.fusionOpen = v.rosterOpen = false;
    } else if (place.id === 'bag') {
      assert.equal(v.inventoryOpen, true); assert.equal(view.movement.target, undefined);
      v.inventoryOpen = v.rosterOpen = false;
    } else assert.equal(view.message, `${place.name}·未开放`);
  }
  view.load('outskirts');
  assert.equal(view.movement.target, undefined);
  assert.equal(loadedBundle, 'outskirts');
  const pending = townLoad;
  view.load('outskirts');
  assert.equal(townLoad, pending);
  pending(null, bundle);
  const stale = finish;
  finish(new Error('map failed'));
  assert.equal(view.region, 'town');
  assert.equal(view.frame, townFrame);
  assert.match(view.error, /加载失败/);
  view.load('outskirts');
  stale(null, {});
  assert.equal(view.region, 'town');
  townLoad(null, bundle);
  finish(null, {});
  assert.equal(view.region, 'outskirts');
  assert.deepEqual(view.movement.position, OUTSKIRTS.spawn);
  assert.equal(map.destroyed, true);
  view.load('town');
  townLoad(null, bundle);
  finish(null, townFrame);
  assert.deepEqual(view.movement.position, TOWN.spawn);
  assert.equal(view.movement.target, undefined);
  assert.equal(v.progress, session);
  assert.equal(v.battle, undefined);
  assert.equal(townDisk.writes, writes);
  assert.equal(townDisk.raw, raw);
});

test('ordinary entry reads the saved session into town without writing or creating Battle', () => {
  window.location.search = '';
  const raw = townDisk.raw, writes = townDisk.writes;
  const v = new BattleView();
  v.render = () => {};
  v.start();
  assert.equal(v.battle, undefined);
  assert.deepEqual(v.town.movement.position, TOWN.spawn);
  assert.equal(v.progress.selectedPetId, loadSessionProgress(townDisk).selectedPetId);
  assert.equal(townDisk.raw, raw);
  assert.equal(townDisk.writes, writes);
});

async function roundTripView(sample = 'single') {
  const { Node } = await import('cc');
  window.location.search = `?devPreview=1&roundTripSample=${sample}`;
  townDisk.raw = null;
  townDisk.fail = false;
  const v = new BattleView();
  v.node = new Node('canvas');
  v.enabledInHierarchy = true;
  v.render = () => {};
  v.start();
  const complete = () => townLoad(null, { load(_path, _type, cb) { cb(null, {}); } });
  complete();
  v.town.load('outskirts');
  complete();
  v.town.movement.position = { x: 1500, y: 410 };
  v.town.movement.select({ x: 1600, y: 420 });
  v.town.error = '暂时无法到达';
  v.startFixedBattle();
  return { v, complete, session: v.progress, position: { x: 1500, y: 410 } };
}

test('map victory waits for playback, retries the identical snapshot, and blocks side writes', async () => {
  const { v, session, position } = await roundTripView();
  const battle = v.battle, root = v.town.root, movement = v.town.movement;
  const before = townDisk.raw, writes = townDisk.writes;
  v.startFixedBattle();
  assert.equal(v.battle, battle);
  assert.equal(battle.session, session);
  assert.equal(root.active, false);
  assert.equal(movement.target, undefined);
  const hp = v.captureHp(), deployed = v.captureDeployment();
  battle.command('hero', 'capture', 'enemy-0');
  battle.command('pet', 'defend');
  const nextAttack = v.playNextAttack;
  v.playNextAttack = () => {};
  assert.equal(v.startPlayback(1, 'command', hp, deployed), true);
  assert.equal(townDisk.raw, before);
  v.finishBattle();
  assert.equal(v.mapBattle, true);
  v.animationQueue = [];
  townDisk.fail = true;
  nextAttack.call(v);
  assert.equal(v.playing, false);
  assert.match(v.progressError, /保存失败/);
  assert.equal(v.mapBattle, true);
  const snapshot = v.resultCandidate;
  assert.equal(typeof snapshot, 'string');
  assert.equal(townDisk.raw, before);
  const draft = adjustPotential(session.heroProgress, session.heroProgress, 'strength', 1);
  assert.equal(v.confirmHeroPoints(draft), false);
  assert.equal(v.releaseProgressPet('pet-2'), false);
  v.onEnable();
  townHide();
  v.onDisable();
  v.onEnable();
  v.update(100);
  v.finishBattle();
  assert.equal(v.resultCandidate, snapshot);
  assert.equal(v.mapBattle, true);
  townDisk.fail = false;
  v.finishBattle();
  v.finishBattle();
  nextAttack.call(v);
  assert.equal(townDisk.raw, snapshot);
  assert.equal(townDisk.writes, writes + 1);
  assert.equal(v.mapBattle, false);
  assert.equal(v.town.root, root);
  assert.equal(root.destroyed, undefined);
  assert.equal(root.active, true);
  assert.deepEqual(movement.position, position);
  assert.equal(movement.target, undefined);
  assert.equal(v.progress, session);
  assert.equal(loadSessionProgress(townDisk).roster.entries.length, 3);
  assert.equal(v.town.encounters.protection, 180);
  assert.equal(v.town.encounters.remainder, 0);
  assert.equal(loadSessionProgress(townDisk).selectedPetId, session.selectedPetId);
});

test('kill, escape and defeat return once; captured pets survive and auto uses the latest choice', async () => {
  for (const outcome of ['victory', 'escaped', 'defeat']) {
    const { v, session, position, complete } = await roundTripView('pair');
    const b = v.battle;
    b.command('hero', 'capture', 'enemy-0');
    b.command('pet', 'defend');
    v.playNextAttack = () => {};
    v.startPlayback(1, 'command', v.captureHp(), v.captureDeployment());
    assert.equal(loadSessionProgress(townDisk).roster.entries.length, 3);
    v.playing = false;
    b.command('hero', 'summon', 'caught-1');
    b.command('pet', 'defend');
    if (outcome === 'escaped') {
      b.command('hero', 'flee');
      b.command('caught-1', 'defend');
    } else {
      (outcome === 'victory' ? b.enemies : b.allies).forEach(unit => { unit.hp = 0; });
      b.checkWinner();
    }
    assert.equal(b.result, outcome);
    assert.equal(v.resultTitle, { victory: '战斗胜利', escaped: '整队逃离', defeat: '战斗失败' }[outcome]);
    assert.equal(b.earnedExp, outcome === 'victory' ? 20 : 0);
    v.auto.toggle();
    v.finishBattle();
    if (outcome === 'defeat') complete();
    assert.equal(v.town.message, '', 'old map errors must not mask the result message');
    assert.match(v.returnMessage, /战斗胜利.*20|整队逃离|战败回城/);
    assert.equal(v.town.region, outcome === 'defeat' ? 'town' : 'outskirts');
    assert.deepEqual(v.town.movement.position, outcome === 'defeat' ? TOWN.spawn : position);
    assert.equal(v.town.movement.target, undefined);
    assert.equal(v.town.encounters.protection, 180);
    assert.equal(loadSessionProgress(townDisk).selectedPetId, 'caught-1');
    assert.equal(loadSessionProgress(townDisk).roster.entries.length, 3);
    if (outcome === 'defeat') { v.town.load('outskirts'); complete(); }
    v.startFixedBattle();
    assert.equal(v.auto.enabled, true);
    v.auto.toggle();
    v.battle.allies.forEach(unit => { unit.hp = 0; });
    v.battle.checkWinner();
    v.playing = false;
    v.finishBattle();
    complete();
    v.town.load('outskirts');
    complete();
    v.startFixedBattle();
    assert.equal(v.auto.enabled, false);
    assert.equal(v.battle.round, 1);
    assert.ok(v.battle.allies.every(unit => unit.hp === unit.maxHp));
  }
});

test('battle redraw cleanup preserves the map root and removes only transient layers', async () => {
  const { v } = await roundTripView();
  const { Node } = await import('cc');
  const camera = new Node('Camera'), battleLayer = new Node('result-layer');
  v.node.addChild(camera);
  v.node.addChild(battleLayer);
  v.clearView();
  assert.equal(camera.destroyed, undefined);
  assert.equal(v.town.root.destroyed, undefined);
  assert.equal(battleLayer.destroyed, true);
});

test('defeat cannot start another field fight when the town reload fails; retry does not save again', async () => {
  const { v, complete } = await roundTripView('defeat');
  const battle = v.battle;
  battle.allies.forEach(unit => { unit.hp = 0; });
  battle.checkWinner();
  assert.equal(v.startPlayback(1, 'command', v.captureHp(), v.captureDeployment()), true);
  const writes = townDisk.writes;
  townLoad(new Error('town unavailable'));
  v.startFixedBattle();
  assert.equal(v.battle, battle);
  assert.equal(v.returningTown, true);
  v.town.load('town');
  complete();
  assert.equal(v.town.region, 'town');
  assert.deepEqual(v.town.movement.position, TOWN.spawn);
  assert.equal(townDisk.writes, writes);
});

test('explicit legacy preview cannot reset away an unsaved result, but read-failure recovery remains available', () => {
  window.location.search = '?devPreview=1&battlePreview=1';
  townDisk.fail = false;
  const v = new BattleView();
  v.render = () => {};
  v.start();
  const battle = v.battle, raw = townDisk.raw;
  battle.allies.forEach(unit => { unit.hp = 0; });
  battle.checkWinner();
  townDisk.fail = true;
  v.finishBattle();
  const candidate = v.resultCandidate;
  let confirmations = 0;
  window.confirm = () => { confirmations++; return false; };
  v.resetTestProgress();
  assert.equal(confirmations, 0);
  assert.equal(v.battle, battle);
  assert.equal(v.resultCandidate, candidate);
  assert.equal(townDisk.raw, raw);
  townDisk.fail = false;
  townDisk.raw = '{bad';
  const broken = new BattleView();
  broken.render = () => {};
  broken.start();
  broken.resetTestProgress();
  assert.equal(confirmations, 1);
  delete window.confirm;
});

test('real movement opens one battle after 240, preserves counters across blockers and resets after return', () => {
  window.location.search = '?devPreview=1&encounterSample=1&roundTripSample=single';
  townDisk.raw = null;
  const v = new BattleView();
  v.enabledInHierarchy = true;
  v.render = () => {};
  v.start();
  const complete = () => townLoad(null, { load(_path, _type, cb) { cb(null, {}); } });
  complete();
  const t = v.town, writes = townDisk.writes;
  t.movement.select({ x: 850, y: 443 });
  v.update(10);
  assert.equal(t.encounters.protection, 180, 'town movement never counts');
  t.load('outskirts');
  townLoad(new Error('failed'));
  assert.equal(t.region, 'town');
  t.load('outskirts');
  complete();
  t.movement.select({ x: 1100, y: 375 });
  v.update(1);
  assert.equal(t.encounters.protection, 0);
  v.update(0.25);
  assert.equal(t.encounters.remainder, 45);
  for (const block of ['detailsOpen', 'rosterOpen', 'returningTown']) {
    v[block] = block === 'detailsOpen' ? 'hero' : true;
    v.update(10);
    assert.equal(t.encounters.remainder, 45);
    assert.equal(t.movement.target, undefined);
    v[block] = block === 'detailsOpen' ? null : false;
    v.update(10);
    assert.equal(t.encounters.remainder, 45);
    t.movement.select({ x: 1100, y: 375 });
  }
  v.onEnable();
  townHide();
  t.movement.select({ x: 1100, y: 375 });
  v.update(10);
  assert.equal(t.encounters.remainder, 45);
  townShow();
  v.update(10);
  assert.equal(t.movement.target, undefined, 'foreground return does not resume a hidden target');
  v.onDisable();
  v.onEnable();
  t.movement.select({ x: 1100, y: 375 });
  v.auto.toggle();
  v.update(10);
  assert.equal(v.mapBattle, true);
  assert.deepEqual(t.movement.position, { x: 780, y: 375 });
  assert.equal(t.origin.x, 113, 'camera reaches the encounter point before switching');
  assert.deepEqual(v.returnPoint, t.movement.position);
  assert.equal(t.movement.target, undefined);
  assert.equal(townDisk.writes, writes);
  const b = v.battle;
  v.startFixedBattle();
  assert.equal(v.battle, b);
  v.auto.toggle();
  b.enemies.forEach(enemy => { enemy.hp = 0; });
  b.checkWinner();
  v.finishBattle();
  assert.equal(t.encounters.protection, 180);
  assert.equal(t.encounters.remainder, 0);
  assert.equal(v.auto.enabled, false);
  t.movement.select({ x: 1100, y: 375 });
  v.update(0.5);
  assert.equal(t.encounters.protection, 90);
  t.load('town');
  v.update(10);
  townLoad(new Error('failed return'));
  assert.equal(t.region, 'outskirts');
  assert.equal(t.encounters.protection, 90, 'failed map load retains counters');
  t.load('town');
  complete();
  t.load('outskirts');
  complete();
  assert.equal(t.encounters.protection, 180, 'only a successful field entry resets protection');
  const raw = townDisk.raw;
  window.location.search = '';
  const refresh = new BattleView();
  refresh.render = () => {};
  refresh.start();
  assert.deepEqual(refresh.town.movement.position, TOWN.spawn);
  assert.equal(townDisk.raw, raw);
  assert.equal(refresh.auto.enabled, false);
});

test('sample parameters require explicit development mode; bad saves stay unchanged', () => {
  window.location.search = '?roundTripSample=single&encounterSample=1&battlePreview=1&layout=10v10';
  const v = new BattleView();
  v.render = () => {};
  v.start();
  assert.equal(v.devPreview, false);
  assert.equal(v.layoutTest, false);
  assert.equal(v.onMap, true);
  assert.equal(v.canResetProgress, false);
  townDisk.raw = '{bad';
  const writes = townDisk.writes, broken = new BattleView();
  broken.render = () => {};
  broken.start();
  broken.persistProgress();
  assert.equal(broken.townSession, undefined);
  assert.equal(broken.battle, undefined);
  assert.match(broken.progressError, /读取失败/);
  assert.equal(townDisk.raw, '{bad');
  assert.equal(townDisk.writes, writes);
});

test('startup retries migration with the same candidate before creating a playable session', () => {
  const source = new SessionProgress(initialHero());
  saveProgress(townDisk, source);
  const saved = JSON.parse(townDisk.raw);
  saved.version = 3;
  delete saved.inventory; delete saved.lastSettledId; delete saved.nextFusedId;
  saved.pets.forEach(p => { delete p.skillIds; });
  const raw = JSON.stringify(saved), values = new Map([['qingqiu-linglu:test-progress', raw]]), attempts = [];
  const original = { getItem: townDisk.getItem, setItem: townDisk.setItem };
  let fail = true;
  townDisk.getItem = key => values.get(key) ?? null;
  townDisk.setItem = (key, value) => {
    if (key.endsWith('test-progress')) { attempts.push(value); if (fail) throw Error('migration failed'); }
    values.set(key, value);
  };
  try {
    const v = new BattleView();
    v.render = () => {};
    v.start();
    assert.equal(v.townSession, undefined);
    assert.equal(v.mapBlocked, true);
    assert.match(v.progressError, /migration failed/);
    fail = false;
    v.retryProgress();
    assert.ok(v.townSession);
    assert.equal(v.progressReadFailed, false);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0], attempts[1]);
  } finally { Object.assign(townDisk, original); }
});

test('fixed mutation preview generates a level-zero baby and normal baby preview never mutates', () => {
  for (const sample of ['mutationSample', 'babySample']) {
    window.location.search = `?devPreview=1&battlePreview=1&${sample}=1`;
    const v = new BattleView();
    const battle = v.createBattle();
    assert.deepEqual(battle.enemies.map(p => [p.level, p.isBaby, p.isMutated]), [[0, true, sample === 'mutationSample']]);
  }
  window.location.search = '?devPreview=1';
});

test('inventory pauses map and battle; locked rates settle once with identical retry bytes and refresh', async () => {
  for (const outcome of ['victory', 'capture', 'escaped', 'defeat']) for (const speed of [1, 2]) {
    const { v, session, complete } = await roundTripView(outcome === 'capture' ? 'single' : 'pair');
    const b = v.battle, initialMode = b.dropMode;
    session.dropMode = 'test'; v.speedMultiplier = speed;
    assert.equal(b.dropMode, initialMode);
    session.inventory = { rejuvenation: 99 };
    let rolls = 0; v.dropRandom = () => { rolls++; return 0; };
    v.openInventory(); const seconds = b.seconds;
    v.update(100); assert.equal(b.seconds, seconds);
    v.inventoryOpen = false; v.rosterOpen = false;
    if (outcome === 'capture') { b.command('hero', 'capture', 'enemy-0'); b.command('pet', 'defend'); }
    else if (outcome === 'escaped') { b.command('hero', 'flee'); b.command('pet', 'defend'); }
    else { (outcome === 'victory' ? b.enemies : b.allies).forEach(u => u.hp = 0); b.checkWinner(); }
    const victory = b.result === 'victory', before = townDisk.raw, writes = townDisk.writes;
    townDisk.fail = true; v.finishBattle();
    const candidate = v.resultCandidate;
    assert.equal(typeof candidate, 'string'); assert.equal(townDisk.raw, before);
    assert.deepEqual(session.inventory, { rejuvenation: 99 });
    assert.equal(session.lastSettledId, 0);
    v.finishBattle(); assert.equal(v.resultCandidate, candidate);
    assert.equal(rolls, victory ? 4 : 0);
    townDisk.fail = false; v.finishBattle(); v.finishBattle();
    if (outcome === 'defeat') complete();
    assert.equal(townDisk.writes, writes + 1); assert.equal(townDisk.raw, candidate);
    assert.equal(session.inventory.rejuvenation, victory ? 100 : 99);
    assert.equal(session.lastSettledId, b.battleId);
    const refreshed = loadSessionProgress(townDisk);
    assert.deepEqual(refreshed.inventory, session.inventory);
    assert.deepEqual(refreshed.heroProgress, session.heroProgress);
    assert.equal(refreshed.roster.entries.length, outcome === 'capture' ? 3 : 2);
    v.town.movement.select({ x: 1600, y: 420 }); v.openInventory();
    assert.equal(v.mapBlocked, true); assert.equal(v.town.movement.target, undefined);
    const position = { ...v.town.movement.position }; v.update(10);
    assert.deepEqual(v.town.movement.position, position);
    v.inventoryOpen = false; v.rosterOpen = false; v.update(10);
    assert.deepEqual(v.town.movement.position, position);
    if (outcome === 'defeat') { v.town.load('outskirts'); complete(); }
    v.startFixedBattle(); assert.equal(v.battle.dropMode, 'test');
    assert.equal(v.battle.battleId, b.battleId + 1);
    assert.equal(rolls, victory ? 4 : 0);
  }
});

test('nonterminal capture carries inventory in its save; replayed settled IDs never redraw rewards', async () => {
  const { v, session } = await roundTripView('pair'), b = v.battle;
  session.inventory = { rejuvenation: 99 }; v.persistProgress();
  let rolls = 0; v.dropRandom = () => { rolls++; return 0; };
  const hp = v.captureHp(), deployment = v.captureDeployment();
  b.command('hero', 'capture', 'enemy-0'); b.command('pet', 'defend');
  v.playNextAttack = () => {};
  v.startPlayback(1, 'command', hp, deployment);
  assert.equal(b.result, undefined); assert.equal(rolls, 0);
  assert.deepEqual(JSON.parse(townDisk.raw).inventory, { rejuvenation: 99 });
  assert.equal(JSON.parse(townDisk.raw).pets.length, 3);
  b.enemies.forEach(u => u.hp = 0); b.checkWinner();
  v.playing = false; v.finishBattle();
  const inventory = { ...session.inventory }, hero = structuredClone(session.heroProgress);
  v.resultSaved = false; v.resultCandidate = undefined; v.resultDrops = undefined; v.mapBattle = true;
  b.checkWinner(); v.finishBattle();
  assert.deepEqual(session.inventory, inventory); assert.deepEqual(session.heroProgress, hero);
  assert.equal(rolls, 4); assert.deepEqual(JSON.parse(townDisk.raw).inventory, inventory);
});

test('skill slots open only owned skills and close on switching pets', () => {
  const v = new BattleView(), labels = [], actions = [];
  v.render = () => {};
  v.text = value => labels.push(value);
  v.rect = (_x, _y, _w, _h, _fill, _border, _radius, click) => {
    if (click) actions.push(click);
    return { addComponent() {} };
  };
  const pet = { species: 'pangui', skillIds: ['armor'] };
  v.renderPetSkills(pet);
  assert.equal(actions.length, 1);
  assert.equal(labels.filter(s => s === '空').length, 7);
  assert.equal(labels.filter(s => s === '锁定').length, 4);
  actions[0]();
  assert.equal(v.skillOpen, 'armor');
  v.renderPetSkills(pet);
  assert.ok(labels.some(s => s.includes('天生技能')));
  actions.at(-1)();
  assert.equal(v.skillOpen, undefined);
  actions[0]();
  v.openPetPanel('pet-2');
  assert.equal(v.skillOpen, undefined);
  v.townSession = new SessionProgress(initialHero());
  v.drawPetPortrait = () => {};
  actions.length = 0;
  v.skillOpen = 'armor';
  v.renderPetSlots('pet');
  actions[1]();
  assert.equal(v.selectedPetId, 'pet-2');
  assert.equal(v.skillOpen, undefined);
});

test('pet and fusion slots show owned skill art and layer the innate and advanced marks', () => {
  const v = new BattleView(), drawn = [], labels = [];
  v.text = value => labels.push(value);
  v.rect = () => ({ addComponent() {} });
  v.button = () => {};
  v.drawPetPortrait = () => {};
  v.image = (_x, _y, _w, _h, frame) => drawn.push(frame);
  v.skillFrames = new Map(['armor', 'badge_innate', 'badge_advanced', 'frame_advanced'].map(id => [id, id]));
  const session = v.townSession = new SessionProgress(initialHero());
  const pet = { ...session.roster.entries[1], species: 'pangui', skillIds: ['armor'] };
  session.roster.entries[1] = pet;
  v.renderPetSkills(pet);
  assert.deepEqual(drawn, ['armor', 'badge_innate']);
  assert.equal(labels.filter(label => label === '空').length, 7);
  assert.equal(labels.filter(label => label === '锁定').length, 4);
  assert.ok(labels.includes('硬甲'));

  drawn.length = 0;
  v.fusionIds = [pet.id, ''];
  v.fusionArt = 'fuse-panel';
  const originalTier = PET_SKILLS.armor.tier;
  try {
    PET_SKILLS.armor.tier = 2;
    v.renderFusion();
    assert.deepEqual(drawn, ['fuse-panel', 'armor', 'frame_advanced', 'badge_innate', 'badge_advanced']);
  } finally {
    PET_SKILLS.armor.tier = originalTier;
  }
});

test('all books layer their own emblem on the cover and both bottles use one image', () => {
  const v = new BattleView(), drawn = [];
  v.text = () => {};
  v.rect = () => ({ addComponent() {} });
  v.button = () => {};
  v.image = (x, y, w, h, frame) => drawn.push({ x, y, w, h, frame });
  v.townSession = new SessionProgress(initialHero());
  const ids = Object.keys(PET_SKILLS), bottles = ['rejuvenation', 'mutation-rejuvenation'];
  v.townSession.inventory = Object.fromEntries([...ids.map(id => `book:${id}`), ...bottles].map(id => [id, 1]));
  v.bagFrames = new Map(['book', ...bottles].map(id => [id, id]));
  v.skillFrames = new Map(ids.map(id => [id, id]));
  v.renderInventory();
  assert.deepEqual(drawn.map(art => art.frame), [...ids.flatMap(id => ['book', id]), ...bottles]);
  for (let i = 0; i < ids.length; i++) {
    const [cover, emblem] = drawn.slice(i * 2, i * 2 + 2);
    assert.ok(emblem.w <= 26 && emblem.h <= 26);
    assert.ok(Math.abs(emblem.x + emblem.w / 2 - (cover.x + cover.w * 0.55)) < 1);
    assert.ok(Math.abs(emblem.y + emblem.h / 2 - (cover.y + cover.h * 0.44)) < 1);
  }
});

test('skill book view confirms on maps, cancels without work and guards stale callbacks and changed context', async () => {
  const { v, session, complete } = await roundTripView();
  v.mapBattle = false;
  const pet = session.roster.entries[0];
  pet.skillIds = ['crit']; session.inventory = { 'book:thunder': 3 };
  const labels = [], actions = new Map();
  v.text = text => labels.push(text);
  v.rect = () => ({ addComponent() {} });
  v.button = (text, _x, _y, _w, _h, enabled, callback) => {
    if (enabled) actions.set(text, callback);
    return { addComponent() {} };
  };
  const draw = () => { labels.length = 0; actions.clear(); v.renderInventory(); };
  const choose = () => { draw(); actions.get('使用')(); draw(); actions.get('1. 汀蛙')(); draw(); };
  let rolls = 0; v.bookRandom = () => { rolls++; return 0; };
  saveProgress(townDisk, session);
  const before = townDisk.raw, writes = townDisk.writes;
  v.openInventory(); draw();
  assert.ok(labels.includes('点击道具查看')); assert.equal(actions.has('使用'), false);
  v.inventoryItem = 'book:thunder'; choose();
  assert.ok(labels.some(s => s.includes('新增 100%') && s.includes('顶替 0%')));
  assert.ok(labels.includes('雷击术技能书 → 汀蛙'));
  assert.ok(labels.includes('新增技能放入首个空格。'));
  const cancelledCallback = actions.get('确认打书');
  actions.get('取消')(); cancelledCallback();
  assert.equal(townDisk.raw, before); assert.equal(townDisk.writes, writes); assert.equal(rolls, 0);
  choose();
  townDisk.fail = true; actions.get('确认打书')();
  assert.match(v.bookMessage, /write failed/); assert.equal(v.bookConfirmation, undefined);
  assert.equal(townDisk.raw, before); assert.deepEqual(pet.skillIds, ['crit']);
  assert.equal(session.inventory['book:thunder'], 3);
  townDisk.fail = false; choose();
  const confirm = actions.get('确认打书'); confirm(); confirm(); cancelledCallback();
  assert.equal(townDisk.writes, writes + 1); assert.equal(session.inventory['book:thunder'], 2);
  assert.deepEqual(pet.skillIds, ['crit', 'thunder']); assert.match(v.bookMessage, /新增雷击术/);
  choose(); assert.match(v.bookMessage, /已学/);
  assert.equal(rolls, 0); assert.equal(townDisk.writes, writes + 1);
  for (const region of ['town', 'outskirts']) {
    v.town.load(region); complete();
    if (!v.inventoryOpen) { v.openInventory(); v.inventoryItem = 'book:thunder'; }
    pet.skillIds = ['crit', 'armor']; choose();
    assert.ok(labels.some(s => s.includes('新增 60%') && s.includes('顶替 40%')));
    assert.ok(labels.includes('顶替时所有现有技能等概率参与，包括天生技能。'));
    const stale = actions.get('确认打书'); actions.get('取消')(); stale();
    pet.skillIds.push('power'); choose();
    assert.ok(labels.some(s => s.includes('新增 30%') && s.includes('顶替 70%')));
    actions.get('关闭')(); assert.equal(v.bookConfirmation, undefined);
  }
  v.openInventory(); v.inventoryItem = 'book:thunder'; choose();
  const changed = actions.get('确认打书'); v.mapBattle = true; changed();
  assert.match(v.bookMessage, /战斗/); draw(); assert.equal(actions.has('使用'), false);
  assert.equal(townDisk.writes, writes + 1); assert.equal(rolls, 0);
});

test('map deployment saves before changing selection; battle and pending settlement forbid switching', async () => {
  const { v, session, complete } = await roundTripView(), target = session.roster.entries[1];
  const buttons = new Map(), notices = [], portraits = [], clicks = [];
  window.alert = text => notices.push(text);
  v.button = (text, _x, _y, _w, _h, enabled, click) => { buttons.set(text, { enabled, click }); return { addComponent() {} }; };
  v.text = () => {}; v.rect = (_x, _y, _w, _h, _c, _b, _r, click) => { if (click) clicks.push(click); return { addComponent() {} }; };
  v.drawPetPortrait = () => {};
  const draw = () => { buttons.clear(); v.renderDeployButton(target); return buttons.get(session.selectedPetId === target.id ? '已出战' : '设为出战'); };
  assert.equal(draw().enabled, false);
  const battleCallback = draw().click, beforeBattle = townDisk.raw;
  battleCallback(); assert.equal(townDisk.raw, beforeBattle);
  v.battle.command('hero', 'capture', 'enemy-0'); v.battle.command('pet', 'defend');
  townDisk.fail = true; v.finishBattle();
  assert.equal(draw().enabled, false); battleCallback(); assert.equal(session.selectedPetId, 'pet');
  townDisk.fail = false; v.finishBattle();
  assert.equal(v.onMap, true);
  for (const region of ['town', 'outskirts']) {
    v.town.load(region); complete();
    v.renderPetSlots('pet'); clicks.at(-2)();
    assert.equal(v.selectedPetId, target.id); assert.equal(session.selectedPetId, 'pet');
    assert.equal(draw().enabled, true);
  }
  const before = townDisk.raw, writes = townDisk.writes, callback = draw().click;
  townDisk.fail = true; callback();
  assert.match(notices.at(-1), /保存失败/);
  assert.equal(townDisk.raw, before); assert.equal(session.selectedPetId, 'pet');
  townDisk.fail = false; callback(); callback();
  assert.equal(session.selectedPetId, target.id); assert.equal(townDisk.writes, writes + 1);
  assert.equal(buttons.has('已出战'), false); // Rendering is stubbed; explicitly redraw below.
  draw(); assert.equal(buttons.get('已出战').enabled, false);
  v.statusCard = (kind, _x, unit) => portraits.push([kind, unit.id]);
  v.renderTown(); assert.ok(portraits.some(([kind, id]) => kind === 'pet' && id === target.id));
  const restored = loadSessionProgress(townDisk);
  assert.equal(restored.selectedPetId, target.id);
  assert.deepEqual({ ...JSON.parse(townDisk.raw), selectedPetId: 'pet' }, JSON.parse(before));
  v.startFixedBattle(); assert.equal(v.battle.pets.find(pet => pet.deployed).id, target.id);
  assert.equal(draw().enabled, false);
});


test('rejuvenation UI covers maps, cancellation, failure, stale confirmation, selection and settlement guards', async () => {
  const { v, session, complete } = await roundTripView(), pet = session.roster.entries[1];
  v.mapBattle = false; session.inventory = { rejuvenation: 5, 'mutation-rejuvenation': 2 };
  const labels = [], actions = new Map();
  v.text = text => labels.push(text); v.rect = () => ({ addComponent() {} });
  v.button = (text, _x, _y, _w, _h, enabled, click) => { if (enabled) actions.set(text, click); return { addComponent() {} }; };
  const draw = () => { labels.length = 0; actions.clear(); v.renderInventory(); };
  const choose = (index = 1) => {
    draw(); actions.get('使用')(); draw(); actions.get(`${index + 1}. ${session.roster.entries[index].name}`)(); draw();
  };
  let rolls = 0; v.bookRandom = () => { rolls++; return 0; };
  saveProgress(townDisk, session);
  const before = townDisk.raw, writes = townDisk.writes;
  v.openInventory(); v.inventoryItem = 'rejuvenation'; choose(0);
  assert.match(v.bookMessage, /出战/);
  v.inventoryItem = 'mutation-rejuvenation'; choose();
  assert.match(v.bookMessage, /身份不匹配/);
  v.inventoryItem = 'rejuvenation'; choose();
  for (const field of ['还童露', '消耗 1 个', '等级', '经验', '潜能', '五项', '资质', '成长', '技能']) assert.ok(labels.some(t => t.includes(field)));
  const cancelled = actions.get('确认还童'); actions.get('取消')(); cancelled();
  assert.equal(townDisk.raw, before); assert.equal(townDisk.writes, writes); assert.equal(rolls, 0);
  choose(); townDisk.fail = true; actions.get('确认还童')();
  assert.match(v.bookMessage, /还童失败.*write failed/); assert.equal(townDisk.raw, before);
  assert.equal(session.inventory.rejuvenation, 5); assert.equal(pet.isBaby, false);
  townDisk.fail = false;
  for (const region of ['town', 'outskirts']) {
    v.town.load(region); complete(); choose();
    const confirm = actions.get('确认还童'), count = session.inventory.rejuvenation;
    confirm(); const usedRolls = rolls; confirm(); cancelled();
    assert.equal(rolls, usedRolls); assert.equal(session.inventory.rejuvenation, count - 1);
    assert.match(v.bookMessage, /还童成功/); assert.equal(pet.level, 0); assert.equal(pet.isBaby, true);
    assert.equal(loadSessionProgress(townDisk).roster.entries[1].level, 0);
  }
  const saved = townDisk.raw, savedWrites = townDisk.writes;
  choose(); const switched = actions.get('确认还童');
  session.selectedPetId = pet.id; const usedRolls = rolls; switched();
  assert.match(v.bookMessage, /出战/); assert.equal(rolls, usedRolls); session.selectedPetId = 'pet';
  choose(); const closed = actions.get('确认还童');
  actions.get('关闭')(); closed(); assert.equal(townDisk.raw, saved);
  v.openInventory(); v.inventoryItem = 'rejuvenation'; choose();
  const stale = actions.get('确认还童'); v.mapBattle = true; stale();
  assert.match(v.bookMessage, /战斗/); draw(); assert.equal(actions.has('使用'), false);
  v.battle.command('hero', 'capture', 'enemy-0'); v.battle.command('pet', 'defend');
  townDisk.fail = true; v.finishBattle(); draw();
  assert.equal(actions.has('使用'), false); stale();
  assert.equal(townDisk.raw, saved); assert.equal(townDisk.writes, savedWrites); assert.equal(rolls, usedRolls);
  townDisk.fail = false; v.mapBattle = false; session.inventory = { rejuvenation: 1 };
  v.openInventory(); v.inventoryItem = 'rejuvenation'; choose();
  actions.get('确认还童')(); draw();
  assert.equal(session.inventory.rejuvenation, 0);
  assert.ok(labels.includes('点击道具查看')); assert.equal(actions.has('使用'), false);
});


test('fusion city and field UI blocks movement, cancels, retries without reroll and opens result', async () => {
  const { v, session, complete } = await roundTripView();
  const { petCombat } = await import('../assets/battle/logic/pet-panel.ts');
  v.mapBattle = false; const a = session.roster.entries[1], b = { ...a, id: 'caught-1', origin: 'captured' };
  for (const pet of [a, b]) {
    Object.assign(pet, { level: 10, isBaby: true, potential: 50,
      baseStats: { constitution: 20, mana: 20, strength: 20, endurance: 20, agility: 20 } });
    Object.assign(pet, petCombat(pet));
  }
  session.roster.entries.push(b); saveProgress(townDisk, session);
  const labels = [], actions = new Map(); v.drawPetPortrait = () => {};
  v.text = text => labels.push(text); v.rect = () => ({ addComponent() {} });
  v.button = (text, _x, _y, _w, _h, enabled, click) => { if (enabled) actions.set(text, click); return { addComponent() {} }; };
  const draw = () => { labels.length = 0; actions.clear(); v.renderFusion(); };
  let rolls = 0; v.fusionRandom = () => { rolls++; return 0; };
  for (const region of ['town', 'outskirts']) {
    v.town.load(region); complete();
    const start = v.town.movement.position;
    assert.equal(v.town.movement.select({ x: start.x + 20, y: start.y }), true);
    assert.ok(v.town.movement.target); v.openFusion(); assert.equal(v.mapBlocked, true);
    assert.equal(v.town.movement.target, undefined); v.fusionIds = [a.id, b.id]; draw();
    assert.ok(labels.some(t => t.includes('90%'))); assert.ok(labels.some(t => t.includes('40%')));
    const before = townDisk.raw, writes = townDisk.writes;
    actions.get('合宠')(); draw(); assert.ok(labels.some(t => t.includes('两只原宠将消失')));
    const cancelled = actions.get('确认合宠'); actions.get('取消')(); cancelled();
    assert.equal(townDisk.raw, before); assert.equal(townDisk.writes, writes); assert.equal(rolls, 0);
    actions.get('关闭')(); assert.equal(v.fusionOpen, false);
  }
  v.openFusion(); v.fusionIds = [a.id, b.id]; draw(); actions.get('合宠')(); draw();
  townDisk.fail = true; const failed = actions.get('确认合宠'); failed(); const used = rolls;
  assert.match(v.fusionMessage, /write failed/); assert.equal(session.roster.entries.length, 3);
  failed(); assert.equal(rolls, used); townDisk.fail = false;
  draw(); actions.get('合宠')(); draw(); const confirm = actions.get('确认合宠'); confirm(); confirm();
  assert.equal(rolls, used); assert.equal(session.roster.entries.length, 2); assert.equal(v.selectedPetId, 'fused-1');
  assert.equal(v.fusionOpen, false); assert.equal(v.rosterOpen, true); assert.equal(v.isPet({ id: 'fused-1' }), true);
  assert.equal(loadSessionProgress(townDisk).roster.nextFusedId, 2);
  v.rosterOpen = false; v.mapBattle = true; v.openFusion(); assert.equal(v.fusionOpen, false);
  v.battle.phase = 'ended'; v.resultSaved = false; v.openFusion(); assert.equal(v.fusionOpen, false);
});
