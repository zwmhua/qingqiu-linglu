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
export class Node { static EventType = {}; children = []; addComponent() { return { setContentSize() {} }; } }
export const game = { on() {}, off() {} }, Game = { EVENT_HIDE: 'hide' };
export const assetManager = { loadBundle(_name, cb) { globalThis.townLoad = cb; } };
export class Vec3 {}
export class Color {}
export class SpriteFrame {}
export const BlockInputEvents = 0, EventTouch = 0, Graphics = 0, Label = 0, Mask = 0,
RichText = 0, Sprite = 0, tween = 0, Tween = 0, UIOpacity = 0, UITransform = 0;`;
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
const { SessionProgress } = await import('../assets/battle/logic/session-progress.ts');
const { initialHero, awardExperience, adjustPotential } = await import('../assets/battle/logic/hero-progress.ts');
const { petProgress } = await import('../assets/battle/logic/roster.ts');
const { loadSessionProgress, saveProgress } = await import('../assets/battle/logic/local-progress.ts');

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
  v.town.movement.select({ x: 850, y: 500 });
  v.stopPotentialRepeat({ type: 'blur' });
  assert.equal(v.town.movement.target, undefined);
  v.town.movement.select({ x: 850, y: 500 });
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
