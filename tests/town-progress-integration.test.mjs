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
globalThis.window = { location: { search: '?townPreview=1' }, URLSearchParams };
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
  addChild(node) { this.children.push(node); }
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
  destroy() { this.destroyed = true; }
}
export const game = {
  on(_event, callback) { globalThis.townHide = callback; },
  off() { globalThis.townHide = undefined; },
}, Game = { EVENT_HIDE: 'hide' };
export const assetManager = { loadBundle(name, cb) {
  globalThis.loadedBundle = name; globalThis.townLoad = cb;
  (globalThis.bundleLoads ??= {})[name] = cb;
} };
export class Vec3 { constructor(x, y) { this.x = x; this.y = y; } }
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
      source: url === 'mock:cc' ? cc : 'export const PREVIEW = true, WECHAT = false;' };
    if (/\/(BattleView|TownView)\.ts$/.test(url)) return { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, experimentalDecorators: true,
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

test('town and outskirts share looping run frames, a fixed foot anchor and the same stop behavior', () => {
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
  map.handlers.start(touch(1, 800));
  map.handlers.start(touch(2, 850));
  map.handlers.end(touch(2, 850));
  assert.equal(view.movement.target, undefined);
  map.handlers.end(touch(1, 800));
  assert.deepEqual(view.movement.target, { x: 800, y: 500 });
  assert.equal(view.ripple.active, true);
  view.update(0.5);
  assert.equal(view.ripple.active, false);
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
  assert.deepEqual(buttons, [['人物', true], ['宠物', true], ['背包·未开放', false], ['合宠·未开放', false], ['出城', true]]);
  assert.deepEqual(portraits, [['pet', 906, session.selectedPetId], ['hero', 1102, 'hero']]);
  assert.ok(view.movement.select({ x: 800, y: 500 }));
  let activate;
  view.draw = (_hero, _blocked, onPlace) => { activate = onPlace; };
  v.renderTown();
  for (const place of TOWN_PLACES.filter(p => ['bag', 'fuse', 'notice'].includes(p.id))) {
    activate(place);
    assert.equal(view.message, `${place.name}·未开放`);
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

test('the ordinary entry still creates a battle from the saved session', () => {
  window.location.search = '';
  const v = new BattleView();
  v.render = () => {};
  v.start();
  assert.ok(v.battle.enemies.length > 0);
  assert.equal(v.town, undefined);
  assert.equal(v.battle.session.selectedPetId, loadSessionProgress(townDisk).selectedPetId);
});
