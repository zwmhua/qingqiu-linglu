import { FUSION, fusionPlan } from '../logic/pet-fusion';
import { assetManager, game, Game, _decorator, BlockInputEvents, Color, Component, EventTouch, Graphics, Label, Mask, Node, ResolutionPolicy, RichText, ScrollView, Sprite, SpriteFrame, sys, tween, Tween, UIOpacity, UITransform, Vec2, Vec3, view } from 'cc';
import { TownView } from './TownView';
import { AttackEvent, Battle, BattleEvent, SpellEvent, Unit } from './Battle';
import { COMMAND_ICON_SIZE, COMMAND_LAYOUT, CONFIG, SPELL_TINTS } from './config';
import { BATTLE_RULES } from '../logic/battle-rules';
import { targetCommand, toggleTarget } from '../logic/targeting';
import { AutoCommands } from '../logic/auto';
import { PREVIEW, WECHAT } from 'cc/env';
import { APTITUDE_KEYS, aptitudeBarRatio } from '../logic/aptitude';
import { WILD_SPECIES } from '../logic/wild-encounter';
import { BASE_STAT_KEYS } from '../logic/base-stats';
import { petTint } from '../logic/pet-visual';
import type { CarriedPet } from '../logic/roster';
import { SessionProgress } from '../logic/session-progress';
import { petProgress } from '../logic/roster';
import { effectivePetPanel as petPanel, petPanelPreview } from '../logic/pet-panel';
import type { HeroProgress, LevelProgress } from '../logic/hero-progress';
import { HERO_PROGRESSION, adjustPotential, heroPanel, heroPanelPreview, initialHero, levelUpExp } from '../logic/hero-progress';
import { HoldRepeat } from '../logic/hold-repeat';
import { browserParams, progressIO, wechatStorage } from '../../logic/platform';
import { ProgressLoader, progressSnapshot, resetProgress, saveProgress } from '../logic/local-progress';
import { activeSpells, PET_SKILLS, SKILL_POOLS, skillDescription } from '../logic/pet-skills';
import type { TargetMode } from '../logic/targeting';
import { addInventory, ITEMS, rollDrops, type Inventory } from '../logic/inventory';

type SpellFxEvent = Pick<SpellEvent, 'kind' | 'actorId' | 'logIndex'> & Partial<Pick<SpellEvent, 'skillId' | 'manaAfter'>> & {
  targets: readonly { targetId: string; damage: number; hpAfter: number; missed?: boolean }[];
};
type ViewBattleEvent = BattleEvent | SpellFxEvent | { kind: 'dodge'; targetId: string; logIndex: number };

type PhysicalEvent = Extract<BattleEvent, { kind: 'attack' | 'heal' }>;

const { ccclass, property } = _decorator;
const POTENTIAL_RELEASE_EVENTS = ['pointerup', 'pointercancel', 'pointerout', 'mouseup', 'touchend', 'touchcancel', 'blur'] as const;
const C = (hex: string) => new Color(hex);
const COMMAND_NAMES = ['攻击', '防御', '保护', '召唤', '抓取', '道具', '逃跑', '灵术', '撤退'] as const;
const BAG_ART = {
  book: 'item_skillbook', rejuvenation: 'item_rebirth_dew', 'mutation-rejuvenation': 'item_rebirth_dew_mutant',
} as const;
declare const wx: Parameters<typeof wechatStorage>[0] & {
  showModal(options: { content: string; showCancel: boolean; success?: (result: { confirm: boolean }) => void;
    complete?: () => void }): void;
  onTouchEnd(callback: () => void): void;
  offTouchEnd(callback: () => void): void;
  onTouchCancel(callback: () => void): void;
  offTouchCancel(callback: () => void): void;
  onHide(callback: () => void): void;
  offHide(callback: () => void): void;
};
const browserWindow = () => sys.isBrowser && typeof window !== 'undefined' ? window : undefined;
const queryParams = () => browserParams(sys.isBrowser, typeof window === 'undefined' ? undefined : window);
const progressStorage = () => WECHAT ? wechatStorage(wx) : browserWindow()?.localStorage ?? sys.localStorage;
const showNotice = (content: string) => {
  if (WECHAT) wx.showModal({ content, showCancel: false });
  else browserWindow()?.alert?.(content);
};

@ccclass('BattleView')
export class BattleView extends Component {
  @property(SpriteFrame) battleBackground: SpriteFrame | null = null;
  @property(SpriteFrame) heroArt: SpriteFrame | null = null;
  @property(SpriteFrame) characterBasicArt: SpriteFrame | null = null;
  @property(SpriteFrame) characterPointsArt: SpriteFrame | null = null;
  @property(SpriteFrame) petBasicArt: SpriteFrame | null = null;
  @property(SpriteFrame) petAptitudeArt: SpriteFrame | null = null;
  @property(SpriteFrame) petPointsArt: SpriteFrame | null = null;
  @property(SpriteFrame) frogArt: SpriteFrame | null = null;
  @property(SpriteFrame) panguiArt: SpriteFrame | null = null;
  @property(SpriteFrame) maomaochongArt: SpriteFrame | null = null;
  @property(SpriteFrame) jadeNormal: SpriteFrame | null = null;
  @property(SpriteFrame) jadePressed: SpriteFrame | null = null;
  @property(SpriteFrame) jadeDisabled: SpriteFrame | null = null;
  @property([SpriteFrame]) commandIcons: SpriteFrame[] = [];
  @property(SpriteFrame) iconAuto: SpriteFrame | null = null;
  @property(SpriteFrame) iconAutoCancel: SpriteFrame | null = null;
  private battle!: Battle;
  private town?: TownView;
  private townSession?: SessionProgress;
  private devPreview = PREVIEW && queryParams().get('devPreview') === '1';
  private townPreview = !(this.devPreview && queryParams().get('battlePreview') === '1');
  private mapBattle = false;
  private returningTown = false;
  private returnPoint?: { x: number; y: number };
  private resultCandidate?: string;
  private resultDrops?: Inventory;
  private dropRandom = Math.random;
  private fusionOpen = false;
  private fusionIds = ['', ''];
  private fusionRandom = Math.random;
  private fusionMessage = '';
  private fusionConfirmation?: ReturnType<SessionProgress['prepareFusion']>;
  private inventoryOpen = false;
  private inventoryItem?: string;
  private inventoryPet?: string;
  private inventoryChoosingPet = false;
  private inventoryScrollY = 0;
  private bagFrames = new Map<string, SpriteFrame>();
  private bagArtLoading = false;
  private bagArtFailed = false;
  private bookRandom = Math.random;
  private bookMessage = '';
  private bookConfirmation?: { transaction: ReturnType<SessionProgress['prepareSkillBook']>
    | ReturnType<SessionProgress['prepareRejuvenation']>; caption: string; action?: string };
  private resultSaved = false;
  private returnMessage = '';
  private postBattle?: { result: Battle['result']; position: { x: number; y: number } };
  private get onMap(): boolean { return this.townPreview && !this.mapBattle; }
  private get resultTitle(): string {
    return this.battle.result === 'escaped' ? '整队逃离' : this.battle.result === 'victory' ? '战斗胜利' : '战斗失败';
  }
  private get progress(): SessionProgress { return this.townSession ?? this.battle.session; }
  private get inBattle(): boolean { return !this.onMap && (this.battle.phase !== 'ended' || !this.resultSaved); }
  private stopTown = (): void => { this.town?.stop(); };
  private mapHidden = false;
  private hideMap = (): void => { this.mapHidden = true; this.stopTown(); };
  private showMap = (): void => { this.mapHidden = false; };
  private confirmHeroPoints(draft: HeroProgress): boolean {
    if (this.inBattle) return false;
    const persist = (next: HeroProgress) => saveProgress(progressStorage(), this.progress, next);
    return this.onMap ? this.progress.confirmHeroAllocation(false, draft, persist) : this.battle.confirmHeroAllocation(draft, persist);
  }
  private confirmPetPoints(id: string, draft: LevelProgress): boolean {
    if (this.inBattle) return false;
    const persist = (next: CarriedPet) => saveProgress(progressStorage(), this.progress, undefined, next);
    return this.onMap ? this.progress.confirmPetAllocation(false, id, draft, persist) : this.battle.confirmPetAllocation(id, draft, persist);
  }
  private releaseProgressPet(id: string): boolean {
    if (this.inBattle) return false;
    const persist = (pets: CarriedPet[]) => saveProgress(progressStorage(), this.progress, undefined, undefined, pets);
    return this.onMap ? this.progress.releasePet(false, id, persist) : this.battle.releasePet(id, persist);
  }
  private progressError = '';
  private progressReadFailed = false;
  private readonly progressLoader = new ProgressLoader();
  private skillOpen?: string;
  private layoutTest = this.devPreview && queryParams().get('layout') === '10v10';
  private choosingTarget: TargetMode | null = null;
  private spellOpen = false;
  private spellId?: string;
  private lastShownSecond = -1;
  private layer!: Node;
  private markerLayer!: Node;
  private unitLayer!: Node;
  private unitNodes = new Map<string, Node>();
  private shadowNodes = new Map<string, Node>();
  private markerNodes = new Map<string, Node>();
  private statusHpBars = new Map<string, (hp: number) => void>();
  private statusManaBars = new Map<string, (mana: number) => void>();
  private markerHpBars = new Map<string, (hp: number) => void>();
  private basePositions = new Map<string, Vec3>();
  private ringOpacities = new Map<string, UIOpacity>();
  private confirmingTarget = false;
  private confirmingReset = false;
  private displayedHp: Map<string, number> | null = null;
  private displayedMana: Map<string, number> | null = null;
  private animationQueue: ViewBattleEvent[] = [];
  private displayedLogEnd?: number;
  private displayedDeployment: Map<string, boolean> | null = null;
  private displayedLeft: Map<string, boolean> | null = null;
  private summonOpen = false;
  private rosterOpen = false;
  private selectedPetId: string | null = null;
  private releasePrompt?: CarriedPet;
  private detailsOpen: 'hero' | null = null;
  private heroPanelPage: 'basic' | 'advanced' | 'points' = 'basic';
  private petPanelPage: 'basic' | 'aptitude' | 'points' = 'basic';
  private petReturnPage: 'basic' | 'aptitude' = 'basic';
  private allocationPreview?: LevelProgress;
  private readonly potentialRepeat = new HoldRepeat();
  private stopPotentialRepeat = (event?: Event): void => {
    if (event?.type === 'pointerout' && (event as PointerEvent).relatedTarget) return;
    if (event?.type === 'blur') this.stopTown();
    this.potentialRepeat.stop();
  };
  private playing = false;
  private idleTime = 0;
  private speedMultiplier = 1;
  private auto = new AutoCommands();

  private get usesTestProgress(): boolean {
    const params = queryParams();
    return this.townPreview || !this.layoutTest && !(this.devPreview && (params.get('mutationSample') === '1' || params.get('babySample') === '1'));
  }

  private createBattle(previous?: SessionProgress, rage = 0): Battle {
    const session = previous ?? new SessionProgress(initialHero());
    const params = queryParams();
    if (PREVIEW && params.get('mutationSample') === '1' && this.devPreview)
      return new Battle(previous ? () => 0.9 : () => 0, 1, rage, session, () => 0,
        Math.random, Math.random, Math.random, () => 0);
    if (PREVIEW && params.get('babySample') === '1' && this.devPreview)
      return new Battle(() => 0, 1, rage, session, () => 0, Math.random, Math.random, Math.random, () => 1);
    return new Battle(Math.random, undefined, rage, session);
  }

  onEnable(): void {
    this.showMap();
    game.on(Game.EVENT_HIDE, this.hideMap);
    game.on(Game.EVENT_SHOW, this.showMap);
    // The canvas survives the redraw that replaces the pressed button.
    if (WECHAT) {
      wx.onTouchEnd(this.stopPotentialRepeat);
      wx.onTouchCancel(this.stopPotentialRepeat);
      wx.onHide(this.stopPotentialRepeat);
    } else for (const event of POTENTIAL_RELEASE_EVENTS)
      browserWindow()?.addEventListener?.(event, this.stopPotentialRepeat, true);
  }

  onDisable(): void {
    game.off(Game.EVENT_HIDE, this.hideMap);
    game.off(Game.EVENT_SHOW, this.showMap);
    this.stopTown();
    if (WECHAT) {
      wx.offTouchEnd(this.stopPotentialRepeat);
      wx.offTouchCancel(this.stopPotentialRepeat);
      wx.offHide(this.stopPotentialRepeat);
    } else for (const event of POTENTIAL_RELEASE_EVENTS)
      browserWindow()?.removeEventListener?.(event, this.stopPotentialRepeat, true);
    this.stopPotentialRepeat();
  }

  onDestroy(): void { this.town?.dispose(); }

  start(): void {
    let saved: SessionProgress | null = null;
    this.progressReadFailed = false;
    this.progressError = '';
    if (this.usesTestProgress) {
      try { saved = this.progressLoader.load(progressStorage()); }
      catch (error) {
        this.progressReadFailed = true;
        this.progressError = `本地进度读取失败，原档已保留：${error instanceof Error ? error.message : String(error)}`;
        this.townPreview = true;
      }
    }
    if (this.townPreview) {
      this.townSession = saved ?? (this.progressReadFailed ? undefined : new SessionProgress(initialHero()));
      if (this.townSession && !saved) {
        this.persistProgress();
        if (this.progressError) { this.townSession = undefined; this.progressReadFailed = true; }
      }
      view.setDesignResolutionSize(CONFIG.width, CONFIG.height, ResolutionPolicy.SHOW_ALL);
      this.town = new TownView(this.node, () => {
        if (this.town?.region === 'town' && !this.town.loading) this.returningTown = false;
        this.render();
      }, () => this.startFixedBattle());
      if (this.devPreview && queryParams().get('encounterSample') === '1') this.town.encounterRandom = () => 0;
      this.town.load();
      this.render();
      return;
    }
    this.battle = this.createBattle(saved ?? undefined);
    if (!saved) this.persistProgress();
    view.setDesignResolutionSize(CONFIG.width, CONFIG.height, WECHAT ? ResolutionPolicy.SHOW_ALL : ResolutionPolicy.FIXED_WIDTH);
    this.render();
  }

  private persistProgress(): void {
    if (!this.usesTestProgress || this.progressReadFailed) return;
    try {
      saveProgress(progressStorage(), this.progress);
      this.progressError = '';
    } catch {
      this.progressError = '本地进度保存失败。';
    }
  }

  private retryProgress(): void {
    this.town?.dispose();
    this.town = undefined;
    this.start();
  }

  private get canResetProgress(): boolean {
    return this.devPreview && !this.mapBattle && (this.progressReadFailed || this.battle?.phase !== 'ended' || this.resultSaved);
  }
  private resetTestProgress(): void {
    if (!this.canResetProgress) return;
    if (this.confirmingTarget || this.confirmingReset) return;
    const content = '清除本游戏的测试进度并重新开始？';
    if (WECHAT) {
      this.confirmingReset = true;
      wx.showModal({ content, showCancel: true,
        success: ({ confirm }) => { if (confirm) this.clearTestProgress(); },
        complete: () => { this.confirmingReset = false; } });
    } else if (browserWindow()?.confirm?.(content)) this.clearTestProgress();
  }

  private clearTestProgress(): void {
    try { resetProgress(progressStorage(), true); }
    catch {
      this.progressError = '本地进度重置失败。';
      this.render();
      return;
    }
    this.progressReadFailed = false;
    this.auto = new AutoCommands();
    this.restartBattle(this.createBattle());
    this.persistProgress();
    this.render();
  }

  update(dt: number): void {
    if (this.onMap) {
      if (this.mapBlocked) this.stopTown();
      else this.town?.update(dt);
      return;
    }
    this.idleTime += dt;
    if (this.layoutTest) return;
    if (this.playing) { this.syncMovingUnits(); return; }
    if (this.battle.phase === 'ended') return;
    if (this.confirmingTarget || this.confirmingReset || this.rosterOpen) return;
    if (this.auto.enabled && this.battle.pending.length) { this.runAuto(); return; }
    const before = this.battle.round;
    const phase = this.battle.phase;
    const hp = this.captureHp();
    const deployment = this.captureDeployment();
    this.battle.tick(dt);
    if (this.startPlayback(before, phase, hp, deployment)) return;
    const second = Math.ceil(this.battle.seconds);
    if (second !== this.lastShownSecond || before !== this.battle.round) this.render();
  }

  private pos(node: Node, x: number, y: number): void {
    node.setPosition(x - CONFIG.width / 2, CONFIG.height / 2 - y, 0);
  }

  private unitColor(unit: Pick<Unit, 'isMutated'>): Color {
    return C(petTint(unit.isMutated, CONFIG.visual.petTint));
  }

  private rect(x: number, y: number, w: number, h: number, fill: string,
    border = '', radius = 0, onClick?: () => void, alpha = 255): Node {
    const node = new Node('shape');
    this.layer.addChild(node);
    this.pos(node, x + w / 2, y + h / 2);
    node.addComponent(UITransform).setContentSize(w, h);
    const g = node.addComponent(Graphics);
    const fillColor = C(fill);
    fillColor.a = alpha;
    g.fillColor = fillColor;
    if (radius) g.roundRect(-w / 2, -h / 2, w, h, radius);
    else g.rect(-w / 2, -h / 2, w, h);
    g.fill();
    if (border) {
      g.strokeColor = C(border);
      g.lineWidth = 2;
      if (radius) g.roundRect(-w / 2, -h / 2, w, h, radius);
      else g.rect(-w / 2, -h / 2, w, h);
      g.stroke();
    }
    if (onClick) node.on(Node.EventType.TOUCH_END, (_: EventTouch) => onClick());
    return node;
  }

  private text(value: string, x: number, y: number, size: number, color = '#f6f0dc',
    width = 400, align: 0 | 1 | 2 = 0, onClick?: () => void): Node {
    const node = new Node('text');
    this.layer.addChild(node);
    this.pos(node, x + width / 2, y + size * 0.8);
    node.addComponent(UITransform).setContentSize(width, size * 1.7);
    const label = node.addComponent(Label);
    label.string = value;
    label.fontSize = size;
    label.lineHeight = size * 1.35;
    label.color = C(color);
    label.horizontalAlign = align;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.CLAMP;
    if (onClick) node.on(Node.EventType.TOUCH_END, (_: EventTouch) => onClick());
    return node;
  }

  private ellipse(x: number, y: number, rx: number, ry: number, fill: string, alpha = 255): void {
    const node = new Node('ellipse');
    this.layer.addChild(node);
    this.pos(node, x, y);
    const g = node.addComponent(Graphics);
    const color = C(fill);
    color.a = alpha;
    g.fillColor = color;
    g.ellipse(0, 0, rx, ry);
    g.fill();
  }

  private selectionRing(x: number, y: number, color: string): UIOpacity {
    const ring = new Node('selection-ring');
    this.layer.addChild(ring);
    this.pos(ring, x, y);
    const graphic = ring.addComponent(Graphics);
    graphic.strokeColor = C(color);
    graphic.lineWidth = 5;
    graphic.ellipse(0, 0, 64, 20);
    graphic.stroke();
    const opacity = ring.addComponent(UIOpacity);
    opacity.opacity = CONFIG.visual.ringOpacityMin;
    tween(opacity).repeatForever(tween<UIOpacity>()
      .to(CONFIG.visual.ringBreathSeconds, { opacity: CONFIG.visual.ringOpacityMax })
      .to(CONFIG.visual.ringBreathSeconds, { opacity: CONFIG.visual.ringOpacityMin })).start();
    return opacity;
  }

  private image(x: number, y: number, w: number, h: number, frame: SpriteFrame | null,
    sliced = false): { node: Node; sprite: Sprite } {
    if (!frame) throw new Error('BattleView 缺少美术 SpriteFrame 引用');
    const node = new Node('art');
    this.layer.addChild(node);
    this.pos(node, x + w / 2, y + h / 2);
    node.addComponent(UITransform).setContentSize(w, h);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
    sprite.spriteFrame = frame;
    return { node, sprite };
  }

  private button(label: string, x: number, y: number, w: number, h: number,
    enabled: boolean, onClick?: () => void): Node {
    const { node, sprite } = this.image(x, y, w, h, enabled ? this.jadeNormal : this.jadeDisabled, true);
    const title = new Node('button-label');
    node.addChild(title);
    title.addComponent(UITransform).setContentSize(w, h);
    const text = title.addComponent(Label);
    text.string = label;
    text.fontSize = 26;
    text.isBold = true;
    text.enableOutline = true;
    text.outlineColor = C('#F7F1D8');
    text.outlineWidth = 2;
    text.color = C(enabled ? '#1F3A33' : '#6B6B6B');
    text.horizontalAlign = Label.HorizontalAlign.CENTER;
    text.verticalAlign = Label.VerticalAlign.CENTER;
    if (enabled && onClick) {
      node.on(Node.EventType.TOUCH_START, () => { sprite.spriteFrame = this.jadePressed; });
      node.on(Node.EventType.TOUCH_CANCEL, () => { sprite.spriteFrame = this.jadeNormal; });
      node.on(Node.EventType.TOUCH_END, () => {
        sprite.spriteFrame = this.jadeNormal;
        onClick();
      });
    }
    return node;
  }

  private commandButton(label: string, x: number, y: number, enabled: boolean, onClick?: () => void): void {
    const frame = this.commandIcons[COMMAND_NAMES.indexOf(label as typeof COMMAND_NAMES[number])];
    const { node, sprite } = this.image(x, y, COMMAND_ICON_SIZE, COMMAND_ICON_SIZE, frame);
    sprite.grayscale = !enabled;
    const title = this.text(label, x, y + COMMAND_ICON_SIZE, 17, '#F6E5C0', COMMAND_ICON_SIZE, 1);
    const titleLabel = title.getComponent(Label)!;
    titleLabel.enableOutline = true;
    titleLabel.outlineColor = C('#1A2826');
    titleLabel.outlineWidth = 2;
    const hit = new Node(`command-${label}`);
    this.layer.addChild(hit);
    this.pos(hit, x + COMMAND_ICON_SIZE / 2, y + COMMAND_ICON_SIZE / 2);
    hit.addComponent(UITransform).setContentSize(COMMAND_ICON_SIZE, COMMAND_ICON_SIZE);
    if (enabled && onClick) {
      hit.on(Node.EventType.TOUCH_START, () => node.setScale(0.94, 0.94, 1));
      hit.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
      hit.on(Node.EventType.TOUCH_END, () => {
        node.setScale(1, 1, 1);
        if (!this.playing) onClick();
      });
    }
  }

  private autoButton(): void {
    const { x, y } = COMMAND_LAYOUT['自动'];
    const { sprite } = this.image(x, y, COMMAND_ICON_SIZE, COMMAND_ICON_SIZE, this.iconAuto);
    const titleNode = this.text('自动', x, y + COMMAND_ICON_SIZE, 17, '#F6E5C0', COMMAND_ICON_SIZE, 1);
    const title = titleNode.getComponent(Label)!;
    title.enableOutline = true;
    title.outlineColor = C('#1A2826');
    title.outlineWidth = 2;
    const paint = () => {
      sprite.spriteFrame = this.auto.enabled ? this.iconAutoCancel : this.iconAuto;
      title.string = this.auto.enabled ? '取消' : '自动';
    };
    const click = () => {
      if (this.confirmingTarget || (this.playing && !this.auto.enabled)) return;
      this.auto.toggle();
      this.choosingTarget = null;
      this.spellOpen = false;
      this.summonOpen = false;
      this.rosterOpen = false;
      paint();
      if (this.auto.enabled) this.runAuto();
    };
    const hit = new Node('command-auto');
    this.layer.addChild(hit);
    this.pos(hit, x + COMMAND_ICON_SIZE / 2, y + COMMAND_ICON_SIZE / 2);
    hit.addComponent(UITransform).setContentSize(COMMAND_ICON_SIZE, COMMAND_ICON_SIZE);
    hit.on(Node.EventType.TOUCH_END, click);
    titleNode.on(Node.EventType.TOUCH_END, click);
    paint();
  }

  private runAuto(): void {
    if (!this.auto.enabled || this.playing || this.confirmingTarget || this.battle.phase !== 'command') return;
    const before = this.battle.round;
    const phase = this.battle.phase;
    const hp = this.captureHp();
    const deployment = this.captureDeployment();
    this.auto.issue(this.battle);
    if (this.startPlayback(before, phase, hp, deployment)) return;
    this.render();
  }

  private unitPoint(unit: Unit): { x: number; y: number } {
    if (unit.side === 'enemy') return CONFIG.positions.enemy[unit.slot];
    const group = CONFIG.positions.allyGroups[Math.floor(unit.slot / 2)];
    return unit.slot % 2 === 0 ? group.pet : group.hero;
  }

  private isHero(unit: Unit): boolean { return unit.id === 'hero' || unit.id.startsWith('layout-hero-'); }
  private isPet(unit: Unit): boolean { return unit.id.startsWith('pet') || unit.id.startsWith('caught-') || unit.id.startsWith('fused-') || unit.id.startsWith('layout-pet-'); }

  private layoutUnits(): Unit[] {
    const enemy = this.battle.enemies[0];
    const hero = this.battle.allies[0];
    const pet = this.battle.pets[0];
    return [
      ...CONFIG.positions.enemy.map((_, slot) => ({ ...enemy,
        id: `layout-enemy-${slot}`, slot, hp: enemy.maxHp, left: false, deployed: true })),
      ...CONFIG.positions.allyGroups.flatMap((_, index) => [
        { ...pet, id: `layout-pet-${index}`, slot: index * 2,
          hp: pet.maxHp, left: false, deployed: true },
        { ...hero, id: `layout-hero-${index}`, slot: index * 2 + 1,
          hp: hero.maxHp, left: false, deployed: true },
      ]),
    ];
  }

  private canSelect(unit: Unit): boolean {
    if (this.playing || this.layoutTest || this.summonOpen || this.rosterOpen) return false;
    const actor = this.battle.pending[0];
    if (!actor || unit.hp === 0 || unit.left) return false;
    if (this.choosingTarget === 'protect') return this.battle.protectTargets(actor.id).some(u => u.id === unit.id);
    return unit.side === 'enemy';
  }

  private unitShadow(unit: Unit): void {
    if ((this.displayedLeft?.get(unit.id) ?? unit.left) || (this.displayedHp?.get(unit.id) ?? unit.hp) === 0) return;
    const previous = this.layer;
    const group = new Node(`shadow-${unit.id}`);
    previous.addChild(group);
    this.shadowNodes.set(unit.id, group);
    this.layer = group;
    const point = this.unitPoint(unit);
    this.ellipse(point.x, point.y + 4, 55, 15, '#17241d', 105);
    if (!this.playing && !this.choosingTarget && this.battle.pending[0]?.id === unit.id) {
      this.ringOpacities.set(unit.id, this.selectionRing(point.x, point.y + 4, '#F1D788'));
    } else if (!this.playing && this.canSelect(unit)) {
      const color = this.choosingTarget === 'capture' ? '#E5C46C'
        : this.choosingTarget === 'protect' ? '#73B9C6'
          : this.choosingTarget === 'attack' ? '#D9514A' : '#C97D7B';
      this.ringOpacities.set(unit.id, this.selectionRing(point.x, point.y + 4, color));
    }
    this.layer = previous;
  }

  private petArt({ species }: Pick<Unit, 'species'>): SpriteFrame | null {
    if (species === 'pangui') return this.panguiArt;
    if (species === 'maomaochong') return this.maomaochongArt;
    return this.frogArt;
  }

  private unitVisual(unit: Unit): void {
    if (this.displayedLeft?.get(unit.id) ?? unit.left) return;
    const point = this.unitPoint(unit);
    const dead = (this.displayedHp?.get(unit.id) ?? unit.hp) === 0;
    const isPet = this.isPet(unit) || unit.side === 'enemy';
    const visual = new Node(`unit-${unit.id}`);
    this.layer.addChild(visual);
    this.pos(visual, point.x, point.y + (isPet ? CONFIG.visual.footOffset.frog : CONFIG.visual.footOffset.hero));
    this.unitNodes.set(unit.id, visual);
    this.basePositions.set(unit.id, visual.position.clone());
    visual.addComponent(UITransform).setContentSize(256, 256);
    visual.getComponent(UITransform)!.setAnchorPoint(0.5, 0);
    const scale = CONFIG.visual.unitScale;
    visual.setScale(unit.side === 'enemy' && CONFIG.visual.enemyFlipX ? -scale : scale, scale, 1);
    const sprite = visual.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.RAW;
    sprite.trim = false;
    sprite.spriteFrame = isPet ? this.petArt(unit) : this.heroArt;
    sprite.color = this.unitColor(unit);
    if (dead) sprite.grayscale = true;
    visual.addComponent(UIOpacity).opacity = dead ? 0 : 255;
    if (!dead && !this.playing) this.idleUnit(visual, unit);
    if (!this.playing && this.canSelect(unit)) visual.on(Node.EventType.TOUCH_END, () => this.chooseTarget(unit.id));
  }

  private idleUnit(visual: Node, unit: Unit): void {
    const a = CONFIG.animation;
    const origin = visual.position.clone(), scale = visual.scale.clone();
    const slot = unit.slot + (unit.side === 'enemy' ? CONFIG.positions.allyGroups.length * 2 : 0);
    // The round timer rebuilds these nodes. Keep their idle phase continuous across redraws.
    const phase = (this.idleTime + slot * a.idleStagger) / a.idleSeconds;
    const sway = (node: Node, progress = 0) => {
      const rise = (1 - Math.cos((phase + progress) * 2 * Math.PI)) / 2;
      const breath = 1 + a.idleScale * rise;
      node.setPosition(origin.x, origin.y + a.idleHeight * rise, origin.z);
      node.setScale(scale.x * breath, scale.y * breath, scale.z);
    };
    sway(visual);
    tween(visual).repeatForever(tween<Node>().to(a.idleSeconds, {}, { onUpdate: sway })).start();
  }

  private healthFill(x: number, y: number, w: number, h: number, color: string) {
    const fill = this.rect(x, y, w, h, color, '', 1);
    return (ratio: number) => {
      this.pos(fill, x + w * ratio / 2, y + h / 2);
      fill.setScale(ratio, 1, 1);
    };
  }

  private healthBarY(unit: Unit, footY: number): number {
    const v = CONFIG.visual;
    const height = (this.isHero(unit) ? v.heroHeight : v.frogHeight) * v.unitScale;
    return footY - height - v.headGap - v.barHeight - (unit.side === 'ally' ? v.barHeight + v.barGap : 0);
  }

  private unitInfo(unit: Unit): void {
    if ((this.displayedLeft?.get(unit.id) ?? unit.left) || (this.displayedHp?.get(unit.id) ?? unit.hp) === 0) return;
    const previous = this.layer;
    const group = new Node(`markers-${unit.id}`);
    previous.addChild(group);
    this.markerNodes.set(unit.id, group);
    this.layer = group;
    const point = this.unitPoint(unit);
    const targetable = this.canSelect(unit);
    const v = CONFIG.visual;
    const headX = point.x + (this.isHero(unit) ? v.heroHeadOffsetX : 0);
    const barX = headX - v.barWidth / 2;
    const healthY = this.healthBarY(unit, point.y);
    const targetClick = targetable ? () => this.chooseTarget(unit.id) : undefined;
    const bar = (y: number, color: string) => {
      this.rect(barX - 1, y - 1, v.barWidth + 2, v.barHeight + 2, '#142322', '', 2, targetClick);
      this.rect(barX, y, v.barWidth, v.barHeight, '#42524E', '', 1, targetClick);
      return this.healthFill(barX, y, v.barWidth, v.barHeight, color);
    };
    const drawHp = bar(healthY, '#D95757');
    this.markerHpBars.set(unit.id, hp => drawHp(hp / unit.maxHp));
    drawHp((this.displayedHp?.get(unit.id) ?? unit.hp) / unit.maxHp);
    if (unit.side === 'ally') bar(healthY + v.barHeight + v.barGap, '#559DD8')(1);
    const compactPetName = this.isPet(unit) && unit.name.length <= 2;
    const nameWidth = unit.isMutated ? 178 : compactPetName ? v.petNameWidth : v.nameWidth;
    const nameX = point.x + (this.isPet(unit) ? v.petNameOffsetX : 0) - nameWidth / 2;
    const name = this.text(`${unit.isMutated ? '变异' : ''}${unit.name} Lv.${unit.level}`, nameX,
      point.y + 19 + v.nameGap, v.nameSize, '#FFFFFF', nameWidth, 1, targetClick);
    const label = name.getComponent(Label)!;
    label.enableOutline = true;
    label.outlineColor = C('#1A2826');
    label.outlineWidth = 2;
    this.layer = previous;
  }

  private syncMovingUnits(): void {
    const units = Array.from(this.unitNodes).sort((a, b) => b[1].position.y - a[1].position.y);
    const firstUnitIndex = this.unitLayer.children.length - units.length;
    units.forEach(([id, node], index) => {
      const base = this.basePositions.get(id)!;
      const offset = new Vec3(node.position.x - base.x, node.position.y - base.y, 0);
      this.shadowNodes.get(id)?.setPosition(offset);
      this.markerNodes.get(id)?.setPosition(offset);
      node.setSiblingIndex(firstUnitIndex + index);
    });
  }

  private chooseTarget(id: string): void {
    const actor = this.battle.pending[0];
    const unit = this.battle.units.find(candidate => candidate.id === id);
    if (!actor || !unit || !this.canSelect(unit) || this.confirmingTarget) return;
    this.confirmingTarget = true;
    let ring = this.ringOpacities.get(id);
    if (!ring) {
      const previous = this.layer;
      this.layer = this.shadowNodes.get(id)!;
      const point = this.unitPoint(unit);
      ring = this.selectionRing(point.x, point.y + 4, '#F1D788');
      this.layer = previous;
    }
    Tween.stopAllByTarget(ring);
    const command = targetCommand(this.choosingTarget);
    tween(ring).to(CONFIG.animation.targetConfirmSeconds / 2, { opacity: 255 })
      .to(CONFIG.animation.targetConfirmSeconds / 2, { opacity: 0 }).call(() => {
    const before = this.battle.round;
    const phase = this.battle.phase;
        const hp = this.captureHp();
        const deployment = this.captureDeployment();
        this.battle.command(actor.id, command, id, command === 'spell' ? this.spellId : undefined);
        this.choosingTarget = null;
        this.confirmingTarget = false;
        if (this.startPlayback(before, phase, hp, deployment)) return;
        this.render();
      }).start();
  }

  private renderHitAreas(units: Unit[]): void {
    if (this.choosingTarget) this.rect(0, 0, CONFIG.width, CONFIG.height, '#000000', '', 0,
      () => { if (!this.confirmingTarget) { this.choosingTarget = null; this.render(); } }, 0);
    for (const unit of [...units].sort((a, b) => this.unitPoint(a).y - this.unitPoint(b).y)) {
      if (!this.canSelect(unit)) continue;
      const point = this.unitPoint(unit);
      const padding = CONFIG.animation.targetPadding;
      const width = 256 * CONFIG.visual.unitScale + padding * 2;
      const top = point.y - 256 * CONFIG.visual.unitScale - padding;
      const bottom = point.y + CONFIG.visual.nameSize * 2 + padding;
      const area = new Node(`target-hitarea-${unit.id}`);
      this.layer.addChild(area);
      this.pos(area, point.x, (top + bottom) / 2);
      area.addComponent(UITransform).setContentSize(width, bottom - top);
      area.on(Node.EventType.TOUCH_END, () => this.chooseTarget(unit.id));
      area.on(Node.EventType.MOUSE_ENTER, () => {
        if (this.confirmingTarget) return;
        const ring = this.ringOpacities.get(unit.id);
        if (ring) { Tween.stopAllByTarget(ring); ring.opacity = 255; }
      });
      area.on(Node.EventType.MOUSE_LEAVE, () => {
        const ring = this.ringOpacities.get(unit.id);
        if (ring && !this.confirmingTarget) {
          ring.opacity = CONFIG.visual.ringOpacityMin;
          tween(ring).repeatForever(tween<UIOpacity>()
            .to(CONFIG.visual.ringBreathSeconds, { opacity: CONFIG.visual.ringOpacityMax })
            .to(CONFIG.visual.ringBreathSeconds, { opacity: CONFIG.visual.ringOpacityMin })).start();
        }
      });
    }
  }

  private captureHp(): Map<string, number> {
    return new Map(this.battle.units.map(unit => [unit.id, unit.hp]));
  }

  private captureDeployment(): Map<string, boolean> {
    return new Map(this.battle.units.map(unit => [unit.id, unit.deployed]));
  }

  private startPlayback(round: number, phase: string, hp: Map<string, number>, deployment: Map<string, boolean>,
    events: readonly ViewBattleEvent[] = this.battle.events): boolean {
    if (round === this.battle.round && phase === this.battle.phase) return false;
    this.spellOpen = false;
    if (this.choosingTarget === 'spell') this.choosingTarget = null;
    if (this.battle.phase !== 'ended' && this.battle.events.some(event =>
      event.kind === 'summon' || event.kind === 'captureSuccess')) this.persistProgress();
    if (events.length === 0) {
      this.finishBattle();
      return this.battle.phase === 'ended';
    }
    this.displayedHp = hp;
    this.displayedMana = new Map(this.battle.manaBefore);
    this.displayedDeployment = deployment;
    this.displayedLeft = new Map(this.battle.units.map(unit => [unit.id, unit.left]));
    for (const event of events) if (event.kind === 'captureSuccess') this.displayedLeft.set(event.targetId, false);
    this.animationQueue = [...events];
    this.displayedLogEnd = this.animationQueue.find(event => 'logIndex' in event)?.logIndex;
    this.playing = true;
    this.render();
    this.playNextAttack();
    return true;
  }

  private floatingNumberTiming(speed: number): [hold: number, fade: number] {
    const a = CONFIG.animation;
    return [a.floatHoldSeconds / speed, a.floatSeconds / speed];
  }

  private numberLayout(unit: Unit, _speed: number, damage: number, caption: string, small = false) {
    const point = this.unitPoint(unit);
    const size = small ? 22 : caption.includes(PET_SKILLS.crit.name) ? 30 : 26;
    const y = this.healthBarY(unit, point.y) - size * 1.7 - 6;
    const color = damage < 0 ? '#9EE685' : '#FF7772';
    return { x: point.x, y, size, color };
  }

  private damageNumber(id: string, damage: number, speed: number, caption = '', done?: () => void, small = false, offset = 0): void {
    if (damage === 0 && !caption) { done?.(); return; }
    const { x, y, size, color } = this.numberLayout(this.battle.units.find(unit => unit.id === id)!, speed, damage, caption, small);
    const previous = this.layer;
    this.layer = this.markerNodes.get(id) ?? this.markerLayer;
    const a = CONFIG.animation;
    const value = damage < 0 ? `+${-damage}` : damage > 0 ? `−${damage}` : '0';
    const critical = caption === PET_SKILLS.crit.name;
    const width = caption && !critical ? 210 : 90;
    const text = caption === '闪避' ? caption : caption && !critical ? caption + ' ' + value : value;
    const number = this.text(text, x + offset - width / 2, y, size, color, width, 1);
    if (critical) {
      this.layer = number;
      this.text(caption, 0, 0, 18, '#FFD889', 56, 1).setPosition(value.length * size * 0.3 + 25, 0, 0);
    }
    this.layer = previous;
    for (const node of [number, ...number.children]) {
      const label = node.getComponent(Label)!;
      label.isBold = label.enableOutline = true;
      label.outlineColor = C('#36291F');
      label.outlineWidth = 2;
    }
    const opacity = number.addComponent(UIOpacity);
    const [hold, fade] = this.floatingNumberTiming(speed), pop = a.floatPopSeconds / (2 * speed);
    tween(number).to(pop, { scale: new Vec3(a.floatPopScale, a.floatPopScale, 1) }, { easing: 'quadOut' })
      .to(pop, { scale: new Vec3(1, 1, 1) }).delay(hold)
      .to(fade, { position: new Vec3(number.position.x, number.position.y + a.floatDistance, 0) }).start();
    tween(opacity).delay(2 * pop + hold).to(fade, { opacity: 0 }).call(() => {
      number.destroy();
      done?.();
    }).start();
  }

  private shakeUnit(node: Node, distance: number, seconds: number): Tween<Node> {
    const at = node.position.clone();
    return tween(node).to(seconds / 4, { position: new Vec3(at.x + distance, at.y, at.z) })
      .to(seconds / 2, { position: new Vec3(at.x - distance, at.y, at.z) })
      .to(seconds / 4, { position: at });
  }

  private flashUnit(node: Node, seconds: number, tint = Color.WHITE): void {
    const frame = node.getComponent(Sprite)!.spriteFrame;
    const { width, height } = node.getComponent(UITransform)!.contentSize;
    const flash = new Node('hit-flash');
    node.addChild(flash);
    const transform = flash.addComponent(UITransform);
    transform.setContentSize(width, height);
    transform.setAnchorPoint(0.5, 0);
    flash.addComponent(Mask).type = Mask.Type.SPRITE_STENCIL;
    const stencil = flash.getComponent(Sprite)!;
    stencil.sizeMode = Sprite.SizeMode.CUSTOM;
    stencil.trim = false;
    stencil.spriteFrame = frame;
    const fill = new Node('flash-fill');
    flash.addChild(fill);
    const graphics = fill.addComponent(Graphics);
    graphics.fillColor = tint;
    graphics.rect(-width / 2, 0, width, height);
    graphics.fill();
    const opacity = flash.addComponent(UIOpacity);
    const pulse = seconds / 3;
    tween(opacity).delay(pulse).set({ opacity: 0 }).delay(pulse).set({ opacity: 255 })
      .delay(pulse).call(() => flash.destroy()).start();
  }

  private animateHp(id: string, hp: number, speed: number): void {
    const a = CONFIG.animation;
    const value = { hp: this.displayedHp!.get(id) ?? hp };
    this.displayedHp!.set(id, hp);
    if (value.hp !== hp) tween(value).to(a.hpSeconds / speed, { hp }, { easing: 'quadOut', onUpdate: () => {
      this.markerHpBars.get(id)?.(value.hp);
      this.statusHpBars.get(id)?.(value.hp);
    } }).start();
  }

  private showImpact(id: string, damage: number, hp: number, dx: number, dy: number, speed: number, caption = '', done?: () => void): void {
    this.animateHp(id, hp, speed);
    this.hitReaction(id, damage, hp, dx, dy, speed, caption);
    this.damageNumber(id, damage, speed, caption, done);
  }

  private hitReaction(id: string, damage: number, hp: number, dx: number, dy: number, speed: number, caption: string, counter = false): void {
    const target = this.unitNodes.get(id);
    if (!target || damage <= 0) return;
    const a = CONFIG.animation;
    const seconds = (counter ? a.counterSeconds : a.hitSeconds) / speed;
    const at = target.position.clone();
    const defending = this.battle.lastCommands.get(id)?.command === 'defend';
    const critical = caption.includes(PET_SKILLS.crit.name);
    const reflected = caption === PET_SKILLS.reflect.name;
    const flash = critical ? a.critFlashSeconds : a.flashSeconds;
    const tint = critical ? C('#FFE080') : reflected ? C('#CBCFFF') : Color.WHITE;
    this.flashUnit(target, flash / speed, tint);
    const camera = critical ? this.node.getChildByName('Camera') : null;
    if (camera) this.shakeUnit(camera, a.critShakeDistance, a.critShakeSeconds / speed).start();
    const away = new Vec3(dx || (!dy ? (at.x < 0 ? -1 : 1) : 0), dy, 0)
      .multiplyScalar(counter ? -a.counterDistance : defending ? a.defendDistance : a.hitDistance);
    const reaction = tween(target).to(seconds / 2, { position: at.clone().add(away) }, { easing: 'quadOut' })
      .to(seconds / 2, { position: at });
    if (hp === 0) reaction.call(() => this.fadeUnit(id, target, speed));
    reaction.start();
  }

  private fadeUnit(id: string, node: Node, speed: number): void {
    const a = CONFIG.animation, at = node.position.clone(), duration = a.fadeSeconds / speed;
    node.getComponent(Sprite)!.grayscale = true;
    const shadow = this.shadowNodes.get(id);
    if (shadow) shadow.active = false;
    tween(node.getComponent(UIOpacity)!).to(duration, { opacity: 0 }).start();
    tween(node).to(duration, { position: new Vec3(at.x, at.y - a.deathSink, at.z) }).start();
  }

  private playStrike(hit: AttackEvent, reactions: PhysicalEvent[], { x, y }: Vec3, speed: number, next: () => void): void {
    const impacts = [{ id: hit.targetId, damage: hit.targetDamage, hp: hit.targetAfter, caption: hit.caption }];
    if (hit.guardId && hit.guardAfter !== undefined)
      impacts.push({ id: hit.guardId, damage: hit.guardDamage ?? 0, hp: hit.guardAfter, caption: '' });
    impacts.forEach(({ id, damage, hp, caption }) => {
      const counter = reactions.some(event => event.kind === 'attack' && event.source === 'counter' && event.actorId === id);
      this.hitReaction(id, damage, hp, x, y, speed, caption, counter);
    });
    const finalHp = new Map(impacts.map(({ id, hp }) => [id, hp]));
    const passives = new Map<string, { gain: number; loss: number }>();
    for (const event of reactions) {
      const totals = passives.get(event.targetId) ?? { gain: 0, loss: 0 };
      if (event.kind === 'heal') totals.gain += event.amount;
      else totals.loss += event.targetBefore - event.targetAfter;
      passives.set(event.targetId, totals);
      finalHp.set(event.targetId, event.targetAfter);
    }
    const returned = reactions.find(event => event.kind === 'attack' && event.targetDamage > 0);
    const attacker = returned && this.unitNodes.get(returned.targetId);
    if (attacker && returned.kind === 'attack')
      this.flashUnit(attacker, CONFIG.animation.reactionFlashSeconds / speed,
        returned.source === 'reflect' ? C('#CBCFFF') : Color.WHITE);
    for (const [id, hp] of finalHp) this.animateHp(id, hp, speed);
    const spread = reactions.length ? Math.sign(x) * CONFIG.animation.floatHitOffset : 0;
    const crit = PET_SKILLS.crit.name;
    const numbers = impacts.map(({ id, damage, caption }) =>
      ({ id, damage, caption: caption.includes(crit) ? crit : '', small: false, offset: spread }));
    for (const [id, { gain, loss }] of passives) {
      const center = id === hit.actorId ? -spread : spread;
      const gap = gain && loss ? CONFIG.animation.floatStackGap / 2 : 0;
      if (gain) numbers.push({ id, damage: -gain, caption: '', small: true, offset: center - gap });
      if (loss) numbers.push({ id, damage: loss, caption: '', small: true, offset: center + gap });
    }
    let remaining = numbers.length;
    for (const { id, damage, caption, small, offset } of numbers)
      this.damageNumber(id, damage, speed, caption, () => { if (--remaining === 0) next(); }, small, offset);
  }

  private magicPulse(id: string, feet: boolean, speed: number, peak?: () => void, done?: () => void, tint = '#94DCFF'): void {
    const a = CONFIG.animation;
    const point = this.unitPoint(this.battle.units.find(unit => unit.id === id)!);
    const glow = new Node(feet ? 'spell-ring' : 'spell-impact');
    this.markerLayer.addChild(glow);
    this.pos(glow, point.x, feet ? point.y : point.y - a.spellHeight);
    glow.addComponent(UITransform);
    const ink = glow.addComponent(Graphics);
    if (feet) {
      ink.strokeColor = C(tint);
      ink.lineWidth = a.spellRingWidth;
      ink.ellipse(0, 0, a.spellRingX, a.spellRingY);
      ink.stroke();
    } else {
      ink.fillColor = C(tint + 'A0');
      ink.circle(0, 0, a.spellRadius);
      ink.fill();
      ink.fillColor = C('#E9F8FF');
      ink.circle(0, 0, a.spellCoreRadius);
      ink.fill();
    }
    const alpha = glow.addComponent(UIOpacity);
    alpha.opacity = 0;
    const half = a.spellSeconds / (2 * speed);
    tween(alpha).to(half, { opacity: 255 }).call(() => peak?.())
      .to(half, { opacity: 0 }).call(() => { glow.destroy(); done?.(); }).start();
  }

  private playSpell(event: SpellFxEvent, speed: number, next: () => void): void {
    const a = CONFIG.animation;
    const skill = event.skillId ? PET_SKILLS[event.skillId] : undefined;
    const tint = event.skillId ? SPELL_TINTS[event.skillId] : undefined;
    const caster = this.unitNodes.get(event.actorId);
    if (caster) {
      const base = caster.scale.clone(), half = a.spellSeconds / (2 * speed);
      tween(caster).to(half, { scale: base.clone().multiplyScalar(a.spellCastScale) })
        .to(half, { scale: base }).start();
    }
    this.magicPulse(event.actorId, true, speed, () => {
      if (event.manaAfter === undefined) return;
      this.displayedMana!.set(event.actorId, event.manaAfter);
      this.statusManaBars.get(event.actorId)?.(event.manaAfter);
    }, () => {
      let remaining = event.targets.length;
      if (!remaining) { next(); return; }
      event.targets.forEach(({ targetId, damage, hpAfter, missed }, index) => {
        const launch = () => this.magicPulse(targetId, false, speed, () => {
          const hp = missed ? this.displayedHp!.get(targetId)! : hpAfter;
          this.showImpact(targetId, missed ? 0 : damage, hp, 0, 0, speed, missed ? '闪避' : skill?.name,
            () => { if (--remaining === 0) next(); });
        }, undefined, tint);
        if (index) this.scheduleOnce(launch, index * a.spellTargetGap / speed);
        else launch();
      });
    }, tint);
  }

  private playNextAttack(): void {
    if (this.onMap || this.resultSaved) return;
    const event = this.animationQueue.shift();
    if (!event) {
      this.playing = false;
      this.displayedHp = null;
      this.displayedMana = null;
      this.displayedDeployment = null;
      this.displayedLeft = null;
      this.displayedLogEnd = undefined;
      if (this.battle.phase === 'ended') { this.finishBattle(); return; }
      if (this.auto.enabled && this.battle.phase === 'command') this.runAuto();
      else this.render();
      return;
    }
    if (event.kind === 'summon') {
      if (event.fromId) this.displayedDeployment!.set(event.fromId, false);
      this.displayedDeployment!.set(event.toId, true);
      this.render();
      this.playNextAttack();
      return;
    }
    const a = CONFIG.animation;
    const speed = this.speedMultiplier;
    let logIndex = 'logIndex' in event ? event.logIndex : undefined;
    const next = () => {
      if (logIndex !== undefined) this.displayedLogEnd = logIndex + 1;
      this.render();
      this.playNextAttack();
    };
    if (event.kind === 'spell') { this.playSpell(event, speed, next); return; }
    if (event.kind === 'dodge') {
      this.showImpact(event.targetId, 0, this.displayedHp!.get(event.targetId)!, 0, 0, speed, '闪避', next);
      return;
    }
    const target = this.unitNodes.get(event.targetId);
    if (event.kind === 'heal' || (event.kind === 'attack' && event.source === 'reflect')) {
      const damage = event.kind === 'heal' ? -event.amount : event.targetDamage;
      const caption = event.kind === 'heal' ? PET_SKILLS.lifesteal.name : event.caption;
      this.showImpact(event.targetId, damage, event.targetAfter, 0, 0, speed, caption, next);
      return;
    }
    if (event.kind !== 'attack') {
      const captured = event.kind === 'captureSuccess';
      const finish = () => {
        if (captured) this.displayedLeft!.set(event.targetId, true);
        next();
      };
      if (!target) { finish(); return; }
      if (captured) {
        const duration = a.captureSeconds / speed;
        const scale = target.scale.clone().multiplyScalar(a.captureScale);
        const shadow = this.shadowNodes.get(event.targetId), marker = this.markerNodes.get(event.targetId);
        if (shadow) shadow.active = false;
        if (marker) marker.active = false;
        tween(target.getComponent(UIOpacity)!).to(duration, { opacity: 0 }).start();
        tween(target).to(duration, { scale }, { easing: 'quadIn' }).call(finish).start();
      } else this.shakeUnit(target, a.captureFailDistance, a.captureFailSeconds / speed).call(finish).start();
      return;
    }
    const actor = this.unitNodes.get(event.actorId);
    const direction = actor && target ? target.position.clone().subtract(actor.position).normalize() : Vec3.ZERO;
    const reactions: PhysicalEvent[] = [];
    while (event.source === 'main') {
      const reaction = this.animationQueue[0];
      if (reaction?.kind !== 'heal' && (reaction?.kind !== 'attack' || reaction.source === 'main')) break;
      this.animationQueue.shift();
      reactions.push(reaction);
      logIndex = reaction.logIndex;
    }
    const hit = () => {
      this.displayedLogEnd = logIndex! + 1;
      const panel = this.node?.getChildByName('interface-layer');
      if (panel) this.renderLog(panel);
      this.playStrike(event, reactions, direction, speed, next);
    };
    if (!actor || !target) { hit(); return; }
    const origin = actor.position.clone(), scale = actor.scale.clone();
    const reach = Math.min(a.attackReach, Vec3.distance(origin, target.position) / 2);
    const front = target.position.clone().subtract(direction.clone().multiplyScalar(reach));
    const strike = a.attackStrikeSeconds / (2 * speed);
    tween(actor).to(a.attackMoveSeconds / speed, { position: front }, { easing: 'quadOut' })
      .delay(a.attackBeatSeconds / speed)
      .to(strike, { scale: scale.clone().multiplyScalar(a.attackScale) }, { easing: 'quadOut' }).call(hit)
      .to(strike, { scale })
      .to(a.attackMoveSeconds / speed, { position: origin }, { easing: 'quadOut' }).call(() => {
        if (this.displayedHp?.get(event.actorId) === 0) this.fadeUnit(event.actorId, actor, speed);
      }).start();
  }

  private logLines(): { text: string; result: boolean }[] {
    const lines: { text: string; result: boolean }[] = [];
    const end = this.displayedLogEnd ?? this.battle.log.length;
    for (const event of this.battle.log.slice(Math.max(0, end - 4), end)) {
      const result = /战斗胜利|战斗失败/.test(event);
      let line = '';
      let width = 0;
      for (const character of Array.from(event)) {
        const advance = /[\u0000-\u007f]/.test(character) ? (character === ' ' ? 7 : 11) : 20;
        if (line && width + advance > 496) {
          lines.push({ text: line, result });
          line = '';
          width = 0;
        }
        line += character;
        width += advance;
      }
      lines.push({ text: line, result });
    }
    return lines;
  }

  private renderLog(parent = this.layer): void {
    const previous = this.layer;
    parent.getChildByName('battle-log')?.destroy();
    this.layer = new Node('battle-log');
    parent.addChild(this.layer);
    const lines = this.logLines();
    const lineHeight = 28;
    const top = CONFIG.height - 20 - 24 - lines.length * lineHeight;
    this.rect(20, top, 520, 24 + lines.length * lineHeight, '#172D2B', '', 9, undefined, 191);
    lines.forEach((entry, index) => {
      const node = new Node('battle-log-line');
      this.layer.addChild(node);
      node.addComponent(UITransform).setAnchorPoint(0, 1);
      this.pos(node, 32, top + 12 + index * lineHeight);
      const rich = node.addComponent(RichText);
      rich.fontSize = 20;
      rich.lineHeight = lineHeight;
      rich.maxWidth = 0;
      rich.fontColor = C(entry.result ? '#F8D98A' : '#FFFFFF');
      const escaped = entry.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      rich.string = entry.result ? `<b>${escaped}</b>` : escaped.replace(/\d+/g, '<color=#F7D28A>$&</color>');
    });
    this.layer = previous;
  }

  private statusCard(kind: 'pet' | 'hero', x: number,
    unit: (Pick<Unit, 'id' | 'name' | 'species' | 'isMutated' | 'hp' | 'maxHp'> &
      Partial<Pick<Unit, 'mana' | 'maxMana'>>) | undefined): void {
    const y = 18;
    const card = this.rect(x, y, 192, 104, '#203A37', '#829183', 9, undefined, 215);
    if (this.onMap) card.addComponent(BlockInputEvents);
    if (unit) {
      const portrait = new Node(`portrait-${kind}`);
      this.layer.addChild(portrait);
      this.pos(portrait, x + 32, y + 36);
      portrait.addComponent(UITransform).setContentSize(48, 48);
      portrait.on(Node.EventType.TOUCH_END, () => {
        if (this.onMap && (!this.enabledInHierarchy || this.town?.loading)) return;
        if (kind === 'hero') return this.openHeroPanel();
        if (this.playing || this.rosterOpen || this.summonOpen || this.confirmingTarget) return;
        this.rosterOpen = true;
        this.openPetPanel(unit.id);
      });
      const mask = portrait.addComponent(Mask);
      mask.type = Mask.Type.GRAPHICS_ELLIPSE;
      const art = new Node('portrait-art');
      portrait.addChild(art);
      art.addComponent(UITransform).setContentSize(256, 256);
      const sprite = art.addComponent(Sprite);
      sprite.spriteFrame = kind === 'hero' ? this.heroArt : this.petArt(unit);
      sprite.color = this.unitColor(unit);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      art.setScale(kind === 'hero' ? 0.75 : 0.22, kind === 'hero' ? 0.75 : 0.22, 1);
      art.setPosition(kind === 'hero' ? -2 : 0, kind === 'hero' ? -58 : 0, 0);
    }
    const heroProgress = this.progress.heroProgress;
    const pet = this.progress.roster.entries.find(pet => pet.id === unit?.id);
    const progress = kind === 'hero' ? heroProgress : pet;
    const mana = heroProgress ? heroPanel(heroProgress.stats).maxMana : BATTLE_RULES.status.heroManaMax;
    const petMana = (this.playing && unit ? this.battle.maxManaBefore?.get(unit.id) : undefined)
      ?? unit?.maxMana ?? (pet ? petPanel(pet).maxMana : 0);
    const bars = kind === 'hero'
      ? [
        { label: '气血', value: unit ? this.displayedHp?.get(unit.id) ?? unit.hp : 0, max: unit?.maxHp ?? 1, color: '#D95757' },
        { label: '法力', value: mana, max: mana, color: '#559DD8' },
        { label: '愤怒', value: this.onMap ? 0 : this.battle.heroRage, max: BATTLE_RULES.status.rageMax, color: '#EBA14F' },
        { label: '经验', value: progress?.exp ?? 0, max: progress ? levelUpExp(progress.level) : 1, color: '#E6C95C' },
      ]
      : [
        { label: '气血', value: unit ? this.displayedHp?.get(unit.id) ?? unit.hp : 0, max: unit?.maxHp ?? 1, color: '#D95757' },
        { label: '法力', value: (unit && this.displayedMana?.get(unit.id)) ?? unit?.mana ?? petMana, max: petMana, color: '#559DD8' },
        { label: '经验', value: progress?.exp ?? 0, max: progress ? levelUpExp(progress.level) : 1, color: '#E6C95C' },
      ];
    bars.forEach((bar, index) => {
      const by = y + 17 + index * 22;
      this.rect(x + 69, by, 112, 10, '#10201F', '#526562', 2);
      if (kind === 'pet' && bar.label === '法力' && unit && this.playing) {
        const fill = this.healthFill(x + 70, by + 1, 110, 8, bar.color);
        const label = this.text('', x + 69, by - 5, 12, '#FFFFFF', 112, 1).getComponent(Label)!;
        const draw = (mana: number) => { fill(aptitudeBarRatio(mana, 0, bar.max)); label.string = `${mana}/${bar.max}`; };
        this.statusManaBars.set(unit.id, draw);
        draw(bar.value);
        return;
      }
      if (this.playing && index === 0 && unit) {
        const drawHp = this.healthFill(x + 70, by + 1, 110, 8, bar.color);
        this.statusHpBars.set(unit.id, hp => drawHp(hp / bar.max));
        drawHp(bar.value / bar.max);
      } else if (bar.value > 0) this.rect(x + 70, by + 1, 110 * bar.value / bar.max, 8, bar.color, '', 1);
      if (kind === 'pet' && bar.label === '法力' && unit)
        this.text(`${bar.value}/${bar.max}`, x + 69, by - 5, 12, '#FFFFFF', 112, 1);
      if (kind === 'pet' ? this.selectedPetId === unit?.id && this.rosterOpen : this.detailsOpen && !progress) {
        if (kind === 'pet' && bar.label === '法力') return;
        const value = bar.label !== '经验' ? `${bar.value}/${bar.max}`
          : !progress ? '待定'
            : progress.level === HERO_PROGRESSION.maxLevel ? '已满级' : `${bar.value}/${bar.max}`;
        this.text(`${bar.label} ${value}`, x + 69, by - 8, 13, '#FFFFFF', 114);
      }
    });
    this.text(unit ? `${unit.isMutated ? '变异' : ''}${unit.name}` : '暂无出战宝宝', x + 8, y + 79, 15, '#F4E9C8', 180);
  }

  private renderSpellList(actor: Unit): void {
    const ids = activeSpells(actor.skillIds);
    this.rect(0, 0, CONFIG.width, CONFIG.height, '#101E1C', '', 0, undefined, 165).addComponent(BlockInputEvents);
    this.rect(462, 201, 410, 344, '#1E3835', '#E5CB8D', 14);
    const title = !ids.length ? '未学会主动灵术'
      : ids.every(id => actor.mana < PET_SKILLS[id].params.mana) ? '法力不足' : '选择灵术';
    this.text(title, 485, 216, 27, '#F3DFAD', 364, 1);
    ids.forEach((id, index) => {
      const { name, params } = PET_SKILLS[id];
      this.button(`${name}　消耗 ${params.mana} 法力`, 490, 263 + index * 58, 354, 49,
        actor.mana >= params.mana, () => {
          this.spellId = id; this.spellOpen = false; this.choosingTarget = 'spell'; this.render();
        });
    });
    this.button('返回', 566, 478, 202, 49, true, () => { this.spellOpen = false; this.render(); });
  }

  private renderSummonList(actorId: string): void {
    this.rect(472, 145, 388, 570, '#1E3835', '#E5CB8D', 14);
    this.text('选择携带的灵宠', 510, 161, 28, '#F3DFAD', 310, 1);
    this.battle.pets.forEach((pet, index) => {
      const eligible = this.battle.summonTargets().some(unit => unit.id === pet.id);
      const label = `${pet.isMutated ? '变异' : ''}${pet.name} Lv.${pet.level} ${pet.hp}/${pet.maxHp}`;
      const button = this.button(label, 499, 218 + index * 73, 335, 61, eligible, eligible ? () => {
        const before = this.battle.round;
        const phase = this.battle.phase;
        const hp = this.captureHp();
        const deployment = this.captureDeployment();
        this.battle.command(actorId, 'summon', pet.id);
        this.summonOpen = false;
        if (this.startPlayback(before, phase, hp, deployment)) return;
        this.render();
      } : undefined);
      button.getChildByName('button-label')?.setPosition(20, 0, 0);
      const art = this.image(506, 224 + index * 73, 49, 49, this.petArt(pet));
      art.sprite.color = this.unitColor(pet);
      art.node.setParent(button, true);
    });
    this.button('返回', 568, 631, 192, 58, true, () => { this.summonOpen = false; this.render(); });
  }

  private openPetPanel(id: string): void {
    this.skillOpen = undefined;
    this.selectedPetId = id;
    this.petPanelPage = 'basic';
    this.render();
  }

  private renderPetPanel(pet: CarriedPet): void {
    const points = this.petPanelPage === 'points';
    const aptitude = this.petPanelPage === 'aptitude';
    const ink = '#4A2C1D';
    const open = (page: typeof this.petPanelPage) => {
      this.skillOpen = undefined;
      this.stopPotentialRepeat();
      if (page === 'points' && this.petPanelPage !== 'points') this.petReturnPage = this.petPanelPage;
      if (page !== 'points') this.allocationPreview = undefined;
      this.petPanelPage = page;
      this.render();
    };
    const close = () => {
      this.skillOpen = undefined;
      this.stopPotentialRepeat();
      this.rosterOpen = false;
      this.selectedPetId = null;
      this.allocationPreview = undefined;
      this.render();
    };
    this.rect(0, 0, CONFIG.width, CONFIG.height, '#101E1C', '', 0, undefined, 200).addComponent(BlockInputEvents);
    this.image(167, 0, 1000, 750, points ? this.petPointsArt : aptitude ? this.petAptitudeArt : this.petBasicArt);
    this.text('召唤兽属性', 502, 13, 34, '#F7E8C1', 330, 1);
    this.rect(1070, 28, 56, 54, '#000000', '', 0, close, 0);
    this.text(pet.name, 331, points ? 109 : 113, points ? 26 : 23, ink, 154);
    this.text(`${pet.level}级`, 333, 152, 20, ink, 82, 1);
    const identity = `${pet.isBaby ? '宝宝' : '野生'}${pet.isMutated ? ' · 变异' : ''}`;
    this.drawPetPortrait(pet, 282, 148, 65);
    if (!points) {
      const plaque = this.rect(1093, 269, 70, 140, '#000000', '', 0, undefined, 0);
      plaque.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
      this.image(167, 153, 1000, 750, this.petPointsArt).node.setParent(plaque, true);
    }
    for (const [index, label] of ['属性', '加点'].entries()) {
      const y = 125 + index * 153;
      const select = index === Number(points) ? undefined : () => open(index ? 'points' : this.petReturnPage);
      this.rect(1094, y, 58, 116, '#000000', '', 0, select, 0);
      Array.from(label).forEach((char, row) => this.text(char, 1095, y + 20 + row * 37, 26, ink, 56, 1));
    }
    if (!points) {
      const tagX = 338 + pet.name.length * 23;
      this.rect(tagX, 116, 76, 26, '#4A7764', '', 10);
      this.text(identity.replaceAll(' ', ''), tagX, 116, 15, '#F7E8C1', 76, 1);
      this.drawPetPortrait(pet, 373, 337, 244);
      this.renderReleaseButton(pet);
      this.renderDeployButton(pet);
      this.renderPetSlots(pet.id);
      this.text('属性', 606, 101, 25, ink, 182, 1, () => open('basic'));
      this.text('资质技能', 793, 101, 25, ink, 195, 1, () => open('aptitude'));
      if (aptitude) this.renderPetAptitudes(pet);
      else this.renderPetAttributes(pet);
      return;
    }
    this.text(identity, 422, 151, 19, '#356456', 100);
    const live = this.onMap ? undefined : this.battle.pets.find(unit => unit.id === pet.id);
    const preview = petPanelPreview(pet, this.allocationPreview);
    const { maxHp, maxMana } = preview.panel;
    const hp = `${this.onMap ? maxHp : live?.hp ?? pet.hp}/${maxHp}`;
    const mana = `${live?.mana ?? maxMana}/${live?.maxMana ?? maxMana}`;
    [['气血', hp], ['法力', mana]].forEach(([name, value], i) => {
      const y = 109 + i * 48;
      this.text(name, 617, y, 21, ink, 54);
      this.text(value, 758, y - 2, 23, '#F7E8CF', 216, 1);
    });
    this.renderPetPointsPreview(preview, hp, mana);
    this.renderAllocation(petProgress(pet), () => open(this.petReturnPage), draft => this.confirmPetPoints(pet.id, draft), 'pet');
  }

  private renderDeployButton(pet: CarriedPet): void {
    const blocked = () => !this.onMap || this.progressReadFailed || !this.usesTestProgress;
    const deployed = this.progress.selectedPetId === pet.id;
    this.button(deployed ? '已出战' : '设为出战', 240, 455, 180, 36, !blocked() && !deployed, () => {
      try {
        this.progress.selectPet(blocked(), pet.id, selectedPetId =>
          saveProgress(progressStorage(), { ...this.progress, selectedPetId }));
      } catch (error) { showNotice(`切换出战保存失败：${error instanceof Error ? error.message : String(error)}`); }
      this.render();
    });
  }

  private renderReleaseButton(pet: CarriedPet): void {
    const blocked = this.progress.roster.releaseBlock(pet.id, this.progress.selectedPetId, this.inBattle)
      ?? (!this.usesTestProgress || this.progressReadFailed ? '当前无法保存放生结果。' : undefined);
    this.rect(442, 455, 80, 36, '#82796D', '', 12, () => {
      if (blocked) { showNotice(blocked); return; }
      this.releasePrompt = pet;
      this.render();
    }, blocked ? 220 : 0);
    this.text('放生', 443, 455, 22, blocked ? '#F2EBDB' : '#4A2C1D', 80, 1);
  }

  private renderReleasePrompt(pet: CarriedPet): void {
    const close = () => { this.releasePrompt = undefined; this.render(); };
    this.rect(0, 0, CONFIG.width, CONFIG.height, '#101E1C', '', 0, undefined, 190).addComponent(BlockInputEvents);
    this.rect(397, 266, 540, 204, '#203D36', '#E5CB8D', 16);
    this.text(`确定放生 ${pet.name}（${pet.level}级）？`, 417, 286, 27, '#F7E8C1', 500, 1);
    this.text('放生后无法找回。', 417, 328, 23, '#F7E8C1', 500, 1);
    this.button('取消', 477, 384, 170, 56, true, close);
    this.button('确认', 687, 384, 170, 56, true, () => {
      try {
        if (this.releaseProgressPet(pet.id)) {
          this.progressError = '';
          this.selectedPetId = this.progress.roster.entries[0].id;
        }
      } catch {
        showNotice('本地进度保存失败。');
      }
      close();
    });
  }

  private drawPetPortrait(pet: CarriedPet, x: number, y: number, size: number): void {
    const frame = this.petArt(pet);
    if (!frame) {
      this.text(size < 100 ? '?' : '暂无立绘', x - size / 2, y - 18, 22, '#4A2C1D', size, 1);
      return;
    }
    const scale = size / Math.max(frame.rect.width, frame.rect.height);
    const w = frame.rect.width * scale, h = frame.rect.height * scale;
    this.image(x - w / 2, y - h / 2, w, h, frame).sprite.color = this.unitColor(pet);
  }

  private renderPetSlots(selectedId: string): void {
    const deployed = this.onMap ? { id: this.progress.selectedPetId } : this.battle.pets.find(pet => pet.deployed && !pet.left);
    this.progress.roster.entries.forEach((pet, i) => {
      const x = 236 + (i % 5) * 61, y = 514 + Math.floor(i / 5) * 77;
      this.rect(x, y, 52, 66, '#729586', pet.id === selectedId ? '#FFD45C' : '#9C8156', 6, () => {
        this.skillOpen = undefined;
        this.selectedPetId = pet.id;
        this.render();
      });
      this.drawPetPortrait(pet, x + 26, y + 34, 47);
      if (pet.id === deployed?.id) {
        this.rect(x, y, 22, 21, '#B74638', '', 4);
        this.text('战', x, y - 2, 15, '#FFF0C4', 22, 1);
      }
    });
  }

  private petInfoBar(name: string, value: string, y: number, ratio: number, color: string): void {
    this.text(name, 594, y - 17, 22, '#4A2C1D', 134);
    this.text(value, 686, y - 17, 22, '#4A2C1D', 100, 2);
    if (ratio > 0) this.rect(809, y - 7, 228 * ratio, 14, color, '', Math.min(7, 114 * ratio));
  }

  private renderPetAttributes(pet: CarriedPet): void {
    const { maxHp, maxMana, attack, defense, speed, dodge, spirit } = petPanel(pet);
    const live = this.onMap ? undefined : this.battle.pets.find(unit => unit.id === pet.id);
    const hp = this.onMap ? maxHp : live?.hp ?? pet.hp;
    const mana = live?.mana ?? maxMana, manaMax = live?.maxMana ?? maxMana;
    const xpMax = levelUpExp(pet.level);
    const capped = pet.level === HERO_PROGRESSION.maxLevel;
    this.petInfoBar('气血', `${hp}/${maxHp}`, 202, aptitudeBarRatio(hp, 0, maxHp), '#D35657');
    this.petInfoBar('法力', `${mana}/${manaMax}`, 257, aptitudeBarRatio(mana, 0, manaMax), '#559DD8');
    this.petInfoBar('经验', capped ? '已满级' : `${pet.exp}/${xpMax}`, 311,
      capped ? 1 : aptitudeBarRatio(pet.exp, 0, xpMax), '#DBAA4F');
    [['伤害', attack], ['防御', defense], ['速度', speed], ['躲避', dodge], ['灵力', spirit]].forEach(([name, value], i) => {
      const x = i < 3 ? 581 : 834, y = 366 + (i % 3) * 62;
      this.text(String(name), x, y, 24, '#4A2C1D', 105);
      this.text(String(value), x + 92, y, 24, '#4A2C1D', 94, 1);
    });
  }

  private renderPetAptitudes(pet: CarriedPet): void {
    const { aptitudes, growth } = WILD_SPECIES[pet.species];
    const names = ['攻击资质', '防御资质', '体力资质', '法力资质', '躲避资质', '速度资质'];
    const colors = ['#659B53', '#559DD8', '#D35657', '#A07DCB', '#D49C49', '#55A69C'];
    const overflow = '#FFC34A';
    APTITUDE_KEYS.forEach((key, i) => {
      const value = pet.aptitudes[key], [min, max] = aptitudes[key];
      this.petInfoBar(names[i], String(value), 184 + i * 37.5, aptitudeBarRatio(value, min, max),
        pet.isMutated && value > max ? overflow : colors[i]);
    });
    this.petInfoBar('成长', pet.growth.toFixed(3), 409, aptitudeBarRatio(pet.growth, growth.min, growth.max),
      pet.isMutated && pet.growth > growth.max ? overflow : '#A07DCB');
    this.renderPetSkills(pet);
  }

  private renderPetSkills(pet: CarriedPet): void {
    for (let i = 0; i < 12; i++) {
      const id = i < 8 ? pet.skillIds?.[i] : undefined;
      const x = 595 + i % 4 * 106, y = 468 + Math.floor(i / 4) * 66;
      this.rect(x, y, 96, 58, '#E9D9B7', '#93734D', 6, id ? () => {
        this.skillOpen = id;
        this.render();
      } : undefined).addComponent(BlockInputEvents);
      this.text(id ? PET_SKILLS[id].name : i < 8 ? '空' : '锁定', x, y + 14, 20, '#4A2C1D', 96, 1);
      if (id && SKILL_POOLS[pet.species].innate.includes(id)) this.text('天生', x + 55, y, 12, '#38652A', 40);
    }
    if (!this.skillOpen || !pet.skillIds?.includes(this.skillOpen)) return;
    const id = this.skillOpen;
    this.rect(0, 0, 1334, 750, '#101E1C', '', 0, undefined, 150).addComponent(BlockInputEvents);
    this.rect(370, 205, 594, 310, '#F9EFD9', '#93734D', 12).addComponent(BlockInputEvents);
    this.rect(394, 231, 82, 65, '#E9D9B7', '#93734D', 6);
    this.text(PET_SKILLS[id].name, 395, 250, 20, '#4A2C1D', 80, 1);
    this.text(PET_SKILLS[id].name, 496, 236, 28, '#4A2C1D', 360);
    const lines = skillDescription(id, pet.species).split('\n').flatMap(line => line.match(/.{1,23}/gu) ?? []);
    lines.forEach((line, i) => this.text(line, 394, 312 + i * 28, 21, '#4A2C1D', 548));
    this.rect(889, 219, 60, 52, '#E9D9B7', '#93734D', 6, () => {
      this.skillOpen = undefined;
      this.render();
    });
    this.text('关闭', 889, 231, 20, '#4A2C1D', 60, 1);
  }

  private renderPetPointsPreview({ panel, delta }: ReturnType<typeof petPanelPreview>, hp: string, mana: string): void {
    const ink = '#4A2C1D';
    this.rect(219, 195, 308, 362, '#F9EFD9', '#C5A568', 12);
    this.rect(263, 203, 220, 35, '#F0D69C', '#B89053', 12);
    this.text('属性实时预览', 263, 203, 22, ink, 220, 1);
    const rows = [
      ['气血', 'maxHp', hp], ['法力', 'maxMana', mana], ['伤害', 'attack', panel.attack],
      ['防御', 'defense', panel.defense], ['速度', 'speed', panel.speed],
      ['躲避', 'dodge', panel.dodge], ['灵力', 'spirit', panel.spirit],
    ] as const;
    rows.forEach(([name, key, value], index) => {
      const y = 249 + index * 44;
      this.rect(229, y, 226, 34, '#ECDFC4', '', 6);
      this.rect(462, y, 55, 34, '#E1E7C4', '', 6);
      this.text(name, 241, y, 20, ink, 66);
      this.text(String(value), 327, y, 20, ink, 117, 1);
      this.text(delta(key), 462, y, 20, '#38652A', 55, 1);
    });
  }

  private renderRosterList(): void {
    if (this.fusionOpen) { this.renderFusion(); return; }
    if (this.inventoryOpen) { this.renderInventory(); return; }
    const { entries } = this.progress.roster;
    const selected = entries.find(pet => pet.id === (this.selectedPetId ?? this.progress.selectedPetId)) ?? entries[0];
    if (selected) this.renderPetPanel(selected);
  }

  private openFusion(): void {
    if (!this.onMap || this.mapBlocked || this.town?.loading || this.playing) return;
    this.stopTown();
    this.inventoryOpen = false;
    this.fusionOpen = this.rosterOpen = true;
    this.fusionIds = ['', ''];
    this.fusionMessage = '';
    this.fusionConfirmation = undefined;
    this.render();
  }

  private renderFusion(): void {
    const close = () => { this.fusionConfirmation = undefined; this.fusionOpen = this.rosterOpen = false; this.render(); };
    this.rect(0, 0, CONFIG.width, CONFIG.height, '#000000', '', 0, close, 150).addComponent(BlockInputEvents);
    this.rect(95, 65, 1144, 600, '#1E3835', '#E5CB8D', 12).addComponent(BlockInputEvents);
    this.text('合宠 · 两旧换一新', 125, 85, 28, '#F3DFAD', 700);
    this.button('关闭', 1080, 82, 130, 48, true, close);
    this.fusionIds.forEach((id, side) => {
      const x = side ? 800 : 125, pet = this.progress.roster.entries.find(p => p.id === id);
      this.text(side ? '右侧父宠' : '左侧父宠', x, 140, 22, '#F3DFAD', 390);
      this.progress.roster.entries.forEach((entry, i) => this.button(
        `${id === entry.id ? '✓' : ''}${entry.name} Lv.${entry.level}`, x + i % 2 * 195,
        176 + Math.floor(i / 2) * 42, 188, 38, this.onMap && !this.fusionConfirmation, () => {
          this.fusionIds[side] = entry.id; this.fusionMessage = ''; this.render();
        }));
      if (!pet) return;
      this.drawPetPortrait(pet, x + 55, 365, 94);
      this.text(`${WILD_SPECIES[pet.species].name} · ${pet.isMutated ? '变异' : '普通'}${pet.isBaby ? '宝宝' : '野生'}`,
        x + 115, 328, 20, '#F3DFAD', 280);
      this.text(`成长 ${pet.growth.toFixed(3)}`, x + 115, 364, 21, '#F3DFAD', 260);
      APTITUDE_KEYS.forEach((key, i) => this.text(`${['攻击', '防御', '体力', '法力', '躲避', '速度'][i]}资质 ${pet.aptitudes[key]}`,
        x + i % 2 * 195, 420 + Math.floor(i / 2) * 27, 19, '#C6DBC6', 190));
      for (let i = 0; i < 8; i++) {
        const skill = pet.skillIds?.[i], sx = x + i % 4 * 96, sy = 510 + Math.floor(i / 4) * 38;
        this.rect(sx, sy, 90, 32, '#2E5048', '#93734D', 4);
        this.text(skill ? PET_SKILLS[skill].name : '空', sx, sy + 3, 18, '#F3DFAD', 90, 1);
      }
    });
    const [a, b] = this.fusionIds.map(id => this.progress.roster.entries.find(p => p.id === id));
    this.text('丹炉', 550, 270, 36, '#E5CB8D', 230, 1);
    const probability = a && b && a.species === b.species ? '原物种90% · 其它10%' : '左45% · 右45% · 其它10%';
    this.text(probability, 502, 344, 18, '#F3DFAD', 330, 1);
    this.text(`非必带遗传${FUSION.inheritance * 100}%`, 530, 380, 20, '#F3DFAD', 270, 1);
    this.text('结果可能变弱', 530, 414, 22, '#F4DC9C', 270, 1);
    let reason = '';
    try { fusionPlan(this.progress.roster.entries, this.fusionIds, this.progress.selectedPetId, !this.onMap); }
    catch (error) { reason = error instanceof Error ? error.message : String(error); }
    this.button('合宠', 557, 470, 220, 62, !reason && !this.fusionConfirmation, () => {
      try { this.fusionConfirmation = this.progress.prepareFusion(!this.onMap || !this.fusionOpen, this.fusionIds); }
      catch (error) { this.fusionMessage = String(error); }
      this.render();
    });
    this.text(this.fusionMessage || reason || '确认后才生成；不消耗道具。', 140, 612, 21, '#F4DC9C', 1050);
    const pending = this.fusionConfirmation;
    if (!pending) return;
    const cancel = () => { this.fusionConfirmation = undefined; this.render(); };
    this.rect(0, 0, CONFIG.width, CONFIG.height, '#000000', '', 0, cancel, 180).addComponent(BlockInputEvents);
    this.rect(337, 205, 660, 340, '#1E3835', '#E5CB8D', 12).addComponent(BlockInputEvents);
    this.text('两只原宠将消失，结果可能变弱', 370, 260, 28, '#F4DC9C', 595);
    this.text('保存失败保留父宠，再确认重试同一候选。', 370, 330, 22, '#F3DFAD', 595);
    this.button('取消', 410, 455, 180, 55, true, cancel);
    this.button('确认合宠', 740, 455, 180, 55, true, () => {
      if (this.fusionConfirmation !== pending) return;
      this.fusionConfirmation = undefined;
      try {
        const child = pending.execute(!this.onMap || !this.fusionOpen, (pets, nextId) =>
          progressIO.write(progressStorage(), progressSnapshot(this.progress, undefined, undefined, pets, undefined, undefined, nextId)), this.fusionRandom);
        if (child) { this.fusionOpen = false; this.openPetPanel(child.id); }
      } catch (error) { this.fusionMessage = `合宠失败：${error instanceof Error ? error.message : String(error)}`; }
      this.render();
    });
  }

  private openInventory(): void {
    if (this.playing || this.confirmingTarget || this.summonOpen || this.detailsOpen || this.progressReadFailed) return;
    if (this.onMap && (this.mapBlocked || this.town?.loading)) return;
    this.stopTown();
    this.stopPotentialRepeat();
    this.choosingTarget = null;
    this.spellOpen = false;
    this.inventoryOpen = this.rosterOpen = true;
    this.inventoryItem = this.inventoryPet = undefined;
    this.inventoryChoosingPet = false;
    this.inventoryScrollY = 0;
    this.bookConfirmation = undefined;
    this.bookMessage = '';
    this.loadBagArt();
    this.render();
  }

  private loadBagArt(): void {
    if (this.bagArtLoading || this.bagFrames.size) return;
    this.bagArtLoading = true;
    this.bagArtFailed = false;
    const load = (name: string, folder: string, icons: Record<string, string>) =>
      new Promise<[string, SpriteFrame][]>((resolve, reject) => {
        assetManager.loadBundle(name, (error, bundle) => {
          if (error || !bundle) { reject(error ?? new Error(name)); return; }
          resolve(Promise.all(Object.entries(icons).map(([key, file]) =>
            new Promise<[string, SpriteFrame]>((ready, failed) => {
              bundle.load(`textures/${folder}/${file}/spriteFrame`, SpriteFrame, (err, frame) => {
                if (err || !frame) failed(err ?? new Error(file));
                else ready([key, frame]);
              });
            }))));
        });
      });
    const skills = Object.fromEntries(Object.keys(PET_SKILLS).map(id => [id, `skill_${id}`]));
    Promise.all([load('inventory', 'items', BAG_ART), load('battle', 'ui/skills', skills)])
      .then(frames => { this.bagFrames = new Map(frames.flat()); })
      .catch(error => { this.bagArtFailed = true; console.warn('背包图标加载失败', error); })
      .finally(() => {
        this.bagArtLoading = false;
        if (this.isValid && this.inventoryOpen) this.render();
      });
  }

  private beginSkillBook(): void {
    this.bookConfirmation = undefined;
    try {
      const id = this.inventoryPet ?? '', item = this.inventoryItem ?? '';
      const transaction = this.progress.prepareSkillBook(!this.onMap, id, item);
      const pet = this.progress.roster.entries.find(entry => entry.id === id)!;
      this.bookMessage = '';
      this.bookConfirmation = { transaction, caption: `${ITEMS[item].name} → ${pet.name}\n`
        + `当前 ${pet.skillIds!.length} 技能 · 消耗 1 本\n新增 ${Math.round(transaction.rate * 100)}% · 顶替 ${Math.round((1 - transaction.rate) * 100)}%\n`
        + (transaction.rate < 1 ? '顶替时所有现有技能等概率参与，包括天生技能。' : '新增技能放入首个空格。') };
    } catch (error) { this.bookMessage = error instanceof Error ? error.message : String(error); }
    this.render();
  }

  private beginRejuvenation(): void {
    this.bookConfirmation = undefined;
    try {
      const id = this.inventoryPet ?? '', item = this.inventoryItem ?? '';
      const transaction = this.progress.prepareRejuvenation(!this.onMap, id, item);
      const pet = this.progress.roster.entries.find(entry => entry.id === id)!;
      this.bookMessage = '';
      this.bookConfirmation = { transaction, action: '还童', caption: `${ITEMS[item].name} → ${pet.name} · 消耗 1 个\n`
        + '等级、经验、潜能归零，变为宝宝。\n五项、资质、成长和技能全部重新生成。\n原资料将被替换，确认后才随机和消耗。' };
    } catch (error) { this.bookMessage = error instanceof Error ? error.message : String(error); }
    this.render();
  }

  private renderBookConfirmation(): void {
    const pending = this.bookConfirmation;
    if (!pending) return;
    const cancel = () => { this.bookConfirmation = undefined; this.render(); };
    this.rect(0, 0, CONFIG.width, CONFIG.height, '#000000', '', 0, cancel, 180).addComponent(BlockInputEvents);
    this.rect(337, 205, 660, 340, '#1E3835', '#E5CB8D', 12).addComponent(BlockInputEvents);
    pending.caption.split('\n').forEach((line, index) => this.text(line, 370, 240 + index * 43, 24, '#F3DFAD', 595));
    this.button('取消', 410, 455, 180, 55, true, cancel);
    this.button(`确认${pending.action ?? '打书'}`, 740, 455, 180, 55, true, () => {
      if (this.bookConfirmation !== pending) return;
      this.bookConfirmation = undefined;
      try {
        const result = pending.transaction.execute(!this.onMap || !this.inventoryOpen, (pet, inventory) =>
          progressIO.write(progressStorage(), progressSnapshot(this.progress, undefined, pet, undefined, inventory)), this.bookRandom);
        if (result) {
          this.bookMessage = result.message;
          if (this.inventoryItem && !this.progress.inventory[this.inventoryItem]) this.inventoryItem = undefined;
        }
      } catch (error) { this.bookMessage = `${pending.action ?? '打书'}失败：${error instanceof Error ? error.message : String(error)}`; }
      this.render();
    });
  }

  private renderInventory(): void {
    const close = () => {
      this.bookConfirmation = undefined;
      this.inventoryChoosingPet = this.inventoryOpen = this.rosterOpen = false;
      this.render();
    };
    this.rect(0, 0, CONFIG.width, CONFIG.height, '#000000', '', 0, close, 150).addComponent(BlockInputEvents);
    this.rect(140, 62, 1054, 626, '#1E3835', '#E5CB8D', 16).addComponent(BlockInputEvents);
    this.rect(157, 74, 1020, 59, '#29483F', '#92784B', 10);
    this.text('背包', 184, 83, 31, '#F3DFAD', 190);
    this.rect(279, 105, 725, 2, '#B2945E');
    [287, 651, 995].forEach(x => this.text('◆', x - 10, 96, 12, '#E5CB8D', 20, 1));
    this.button('关闭', 1028, 79, 132, 48, true, close);
    this.rect(165, 143, 411, 472, '#DCCBA6', '#E5CB8D', 12);
    this.rect(176, 154, 389, 450, '#EFDFC0', '#9C8156', 9);
    this.text(BATTLE_RULES.hero.name, 176, 175, 24, '#4A2C1D', 389, 1);
    if (this.heroArt) this.image(218, 245, 305, 305, this.heroArt);
    this.text('金币  0', 176, 643, 22, '#F3DFAD', 180);

    const unavailable = (label: string) => () => {
      this.bookMessage = `${label}·未开放`;
      this.render();
    };
    const tab = (label: string, x: number, y: number, w: number, h: number, current: boolean) => {
      this.rect(x, y, w, h, current ? '#527561' : '#29463D',
        current ? '#FFD889' : '#92784B', 8, current ? undefined : unavailable(label));
      this.text(label, x, y + h / 2 - 16, 20, '#F3DFAD', w, 1);
    };
    tab('物品', 608, 143, 256, 36, true);
    tab('任务', 871, 143, 256, 36, false);
    this.rect(608, 183, 519, 418, '#172E2A', '#92784B', 12);
    tab('背包', 1126, 193, 68, 88, true);
    tab('仓库', 1126, 289, 68, 88, false);

    const inventory = this.progress.inventory;
    this.renderInventoryGrid(inventory);
    const id = this.inventoryItem;
    const hasSelection = !!id && inventory[id] > 0;
    if (hasSelection) this.text(`${ITEMS[id].name}  ·  ${ITEMS[id].description}`, 608, 603, 14, '#F3DFAD', 519);
    const notice = !this.onMap ? '战斗中只读'
      : this.bookMessage || (this.bagArtFailed ? '图标暂不可用，可按名称查看道具。' : '');
    if (notice) this.text(notice, 608, 623, 14, '#F4DC9C', 519);
    this.button('使用', 608, 644, 256, 37, hasSelection && this.onMap, () => {
      if (!this.onMap || !this.inventoryOpen || !id || id !== this.inventoryItem || !this.progress.inventory[id]) return;
      this.bookMessage = '';
      this.inventoryChoosingPet = true;
      this.render();
    });
    this.button('整理', 871, 644, 256, 37, true, unavailable('整理'));
    if (this.inventoryChoosingPet && id) this.renderInventoryPets(id);
    this.renderBookConfirmation();
  }

  private renderInventoryGrid(inventory: Inventory): void {
    const ids = Object.keys(ITEMS).filter(id => inventory[id] > 0);
    const columns = 5, visibleRows = 5, slotSize = 74, gap = 8, pitch = slotSize + gap;
    const rows = Math.max(visibleRows, Math.ceil(ids.length / columns));
    const width = columns * pitch + gap, height = visibleRows * pitch + gap;
    const contentHeight = rows * pitch + gap;
    const panel = this.layer;
    const grid = new Node('bag-grid');
    panel.addChild(grid);
    this.pos(grid, 868, 183 + height / 2);
    grid.addComponent(UITransform).setContentSize(width, height);
    const content = new Node('bag-items');
    grid.addChild(content);
    const transform = content.addComponent(UITransform);
    transform.setContentSize(width, contentHeight);
    transform.setAnchorPoint(0.5, 1);
    content.setPosition(0, height / 2);
    if (rows > visibleRows) {
      grid.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
      const scroll = grid.addComponent(ScrollView);
      scroll.horizontal = false;
      scroll.vertical = true;
      scroll.elastic = false;
      scroll.content = content;
      scroll.scrollToOffset(new Vec2(0, Math.min(this.inventoryScrollY, contentHeight - height)));
      grid.on(ScrollView.EventType.SCROLLING, () => { this.inventoryScrollY = scroll.getScrollOffset().y; });
    } else this.inventoryScrollY = 0;

    this.layer = content;
    // Drawing helpers subtract the screen center. In this layer the origin is the grid's top center.
    const left = CONFIG.width / 2 - width / 2 + gap, top = CONFIG.height / 2 + gap;
    for (let i = 0; i < rows * columns; i++) {
      const id = ids[i], count = inventory[id] ?? 0;
      const x = left + i % columns * pitch, y = top + Math.floor(i / columns) * pitch;
      const selected = count > 0 && id === this.inventoryItem;
      const slot = this.rect(x, y, slotSize, slotSize, selected ? '#527561' : '#29463D',
        selected ? '#FFD889' : '#776A4C', 8, () => {
          this.inventoryItem = count > 0 ? id : undefined;
          this.bookMessage = '';
          this.render();
        });
      slot.name = `bag-slot-${i}`;
      if (!count) continue;
      const skill = id.startsWith('book:') ? id.slice(5) : undefined;
      const art = this.bagFrames.get(skill ? 'book' : id);
      const emblem = skill ? this.bagFrames.get(skill) : undefined;
      if (art) this.image(x + 11, y + 6, 52, 52, art);
      else this.text(ITEMS[id].name, x + 2, y + 28, 11, '#F3DFAD', 70, 1);
      if (emblem) this.image(x + 27, y + 21, 20, 20, emblem);
      const large = count > 999999999;
      this.text(String(count), x + 2, y + (large ? 60 : 53), large ? 8 : 15, '#FFF2C5', 68, 2);
    }
    this.layer = panel;
  }

  private renderInventoryPets(item: string): void {
    const cancel = () => { this.inventoryChoosingPet = false; this.render(); };
    this.rect(0, 0, CONFIG.width, CONFIG.height, '#000000', '', 0, cancel, 180).addComponent(BlockInputEvents);
    this.rect(331, 197, 672, 356, '#1E3835', '#E5CB8D', 14).addComponent(BlockInputEvents);
    this.text('选择使用道具的灵兽', 363, 221, 28, '#F3DFAD', 600);
    this.text(ITEMS[item].name, 363, 259, 20, '#D3C7A5', 600);
    this.progress.roster.entries.forEach((pet, i) => {
      const x = 364 + i % 2 * 306, y = 295 + Math.floor(i / 2) * 58;
      this.drawPetPortrait(pet, x + 26, y + 24, 46);
      this.button(`${i + 1}. ${pet.name}`, x + 53, y, 205, 46, true, () => {
        if (!this.onMap || !this.inventoryOpen || !this.inventoryChoosingPet || this.inventoryItem !== item) return;
        this.inventoryChoosingPet = false;
        this.inventoryPet = pet.id;
        if (item.startsWith('book:')) this.beginSkillBook();
        else this.beginRejuvenation();
      });
    });
    this.button('返回', 589, 484, 156, 46, true, cancel);
  }

  private renderDropMode(): void {
    if (!this.devPreview || !this.usesTestProgress) return;
    const x = this.onMap ? 25 : 465, y = this.onMap ? 270 : 175;
    this.button(`下场掉率：${this.progress.dropMode === 'test' ? '测试' : '正式'}`, x, y, 270, 48,
      !this.playing && !this.rosterOpen, () => {
        this.stopTown();
        this.progress.dropMode = this.progress.dropMode === 'test' ? 'formal' : 'test';
        this.render();
      }).addComponent(BlockInputEvents);
    const caption = (test: boolean) => test ? '测试掉率：技能书50%／还童露30%／变异还童露10%' : '正式掉率：技能书8%／还童露3%／变异还童露1%';
    this.rect(x - 5, y + 49, 850, this.onMap ? 34 : 62, '#18312F', '', 6, undefined, 230).addComponent(BlockInputEvents);
    this.text(`下场 ${caption(this.progress.dropMode === 'test')}`, x, y + 52, 18, '#F4DC9C', 820);
    if (!this.onMap) this.text(`本场已锁定 ${caption(this.battle.dropMode === 'test')}`, x, y + 79, 18, '#F4DC9C', 850);
  }

  private restartBattle(battle: Battle): void {
    this.stopPotentialRepeat();
    this.battle = battle;
    this.choosingTarget = null;
    this.spellOpen = false;
    this.displayedMana = null;
    this.displayedHp = null;
    this.displayedDeployment = null;
    this.displayedLeft = null;
    this.detailsOpen = null;
    this.allocationPreview = undefined;
    this.summonOpen = false;
    this.rosterOpen = false;
    this.selectedPetId = null;
    this.releasePrompt = undefined;
    this.animationQueue = [];
    this.displayedLogEnd = undefined;
    this.playing = false;
    this.resultCandidate = undefined;
    this.resultDrops = undefined;
    this.inventoryOpen = false;
    this.resultSaved = false;
  }

  private startFixedBattle(): void {
    const town = this.town;
    if (!this.onMap || this.mapHidden || this.returningTown || !town || town.region !== 'outskirts' || town.loading || !town.frame
      || !this.enabledInHierarchy || this.progressReadFailed || this.detailsOpen || this.rosterOpen) return;
    town.stop();
    town.error = '';
    this.returnPoint = { ...town.movement.position };
    this.postBattle = undefined;
    this.returnMessage = '';
    const sample = this.devPreview ? queryParams().get('roundTripSample') : null;
    const fixed = ['single', 'pair', 'defeat'].includes(sample ?? '');
    const battle = fixed
      ? new Battle(() => 0, sample === 'pair' ? 2 : 1, 0, this.progress, () => 1,
        () => 0.5, () => 0.5, () => 0.5, () => 1, () => 0)
      : new Battle(Math.random, undefined, 0, this.progress);
    if (sample === 'defeat') for (const enemy of battle.enemies) {
      enemy.attack = 10000;
      enemy.speed = 10000;
    }
    this.mapBattle = true;
    town.root.active = false;
    this.restartBattle(battle);
    this.render();
  }

  private finishBattle(): void {
    if (this.onMap || this.playing || this.battle.phase !== 'ended' || this.resultSaved) return;
    try {
      if (this.progressReadFailed) throw new Error('读取失败，禁止覆盖原档');
      if (!this.resultCandidate) {
        const fresh = this.battle.battleId > this.progress.lastSettledId;
        this.resultDrops ??= fresh && this.battle.result === 'victory' ? rollDrops(this.battle.dropMode, this.dropRandom) : {};
        this.resultCandidate = progressSnapshot(this.progress, undefined, undefined, undefined,
          addInventory(this.progress.inventory, this.resultDrops), Math.max(this.progress.lastSettledId, this.battle.battleId));
      }
      if (this.usesTestProgress) {
        progressIO.write(progressStorage(), this.resultCandidate);
      }
    } catch {
      this.progressError = '保存失败，请重试保存；本场结果尚未保存。';
      this.render();
      return;
    }
    const saved = JSON.parse(this.resultCandidate);
    this.progress.inventory = saved.inventory;
    this.progress.lastSettledId = saved.lastSettledId;
    this.resultSaved = true;
    this.progressError = '';
    if (this.mapBattle) {
      const { result, earnedExp } = this.battle;
      this.returnMessage = result === 'victory' ? `战斗胜利 · 获得经验 ${earnedExp}`
        : result === 'escaped' ? '整队逃离 · 无本场经验' : '战败回城 · 气血法力回满';
      this.mapBattle = false;
      this.town!.root.active = true;
      this.town!.stop();
      if (result === 'defeat') {
        this.returningTown = true;
        this.town!.load('town');
      }
      else {
        this.town!.encounters.reset();
        this.town!.movement.position = { ...this.returnPoint! };
        this.town!.update(0);
        this.postBattle = { result, position: { ...this.returnPoint! } };
      }
    }
    this.render();
  }

  private get dropMessage(): string {
    const drops = Object.entries(this.resultDrops ?? {}).map(([id, count]) => `${ITEMS[id].name}×${count}`);
    return drops.length ? `获得 ${drops.join('、')}` : '未获得材料';
  }

  private clearView(): void {
    this.statusHpBars.clear();
    this.statusManaBars.clear();
    this.markerHpBars.clear();
    for (const child of [...this.node.children]) if (child.name !== 'Camera' && child !== this.town?.root) {
      child.active = false;
      child.destroy();
    }
  }

  private openHeroPanel(): void {
    if (this.playing || this.rosterOpen || this.summonOpen || this.confirmingTarget) return;
    this.detailsOpen = 'hero';
    this.heroPanelPage = 'basic';
    this.render();
  }

  private potentialButton(label: string, x: number, y: number, enabled: boolean,
    step: () => boolean): void {
    const node = this.text(label, x, y, 29, enabled ? '#4A2C1D' : '#8B8170', 40, 1);
    if (enabled) node.on(Node.EventType.TOUCH_START, () => this.potentialRepeat.start(step));
  }

  private renderHeroPanel(confirmed: HeroProgress): void {
    const close = () => {
      this.stopPotentialRepeat();
      this.allocationPreview = undefined;
      this.detailsOpen = null;
      this.render();
    };
    const showBasic = () => {
      this.stopPotentialRepeat(); this.allocationPreview = undefined;
      this.heroPanelPage = 'basic'; this.render();
    };
    this.rect(0, 0, CONFIG.width, CONFIG.height, '#101E1C', '', 0, undefined, 200).addComponent(BlockInputEvents);
    if (this.heroPanelPage === 'points') return this.renderHeroPoints(confirmed, showBasic, close);
    this.image(0, 0, CONFIG.width, CONFIG.height, this.characterBasicArt);
    const { level, exp, stats } = confirmed;
    const panel = heroPanel(stats);
    const hero = this.onMap ? { name: '撷灵客', hp: heroPanel(this.progress.heroProgress!.stats).maxHp } : this.battle.allies[0];
    const ink = '#4A2C1D';
    this.text('人物属性', 460, 1, 38, '#F7E8C1', 415, 1);
    this.text(hero.name, 160, 81, 26, ink, 160);
    this.text(`${level}级`, 160, 117, 24, ink, 160);
    this.rect(1240, 0, 64, 64, '#000000', '', 0, close, 0);
    this.text('属性', 1240, 160, 28, ink, 60, 1, showBasic);
    this.text('加点', 1240, 322, 28, ink, 60, 1, () => {
      this.heroPanelPage = 'points'; this.render();
    });
    const bars = [
      ['气血', `${hero.hp}/${panel.maxHp}`], ['法力', `${panel.maxMana}/${panel.maxMana}`],
      ['愤怒', '0/150'], ['体力', '100/100'], ['活力', '50/50'],
    ];
    bars.forEach(([name, value], index) => {
      this.text(name, 612, 82 + index * 40, 25, ink, 85);
      this.text(value, index === 4 ? 797 : 839, 86 + index * 40, 24, '#F7E8CF', 210, 1);
    });
    this.text('使用', 1123, 245, 23, ink, 80, 1);
    this.text('基础', 637, 292, 27, this.heroPanelPage === 'basic' ? ink : '#8B8170', 145, 1, () => {
      this.heroPanelPage = 'basic'; this.render();
    });
    this.text('高级', 831, 292, 27, this.heroPanelPage === 'advanced' ? ink : '#8B8170', 145, 1, () => {
      this.heroPanelPage = 'advanced'; this.render();
    });
    if (this.heroPanelPage === 'advanced') return;
    const xp = level === HERO_PROGRESSION.maxLevel ? '已满级' : `${exp}/${levelUpExp(level)}`;
    const basics = [
      ['伤害', panel.attack, 636, 373], ['防御', panel.defense, 938, 373],
      ['速度', panel.speed, 636, 429], ['躲避', panel.dodge, 938, 429],
      ['灵力', panel.spirit, 636, 487],
    ] as const;
    basics.forEach(([name, value, x, y]) => {
      this.text(name, x, y, 25, ink, 90);
      this.text(String(value), x + 181, y, 25, ink, 80, 1);
    });
    this.text('升级经验', 610, 620, 21, ink, 90);
    this.text(xp, 845, 619, 24, '#F7E8CF', 210, 1);
  }

  private renderHeroPoints(confirmed: HeroProgress, showBasic: () => void, close: () => void): void {
    const ink = '#4A2C1D';
    const hero = this.onMap ? { name: '撷灵客', hp: heroPanel(this.progress.heroProgress!.stats).maxHp } : this.battle.allies[0];
    this.image(0, 0, CONFIG.width, CONFIG.height, this.characterPointsArt);
    this.text('人物属性', 460, 27, 38, '#F7E8C1', 415, 1);
    this.text(hero.name, 209, 112, 26, ink, 165);
    this.text(`${confirmed.level}级`, 209, 153, 24, ink, 165);
    this.rect(1215, 31, 62, 62, '#000000', '', 0, close, 0);
    this.rect(1215, 126, 62, 149, '#000000', '', 0, showBasic, 0);
    ['属', '性', '加', '点'].forEach((char, i) =>
      this.text(char, 1215, [168, 203, 318, 353][i], 26, ink, 62, 1));

    const portrait = new Node('hero-points-portrait');
    this.layer.addChild(portrait);
    this.pos(portrait, 145, 154);
    portrait.addComponent(UITransform).setContentSize(88, 86);
    portrait.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    this.image(-5, 92, 300, 300, this.heroArt).node.setParent(portrait, true);

    const { panel, delta } = heroPanelPreview(confirmed, this.allocationPreview);
    const rows = [
      ['气血', 'maxHp', `${this.onMap ? panel.maxHp : hero.hp}/${panel.maxHp}`], ['法力', 'maxMana', `${panel.maxMana}/${panel.maxMana}`],
      ['伤害', 'attack', panel.attack], ['防御', 'defense', panel.defense], ['速度', 'speed', panel.speed],
      ['躲避', 'dodge', panel.dodge], ['灵力', 'spirit', panel.spirit],
    ] as const;
    this.text('属性实时预览', 215, 216, 26, ink, 224, 1);
    rows.forEach(([name, key, value], index) => {
      const y = 284 + index * 54.3;
      this.text(name, 115, y, 24, ink, 100);
      this.text(String(value), 269, y, 24, ink, 132, 1);
      this.text(delta(key), 450, y, 24, '#38652A', 102, 1);
    });
    this.renderAllocation(confirmed, close, draft => this.confirmHeroPoints(draft));
  }

  private renderAllocation(confirmed: LevelProgress, close: () => void,
    confirm: (draft: LevelProgress) => boolean, kind: 'hero' | 'pet' = 'hero'): void {
    const pet = kind === 'pet';
    const { stats, potential } = this.allocationPreview ?? confirmed;
    const editable = !this.inBattle && this.usesTestProgress && !this.progressReadFailed;
    const names = ['体质', '法力', '力量', '耐力', '敏捷'];
    BASE_STAT_KEYS.forEach((key, index) => {
      const y = pet ? 224 + index * 50 : 131 + index * 69.8;
      if (pet) {
        this.text(names[index], 608, y + 6, 21, '#4A2C1D', 105, 1);
        this.text(String(stats[key]), 854, y + 6, 21, '#4A2C1D', 85, 1);
      } else {
        this.text(names[index], 630, y + 3, 25, '#4A2C1D', 110, 1);
        this.text(String(stats[key]), 833, y + 5, 23, '#4A2C1D', 96, 1);
      }
      const adjust = (change: 1 | -1): boolean => {
        if (this.inBattle || this.progressReadFailed) return false;
        const previous = this.allocationPreview ?? confirmed;
        const next = adjustPotential(confirmed, previous, key, change);
        if (next === previous) return false;
        this.allocationPreview = next;
        this.render();
        return change === 1 ? next.potential > 0 : next.stats[key] > confirmed.stats[key];
      };
      const canRemove = editable && stats[key] > confirmed.stats[key];
      const canAdd = editable && potential > 0;
      this.potentialButton('－', pet ? 790 : 1012, y, canRemove, () => adjust(-1));
      this.potentialButton('＋', pet ? 957 : 1098, y, canAdd, () => adjust(1));
    });
    if (pet) {
      this.text('剩余潜能', 630, 495, 22, '#4A2C1D', 240, 1);
      this.text(String(potential), 824, 495, 22, '#4A2C1D', 100, 1);
    } else {
      this.text('剩余潜能', 645, 510, 24, '#4A2C1D', 135);
      this.text(String(potential), 826, 510, 24, '#F7E8CF', 280, 1);
    }
    this.text(this.progressError || (editable ? '' : '战斗结束后可分配潜能'),
      pet ? 535 : 635, pet ? 624 : 672, 17, '#4A2C1D', 524, 1);
    this.text('取消', pet ? 585 : 650, pet ? 568 : 606, 28, '#4A2C1D', pet ? 185 : 210, 1, close);
    const commit = () => {
      this.stopPotentialRepeat();
      if (!this.allocationPreview) return;
      try {
        if (confirm(this.allocationPreview)) {
          this.allocationPreview = undefined;
          this.progressError = '';
        }
      } catch {
        this.progressError = '本地进度保存失败。';
      }
      this.render();
    };
    const canConfirm = editable && potential < confirmed.potential;
    this.text('确认', pet ? 828 : 932, pet ? 568 : 606, 28, canConfirm ? '#4A2C1D' : '#8B8170',
      pet ? 185 : 212, 1, canConfirm ? commit : undefined);
  }

  private renderHeroProgress(): void {
    const progress = this.battle.heroProgress;
    if (!progress || this.playing) return;
    const { level, exp, stats, potential } = progress;
    const { maxHp, maxMana, attack, defense, speed, dodge, spirit } = heroPanel(stats);
    const xp = level === HERO_PROGRESSION.maxLevel ? '已满级' : `${exp}/${levelUpExp(level)}`;
    this.rect(24, 167, 367, this.progressError ? 133 : 109, '#18312F', '', 9, undefined, 230);
    this.text(`人物进度 · 等级 ${level} · 经验 ${xp} · 潜能 ${potential}`, 36, 176, 19, '#F4DC9C', 345);
    this.text(`体质 ${stats.constitution}  法力 ${stats.mana}  力量 ${stats.strength}  耐力 ${stats.endurance}  敏捷 ${stats.agility}`, 36, 204, 16, '#FFFFFF', 345);
    this.text(`气血 ${this.battle.allies[0].hp}/${maxHp}    法力 ${maxMana}/${maxMana}`, 36, 227, 16, '#FFFFFF', 345);
    this.text(`伤害 ${attack}   防御 ${defense}   速度 ${speed}   躲避 ${dodge}   灵力 ${spirit}`, 36, 249, 16, '#FFFFFF', 345);
    if (this.progressError) this.text(this.progressError, 36, 274, 16, '#F4DC9C', 345);
  }

  private get mapBlocked(): boolean {
    return !this.enabledInHierarchy || this.mapHidden || this.returningTown || !!this.detailsOpen || this.rosterOpen || this.progressReadFailed;
  }

  private renderTown(): void {
    const town = this.town!;
    if (this.detailsOpen || this.rosterOpen) town.stop();
    this.clearView();
    const overlay = new Node('town-ui');
    this.node.addChild(overlay);
    this.layer = overlay;
    const openPets = () => {
      this.inventoryOpen = false;
      this.rosterOpen = true;
      this.openPetPanel(this.progress.selectedPetId);
    };
    const travel = () => { town.load(town.destination); this.render(); };
    town.draw(this.heroArt, () => this.mapBlocked,
      place => {
        if (place.id === 'pet') openPets();
        else if (place.id === 'bag') this.openInventory();
        else if (place.id === 'exit') travel();
        else if (place.id === 'fuse') this.openFusion();
        else {
          town.error = `${place.name}·未开放`;
          this.render();
        }
      });
    this.rect(20, 18, 470, 52, '#203D36', '', 10, undefined, 220).addComponent(BlockInputEvents);
    this.text(town.message || this.progressError || this.returnMessage || (town.region === 'town' ? '城里' : '野外'), 30, 24, 24);
    if (this.postBattle?.result === 'victory') {
      this.rect(320, 625, 980, 42, '#18312F', '', 6, undefined, 230).addComponent(BlockInputEvents);
      this.text(this.dropMessage, 335, 631, 21, '#F4DC9C', 950);
    }
    if (town.canRetry) this.button('重试', 540, 335, 250, 60, !town.loading, () => { town.load(); this.render(); });
    if (this.progressReadFailed) {
      this.button('重试读取/迁移', 490, 335, 350, 60, true, () => this.retryProgress()).addComponent(BlockInputEvents);
      this.text(this.progressError, 120, 410, 20, '#F4DC9C', 1100);
      return;
    }
    if (!town.frame) return;
    if (this.returningTown) {
      this.button('重试回城', 540, 335, 250, 60, !town.loading, () => town.load('town')).addComponent(BlockInputEvents);
      return;
    }
    if (town.region === 'outskirts') {
      if (this.devPreview) this.button('固定开战（测试）', 25, 90, 270, 56, !town.loading,
        () => this.startFixedBattle()).addComponent(BlockInputEvents);
      this.button(this.auto.enabled ? '自动：开' : '自动：关', 25, 155, 190, 56, !town.loading, () => {
        town.stop();
        this.auto.toggle();
        this.render();
      }).addComponent(BlockInputEvents);
      const sample = this.devPreview ? queryParams().get('roundTripSample') : null;
      if (sample) this.text(`验收样本：${sample}（同档）`, 25, 220, 20);
    }
    const pet = this.progress.roster.entries.find(p => p.id === this.progress.selectedPetId);
    const hero = this.progress.heroProgress;
    const maxHp = hero ? heroPanel(hero.stats).maxHp : BATTLE_RULES.hero.hp;
    this.statusCard('pet', 906, pet && { ...pet, hp: pet.maxHp });
    this.statusCard('hero', 1102, { id: 'hero', name: BATTLE_RULES.hero.name, hp: maxHp, maxHp });
    this.renderDropMode();
    const entries = ['人物', '宠物', '背包', '合宠', town.region === 'town' ? '出城' : '回城'];
    entries.forEach((name, i) => {
      const enabled = !town.loading;
      this.button(name, 444 + i * 172, 678, 164, 56, enabled, () => {
        if (!this.enabledInHierarchy || town.loading) return;
        town.stop();
        if (i === 0) this.openHeroPanel();
        else if (i === 1) openPets();
        else if (i === 2) this.openInventory();
        else if (i === 3) this.openFusion();
        else travel();
      }).addComponent(BlockInputEvents);
    });
    if (this.rosterOpen) this.renderRosterList();
    if (this.detailsOpen && this.progress.heroProgress) this.renderHeroPanel(this.progress.heroProgress);
    if (this.releasePrompt) this.renderReleasePrompt(this.releasePrompt);
  }

  private render(): void {
    if (this.onMap) { this.renderTown(); return; }
    this.lastShownSecond = Math.ceil(this.battle.seconds);
    this.clearView();
    this.unitNodes.clear();
    this.shadowNodes.clear();
    this.markerNodes.clear();
    this.basePositions.clear();
    this.ringOpacities.clear();
    const background = new Node('background-layer');
    const interfaceLayer = new Node('interface-layer');
    const unitLayer = new Node('unit-layer');
    this.unitLayer = unitLayer;
    const markerLayer = new Node('unit-marker-layer');
    this.markerLayer = markerLayer;
    const hitLayer = new Node('target-hit-layer');
    const resultLayer = new Node('result-layer');
    for (const layer of [background, interfaceLayer, unitLayer, markerLayer, hitLayer, resultLayer]) this.node.addChild(layer);
    this.layer = background;
    this.image(0, 0, CONFIG.width, CONFIG.height, this.battleBackground);
    this.layer = interfaceLayer;
    if (this.layoutTest) {
      this.rect(24, 16, 450, 76, '#18312F', '', 10, undefined, 190);
      this.text('10V10 站位测试 · 仅显示', 40, 30, 28, '#F3E5BC', 425);
      const units = this.layoutUnits();
      this.layer = unitLayer;
      for (const unit of units) this.unitShadow(unit);
      for (const unit of [...units].sort((a, b) => this.unitPoint(a).y - this.unitPoint(b).y)) this.unitVisual(unit);
      this.layer = markerLayer;
      for (const unit of units) this.unitInfo(unit);
      return;
    }
    this.rect(24, 16, 285, 77, '#18312F', '', 10, undefined, 190);
    this.text('青丘灵录', 35, 24, 31, '#f3e5bc', 240);
    this.text('林间遭遇', 35, 65, 19, '#afc8ae', 280);
    let speedButton: Node;
    speedButton = this.button(this.speedMultiplier === 1 ? '×1' : '×2',
      315, 31, 128, 52, true, () => {
        this.speedMultiplier = this.speedMultiplier === 1 ? CONFIG.animation.fastMultiplier : 1;
        speedButton.getChildByName('button-label')!.getComponent(Label)!.string =
          this.speedMultiplier === 1 ? '×1' : '×2';
        glow.active = this.speedMultiplier !== 1;
      });
    const glow = new Node('speed-highlight');
    speedButton.addChild(glow);
    const gold = glow.addComponent(Graphics);
    gold.strokeColor = C('#FFD889');
    gold.lineWidth = 5;
    gold.roundRect(-66, -28, 132, 56, 14);
    gold.stroke();
    glow.active = this.speedMultiplier !== 1;
    this.rect(449, 24, 340, 76, '#243d3c', '#b5a777', 12);
    this.text(`第 ${this.battle.round} 回合`, 460, 34, 27, '#f1e4bd', 145, 1);
    this.text(this.playing ? '战斗进行中' : this.battle.phase === 'ended' ? '战斗结束'
      : `指令 ${this.lastShownSecond} 秒`, 605, 35, 25, '#f4cf89', 170, 1);
    const visiblePet = this.battle.pets.find(u => (this.displayedDeployment?.get(u.id) ?? u.deployed) && !u.left);
    this.statusCard('pet', 906, visiblePet);
    this.statusCard('hero', 1102, this.battle.allies[0]);
    const units = this.battle.units.filter(u => (this.displayedDeployment?.get(u.id) ?? u.deployed)
      && !(this.displayedLeft?.get(u.id) ?? u.left));
    this.layer = unitLayer;
    for (const unit of units) this.unitShadow(unit);
    // Screen y is measured from the top; units with lower feet are drawn later.
    for (const unit of [...units].sort((a, b) => this.unitPoint(a).y - this.unitPoint(b).y)) this.unitVisual(unit);
    this.layer = markerLayer;
    for (const unit of units) this.unitInfo(unit);
    this.layer = hitLayer;
    if (!this.playing && !this.rosterOpen) this.renderHitAreas(units);
    this.layer = interfaceLayer;
    this.renderLog();
    this.renderHeroProgress();
    this.renderDropMode();
    if (!this.playing) this.button('背包', 345, 104, 115, 54, !this.confirmingTarget, () => this.openInventory());
    if (this.devPreview && this.usesTestProgress && !this.playing && !this.rosterOpen)
      this.button('测试重置', 200, 104, 136, 54, this.canResetProgress, () => this.resetTestProgress());
    if (this.battle.phase !== 'ended') this.autoButton();
    if (!this.playing) this.button(`携带 ${this.battle.roster.entries.length}/${this.battle.roster.capacity}`,
      25, 104, 165, 54, true, () => {
        this.inventoryOpen = false;
        this.choosingTarget = null;
        this.summonOpen = false;
        this.stopPotentialRepeat();
        this.rosterOpen = !this.rosterOpen;
        this.selectedPetId = null;
        this.petPanelPage = 'basic';
        this.allocationPreview = undefined;
        this.render();
      });
    if (this.battle.roster.full && !this.playing) this.text(`携带已满（${this.battle.roster.entries.length}/${this.battle.roster.capacity}），无法抓取`,
      470, 104, 20, '#F8D98A', 360, 1);
    this.rect(1095, 119, 218, 59, '#18312F', '', 9, undefined, 205);
    this.text(this.playing ? '战斗进行中' : this.battle.phase === 'ended'
      ? this.resultTitle
      : this.choosingTarget === 'attack' || this.choosingTarget === 'spell' ? '请选择敌方目标'
        : this.choosingTarget === 'capture' ? '请选择抓取目标'
        : this.choosingTarget === 'protect' ? '请选择我方目标'
          : `请为 ${this.battle.pending[0]?.name ?? ''} 下达指令`,
      1105, 132, 18, '#F4DC9C', 200);
    const actor = this.battle.pending[0];
    if (!this.playing && !this.rosterOpen && this.battle.phase === 'command' && actor) {
      const send = (command: 'defend' | 'retreat' | 'flee') => {
        const before = this.battle.round;
        const phase = this.battle.phase;
        const hp = this.captureHp();
        const deployment = this.captureDeployment();
        this.battle.command(actor.id, command);
        this.choosingTarget = null;
        if (this.startPlayback(before, phase, hp, deployment)) return;
        this.render();
      };
      const select = (command: 'attack' | 'protect' | 'capture') => {
        this.choosingTarget = toggleTarget(this.choosingTarget, command);
        this.render();
      };
      const choices: { label: keyof typeof COMMAND_LAYOUT; enabled: boolean; action?: () => void }[] = actor.id === 'hero'
        ? [
          { label: '攻击', enabled: true, action: () => select('attack') },
          { label: '灵术', enabled: false },
          { label: '防御', enabled: true, action: () => send('defend') },
          { label: '保护', enabled: this.battle.protectTargets(actor.id).length > 0, action: () => select('protect') },
          { label: '召唤', enabled: this.battle.summonTargets().length > 0, action: () => { this.choosingTarget = null; this.summonOpen = true; this.render(); } },
          { label: '抓取', enabled: !this.battle.roster.full, action: () => select('capture') },
          { label: '道具', enabled: false },
          { label: '逃跑', enabled: true, action: () => send('flee') },
        ] : [
          { label: '攻击', enabled: true, action: () => select('attack') },
          { label: '灵术', enabled: true, action: () => {
            this.spellOpen = this.choosingTarget !== 'spell'; this.choosingTarget = null; this.render();
          } },
          { label: '保护', enabled: this.battle.protectTargets(actor.id).length > 0, action: () => select('protect') },
          { label: '防御', enabled: true, action: () => send('defend') },
          { label: '撤退', enabled: true, action: () => send('retreat') },
        ];
      choices.forEach(choice => {
        const { x, y } = COMMAND_LAYOUT[choice.label];
        this.commandButton(choice.label, x, y, choice.enabled, choice.action);
      });
    }
    if (this.spellOpen && actor && !this.playing && !this.rosterOpen) {
      this.layer = resultLayer;
      this.renderSpellList(actor);
    }
    if (this.summonOpen && actor?.id === 'hero' && !this.playing && !this.rosterOpen) {
      this.layer = resultLayer;
      this.renderSummonList(actor.id);
    }
    if (!this.playing && this.battle.phase === 'ended') {
      this.layer = resultLayer;
      this.rect(391, 233, 540, 249, '#1e3835', '#e5cb8d', 15);
      this.text(this.resultTitle, 441, 260, 48, '#f3dfad', 440, 1);
      const { earnedExp, levelsGained } = this.battle;
      this.text(this.battle.heroProgress && this.battle.winner === 'ally'
        ? `本场获得经验 ${earnedExp}` : '林间遭遇暂告一段落', 470, 322, 22, '#c6dbc6', 380, 1);
      if (levelsGained) this.text(`升 ${levelsGained} 级 · 每级五项各 +1、潜能 +5`, 425, 352, 20, '#F4DC9C', 466, 1);
      if (this.resultSaved) this.text(this.dropMessage, 340, 490, 21, '#F4DC9C', 660, 1);
      this.button(this.resultSaved ? '再来一场' : '重试保存', 513, 384, 286, 69, true, () => {
        if (!this.resultSaved) { this.finishBattle(); return; }
        const { session, heroRage } = this.battle;
        this.restartBattle(this.createBattle(session, heroRage));
        this.render();
      });
    }
    if (this.rosterOpen && !this.playing) {
      this.layer = resultLayer;
      this.renderRosterList();
      if (this.releasePrompt) this.renderReleasePrompt(this.releasePrompt);
    }
    if (this.detailsOpen === 'hero' && this.battle.heroProgress && !this.playing) {
      this.layer = resultLayer;
      this.renderHeroPanel(this.battle.heroProgress);
    }
  }
}
