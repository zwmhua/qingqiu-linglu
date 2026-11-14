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
