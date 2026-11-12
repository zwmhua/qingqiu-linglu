import { _decorator, BlockInputEvents, Color, Component, EventTouch, Graphics, Label, Mask, Node, RichText, Sprite, SpriteFrame, tween, Tween, UIOpacity, UITransform, Vec3, view } from 'cc';
import { Battle, BattleEvent, Unit } from './Battle';
import { COMMAND_ICON_SIZE, COMMAND_LAYOUT, CONFIG } from './config';
import { targetCommand, toggleTarget } from '../logic/targeting';
import { AutoCommands } from '../logic/auto';
import { PREVIEW } from 'cc/env';
import { APTITUDE_KEYS } from '../logic/aptitude';
import { BASE_STAT_KEYS } from '../logic/base-stats';
import { petTint } from '../logic/pet-visual';
import type { Roster } from '../logic/roster';
import { petProgress } from '../logic/roster';
import type { HeroProgress, LevelProgress } from '../logic/hero-progress';
import { HERO_PROGRESSION, adjustPotential, heroPanel, initialHero, levelUpExp } from '../logic/hero-progress';
import { HoldRepeat } from '../logic/hold-repeat';
import { readProgress, resetProgress, saveProgress } from '../logic/local-progress';
import type { TargetMode } from '../logic/targeting';

const { ccclass, property } = _decorator;
const POTENTIAL_RELEASE_EVENTS = ['pointerup', 'pointercancel', 'pointerout', 'mouseup', 'touchend', 'touchcancel', 'blur'] as const;
const C = (hex: string) => new Color(hex);
const COMMAND_NAMES = ['攻击', '防御', '保护', '召唤', '抓取', '道具', '逃跑', '灵术', '撤退'] as const;

@ccclass('BattleView')
export class BattleView extends Component {
  @property(SpriteFrame) battleBackground: SpriteFrame | null = null;
  @property(SpriteFrame) heroArt: SpriteFrame | null = null;
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
  private progressError = '';
  private progressReadFailed = false;
  private layoutTest = new URLSearchParams(window.location.search).get('layout') === '10v10';
  private choosingTarget: TargetMode | null = null;
  private lastShownSecond = -1;
  private layer!: Node;
  private markerLayer!: Node;
  private unitLayer!: Node;
  private unitNodes = new Map<string, Node>();
  private shadowNodes = new Map<string, Node>();
  private markerNodes = new Map<string, Node>();
  private basePositions = new Map<string, Vec3>();
  private ringOpacities = new Map<string, UIOpacity>();
  private confirmingTarget = false;
  private displayedHp: Map<string, number> | null = null;
  private animationQueue: BattleEvent[] = [];
  private displayedDeployment: Map<string, boolean> | null = null;
  private displayedLeft: Map<string, boolean> | null = null;
  private summonOpen = false;
  private rosterOpen = false;
  private selectedPetId: string | null = null;
  private detailsOpen: 'pet' | 'hero' | null = null;
  private allocationPreview?: LevelProgress;
  private readonly potentialRepeat = new HoldRepeat();
  private stopPotentialRepeat = (event?: Event): void => {
    if (event?.type === 'pointerout' && (event as PointerEvent).relatedTarget) return;
    this.potentialRepeat.stop();
  };
  private playing = false;
  private speedMultiplier = 1;
  private auto = new AutoCommands();

  private get usesTestProgress(): boolean {
    const params = new URLSearchParams(window.location.search);
    return !this.layoutTest && !(PREVIEW && (params.get('mutationSample') === '1' || params.get('babySample') === '1'));
  }

  private createBattle(previous?: Pick<Roster, 'entries'>, rage = 0,
    hero = initialHero(), selectedPetId?: string): Battle {
    const params = new URLSearchParams(window.location.search);
    if (PREVIEW && params.get('mutationSample') === '1')
      return new Battle(previous ? () => 0.9 : () => 0, 1, rage, previous, () => 1,
        Math.random, Math.random, Math.random, () => 0, undefined, { hero, selectedPetId });
    if (PREVIEW && params.get('babySample') === '1') return new Battle(() => 0, 1, rage, previous,
      undefined, undefined, undefined, undefined, undefined, undefined, { hero, selectedPetId });
    return new Battle(Math.random, undefined, rage, previous, undefined,
      undefined, undefined, undefined, undefined, undefined, { hero, selectedPetId });
  }

  onEnable(): void {
    // The canvas survives the redraw that replaces the pressed button.
    for (const event of POTENTIAL_RELEASE_EVENTS) window.addEventListener(event, this.stopPotentialRepeat, true);
  }

  onDisable(): void {
    for (const event of POTENTIAL_RELEASE_EVENTS) window.removeEventListener(event, this.stopPotentialRepeat, true);
    this.stopPotentialRepeat();
  }

  start(): void {
    let saved: ReturnType<typeof readProgress> = null;
    if (this.usesTestProgress) {
      try { saved = readProgress(window.localStorage, CONFIG.maxCarriedPets); }
      catch {
        this.progressReadFailed = true;
        this.progressError = '本地进度读取失败，可使用测试重置。';
      }
    }
    this.battle = this.createBattle(saved ? { entries: saved.pets } : undefined, 0, saved?.hero, saved?.selectedPetId);
    if (!saved) this.persistProgress();
    view.setDesignResolutionSize(CONFIG.width, CONFIG.height, 4);
    this.render();
  }

  private persistProgress(): void {
    if (!this.usesTestProgress || this.progressReadFailed) return;
    try {
      saveProgress(window.localStorage, this.battle);
      this.progressError = '';
    } catch {
      this.progressError = '本地进度保存失败。';
    }
  }

  private resetTestProgress(): void {
    if (this.confirmingTarget || !window.confirm('清除本游戏的测试进度并重新开始？')) return;
    try { resetProgress(window.localStorage, true); }
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
    if (this.layoutTest) return;
    if (this.playing) { this.syncMovingUnits(); return; }
    if (this.confirmingTarget || this.rosterOpen) return;
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
      hit.on(Node.EventType.TOUCH_END, () => { node.setScale(1, 1, 1); onClick(); });
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
      if (this.confirmingTarget) return;
      this.auto.toggle();
      this.choosingTarget = null;
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
  private isPet(unit: Unit): boolean { return unit.id.startsWith('pet') || unit.id.startsWith('caught-') || unit.id.startsWith('layout-pet-'); }

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
    if (this.layoutTest || this.summonOpen || this.rosterOpen) return false;
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
    if (!this.playing && this.canSelect(unit)) visual.on(Node.EventType.TOUCH_END, () => this.chooseTarget(unit.id));
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
    const height = (this.isHero(unit) ? CONFIG.visual.heroHeight : CONFIG.visual.frogHeight)
      * CONFIG.visual.unitScale;
    const headX = point.x + (this.isHero(unit) ? v.heroHeadOffsetX : 0);
    const barX = headX - v.barWidth / 2;
    const healthY = point.y - height - v.headGap - v.barHeight - (unit.side === 'ally' ? v.barHeight + v.barGap : 0);
    const targetClick = targetable ? () => this.chooseTarget(unit.id) : undefined;
    const bar = (y: number, fillWidth: number, color: string) => {
      this.rect(barX - 1, y - 1, v.barWidth + 2, v.barHeight + 2, '#142322', '', 2, targetClick);
      this.rect(barX, y, v.barWidth, v.barHeight, '#42524E', '', 1, targetClick);
      if (fillWidth > 0) this.rect(barX, y, fillWidth, v.barHeight, color, '', 1, targetClick);
    };
    bar(healthY, v.barWidth * (this.displayedHp?.get(unit.id) ?? unit.hp) / unit.maxHp, '#D95757');
    if (unit.side === 'ally') bar(healthY + v.barHeight + v.barGap, v.barWidth, '#559DD8');
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
    const units = [...this.unitNodes.entries()].sort((a, b) => b[1].position.y - a[1].position.y);
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
        this.battle.command(actor.id, command, id);
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

  private startPlayback(round: number, phase: string, hp: Map<string, number>, deployment: Map<string, boolean>): boolean {
    if (round === this.battle.round && phase === this.battle.phase) return false;
    if (this.battle.phase === 'ended' || this.battle.events.some(event =>
      event.kind === 'summon' || event.kind === 'captureSuccess')) this.persistProgress();
    if (this.battle.events.length === 0) return false;
    this.displayedHp = hp;
    this.displayedDeployment = deployment;
    this.displayedLeft = new Map(this.battle.units.map(unit => [unit.id, unit.left]));
    for (const event of this.battle.events) if (event.kind === 'captureSuccess') this.displayedLeft.set(event.targetId, false);
    this.animationQueue = [...this.battle.events];
    this.playing = true;
    this.render();
    this.playNextAttack();
    return true;
  }

  private damageNumber(id: string, damage: number): void {
    if (damage <= 0) return;
    const point = this.unitPoint(this.battle.units.find(unit => unit.id === id)!);
    const previous = this.layer;
    this.layer = this.markerLayer;
    const number = this.text(`-${damage}`, point.x - 45, point.y - 126, 26, '#F9D177', 90, 1);
    this.layer = previous;
    const label = number.getComponent(Label)!;
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = C('#36291F');
    label.outlineWidth = 2;
    const opacity = number.addComponent(UIOpacity);
    const duration = CONFIG.animation.floatSeconds / this.speedMultiplier;
    tween(number).to(duration, { position: new Vec3(number.position.x,
      number.position.y + CONFIG.animation.floatDistance, 0) }).start();
    tween(opacity).to(duration, { opacity: 0 }).call(() => number.destroy()).start();
  }

  private playNextAttack(): void {
    const event = this.animationQueue.shift();
    if (!event) {
      this.playing = false;
      this.displayedHp = null;
      this.displayedDeployment = null;
      this.displayedLeft = null;
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
    if (event.kind !== 'attack') {
      if (event.kind === 'captureSuccess') this.displayedLeft!.set(event.targetId, true);
      this.render();
      this.playNextAttack();
      return;
    }
    const actor = this.unitNodes.get(event.actorId)!;
    const target = this.unitNodes.get(event.targetId)!;
    const actorPoint = this.unitPoint(this.battle.units.find(unit => unit.id === event.actorId)!);
    const targetPoint = this.unitPoint(this.battle.units.find(unit => unit.id === event.targetId)!);
    const length = Math.hypot(targetPoint.x - actorPoint.x, targetPoint.y - actorPoint.y);
    const dx = (targetPoint.x - actorPoint.x) / length;
    const dy = (targetPoint.y - actorPoint.y) / length;
    const a = CONFIG.animation;
    const speed = this.speedMultiplier;
    const origin = actor.position.clone();
    const arrival = new Vec3(origin.x + targetPoint.x - actorPoint.x - dx * a.approachDistance,
      origin.y - (targetPoint.y - actorPoint.y - dy * a.approachDistance), 0);
    const strike = new Vec3(arrival.x + dx * a.lungeDistance,
      arrival.y - dy * a.lungeDistance, 0);
    actor.setScale(dx < 0 ? Math.abs(actor.scale.x) : -Math.abs(actor.scale.x), actor.scale.y, 1);
    tween(actor).to(a.runSeconds / speed, { position: arrival }).call(() => {
      const sprite = target.getComponent(Sprite)!;
      sprite.color = C('#FF7777');
      const targetOrigin = target.position.clone();
      tween(target).to(a.strikeSeconds / (2 * speed), { position: new Vec3(
        targetOrigin.x + dx * a.knockbackDistance,
        targetOrigin.y - dy * a.knockbackDistance, 0) })
        .to(a.strikeSeconds / (2 * speed), { position: targetOrigin }).start();
      this.damageNumber(event.targetId, event.targetDamage);
      if (event.guardId && event.guardDamage) this.damageNumber(event.guardId, event.guardDamage);
    }).to(a.strikeSeconds / (2 * speed), { position: strike })
      .to(a.strikeSeconds / (2 * speed), { position: arrival }).call(() => {
        target.getComponent(Sprite)!.color = this.unitColor(this.battle.units.find(unit => unit.id === event.targetId)!);
        this.displayedHp!.set(event.targetId, event.targetAfter);
        if (event.guardId && event.guardAfter !== undefined) this.displayedHp!.set(event.guardId, event.guardAfter);
        for (const id of [event.targetId, event.guardId]) {
          if (!id || this.displayedHp!.get(id) !== 0) continue;
          const fallen = this.unitNodes.get(id);
          if (!fallen) continue;
          fallen.getComponent(Sprite)!.grayscale = true;
          tween(fallen.getComponent(UIOpacity)!).to(a.fadeSeconds / speed, { opacity: 0 }).start();
        }
      }).to(a.runSeconds / speed, { position: origin })
      .delay(Math.max(0, a.floatSeconds - a.strikeSeconds - a.runSeconds) / speed)
      .call(() => { this.render(); this.playNextAttack(); }).start();
  }

  private logLines(): { text: string; result: boolean }[] {
    const lines: { text: string; result: boolean }[] = [];
    for (const event of this.battle.log.slice(-4)) {
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

  private renderLog(): void {
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
  }

  private statusCard(kind: 'pet' | 'hero', x: number, unit: Unit | undefined): void {
    const y = 18;
    this.rect(x, y, 192, 104, '#203A37', '#829183', 9, () => {
      if (kind === 'hero' && this.battle.heroProgress) this.openHeroPanel();
      else {
        this.detailsOpen = this.detailsOpen === kind ? null : kind;
        this.render();
      }
    }, 215);
    if (unit) {
      const portrait = new Node(`portrait-${kind}`);
      this.layer.addChild(portrait);
      this.pos(portrait, x + 32, y + 36);
      portrait.addComponent(UITransform).setContentSize(48, 48);
      const mask = portrait.addComponent(Mask);
      mask.type = Mask.Type.ELLIPSE;
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
    const heroProgress = this.battle.heroProgress;
    const progress = kind === 'hero' ? heroProgress : this.battle.roster.entries.find(pet => pet.id === unit?.id);
    const mana = heroProgress ? heroPanel(heroProgress.stats).maxMana : CONFIG.status.heroManaMax;
    const bars = kind === 'hero'
      ? [
        { label: '气血', value: unit ? this.displayedHp?.get(unit.id) ?? unit.hp : 0, max: unit?.maxHp ?? 1, color: '#D95757' },
        { label: '法力', value: mana, max: mana, color: '#559DD8' },
        { label: '愤怒', value: this.battle.heroRage, max: CONFIG.status.rageMax, color: '#EBA14F' },
        { label: '经验', value: progress?.exp ?? 0, max: progress ? levelUpExp(progress.level) : 1, color: '#E6C95C' },
      ]
      : [
        { label: '气血', value: unit ? this.displayedHp?.get(unit.id) ?? unit.hp : 0, max: unit?.maxHp ?? 1, color: '#D95757' },
        { label: '法力', value: unit ? CONFIG.status.petManaMax : 0, max: CONFIG.status.petManaMax, color: '#559DD8' },
        { label: '经验', value: progress?.exp ?? 0, max: progress ? levelUpExp(progress.level) : 1, color: '#E6C95C' },
      ];
    bars.forEach((bar, index) => {
      const by = y + 17 + index * 22;
      this.rect(x + 69, by, 112, 10, '#10201F', '#526562', 2);
      if (bar.value > 0) this.rect(x + 70, by + 1, 110 * bar.value / bar.max, 8, bar.color, '', 1);
      if (this.detailsOpen === kind && (kind === 'pet' || !progress)) {
        const value = bar.label !== '经验' ? `${bar.value}/${bar.max}`
          : !progress ? '待定'
            : progress.level === HERO_PROGRESSION.maxLevel ? '已满级' : `${bar.value}/${bar.max}`;
        this.text(`${bar.label} ${value}`, x + 69, by - 8, 13, '#FFFFFF', 114);
      }
    });
    this.text(unit ? `${unit.isMutated ? '变异' : ''}${unit.name}` : '暂无出战宝宝', x + 8, y + 79, 15, '#F4E9C8', 180);
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

  private renderRosterList(): void {
    const roster = this.battle.roster;
    const selected = roster.entries.find(pet => pet.id === this.selectedPetId);
    if (selected) {
      const confirmed = petProgress(selected);
      const stats = this.allocationPreview?.stats ?? confirmed.stats;
      const xp = selected.level === HERO_PROGRESSION.maxLevel ? '已满级' : `${selected.exp}/${levelUpExp(selected.level)}`;
      this.rect(361, 120, 612, 489, '#1E3835', '#E5CB8D', 14).addComponent(BlockInputEvents);
      this.text(`${selected.isMutated ? '变异' : ''}${selected.name} Lv.${selected.level}`, 399, 138, 30, '#F3DFAD', 530, 1);
      this.image(885, 132, 58, 58, this.petArt(selected)).sprite.color = this.unitColor(selected);
      this.rect(655, 197, 1, 313, '#829183');
      this.text(`身份  ${selected.isBaby ? '宝宝' : '普通'}`, 400, 195, 21);
      this.text(`升级经验  ${xp}`, 400, 226, 21);
      const labels = ['攻击资质', '防御资质', '体力资质', '法力资质', '躲避资质', '速度资质'];
      APTITUDE_KEYS.forEach((key, index) => this.text(`${labels[index]}  ${selected.aptitudes[key]}`, 400, 258 + index * 29, 19));
      this.text(`成长  ${selected.growth.toFixed(3)}`, 400, 434, 21);
      this.text(`总点数  ${BASE_STAT_KEYS.reduce((sum, key) => sum + stats[key], 0)}`, 400, 465, 20);
      const close = () => { this.selectedPetId = null; this.allocationPreview = undefined; this.render(); };
      this.button('返回携带', 405, 550, 140, 43, true, close);
      this.renderAllocation(confirmed, close, draft => this.battle.confirmPetAllocation(selected.id, draft,
        next => saveProgress(window.localStorage, this.battle, undefined, next)));
      return;
    }
    this.rect(439, 133, 455, 500, '#1E3835', '#E5CB8D', 14);
    this.text(`携带 ${roster.entries.length}/${roster.capacity}`, 475, 153, 30, '#F3DFAD', 385, 1);
    roster.entries.forEach((pet, index) => {
      const current = this.battle.pets.find(unit => unit.id === pet.id);
      const open = () => { this.selectedPetId = pet.id; this.render(); };
      this.rect(470, 202 + index * 65, 390, 54, '#294743', '', 6, open);
      this.text(`${pet.isMutated ? '变异' : ''}${pet.name} Lv.${pet.level} · ${pet.origin === 'initial' ? '初始' : '抓取获得'}`,
        478, 211 + index * 65, 22, '#F6F0DC', 370, 0, open);
      this.text(`气血 ${current?.hp ?? pet.hp}/${pet.maxHp}`,
        478, 238 + index * 65, 17, '#C6DBC6', 370, 0, open);
    });
    this.button('返回战斗', 539, 562, 255, 55, true, () => {
      this.rosterOpen = false; this.selectedPetId = null; this.render();
    });
  }

  private restartBattle(battle: Battle): void {
    this.stopPotentialRepeat();
    this.battle = battle;
    this.choosingTarget = null;
    this.displayedHp = null;
    this.displayedDeployment = null;
    this.displayedLeft = null;
    this.detailsOpen = null;
    this.allocationPreview = undefined;
    this.summonOpen = false;
    this.rosterOpen = false;
    this.selectedPetId = null;
    this.animationQueue = [];
  }

  private openHeroPanel(): void {
    if (this.playing || this.rosterOpen || this.summonOpen || this.confirmingTarget) return;
    this.detailsOpen = 'hero';
    this.render();
  }

  private potentialButton(label: string, x: number, y: number, enabled: boolean, step: () => boolean): void {
    const node = this.button(label, x, y, 58, 39, enabled);
    if (enabled) node.on(Node.EventType.TOUCH_START, () => this.potentialRepeat.start(step));
  }

  private renderHeroPanel(confirmed: HeroProgress): void {
    const { level, exp, stats } = this.allocationPreview ?? confirmed;
    const panel = heroPanel(stats);
    const hero = this.battle.allies[0];
    const close = () => {
      this.stopPotentialRepeat();
      this.allocationPreview = undefined;
      this.detailsOpen = null;
      this.render();
    };
    this.rect(0, 0, CONFIG.width, CONFIG.height, '#101E1C', '', 0, undefined, 125).addComponent(BlockInputEvents);
    this.rect(361, 120, 612, 489, '#1E3835', '#E5CB8D', 14);
    this.text('人物面板', 399, 138, 31, '#F3DFAD', 530, 1);
    this.rect(655, 197, 1, 313, '#829183');
    const xp = level === HERO_PROGRESSION.maxLevel ? '已满级' : `${exp}/${levelUpExp(level)}`;
    const rows = [`等级  ${level}`, `名称  ${hero.name}`, `气血  ${hero.hp}/${panel.maxHp}`,
      `法力  ${panel.maxMana}/${panel.maxMana}`, `伤害  ${panel.attack}`, `防御  ${panel.defense}`,
      `速度  ${panel.speed}`, `躲避  ${panel.dodge}`, `灵力  ${panel.spirit}`, `升级经验  ${xp}`];
    rows.forEach((row, index) => this.text(row, 400, 195 + index * 30, 21, '#F6F0DC', 233));
    this.button('关闭', 405, 550, 110, 43, true, close);
    this.renderAllocation(confirmed, close, draft => this.battle.confirmHeroAllocation(draft,
      next => saveProgress(window.localStorage, this.battle, next)), true);
  }

  private renderAllocation(confirmed: LevelProgress, close: () => void,
    confirm: (draft: LevelProgress) => boolean, allowHold = false): void {
    const { stats, potential } = this.allocationPreview ?? confirmed;
    const editable = this.battle.phase === 'ended' && this.usesTestProgress && !this.progressReadFailed;
    const names = ['体质', '法力', '力量', '耐力', '敏捷'];
    BASE_STAT_KEYS.forEach((key, index) => {
      const y = 197 + index * 51;
      this.text(`${names[index]}  ${stats[key]}`, 685, y + 7, 21, '#F6F0DC', 108);
      const adjust = (change: 1 | -1): boolean => {
        if (allowHold && (this.detailsOpen !== 'hero' || this.battle.heroProgress !== confirmed
          || this.battle.phase !== 'ended' || this.progressReadFailed)) return false;
        const previous = this.allocationPreview ?? confirmed;
        const next = adjustPotential(confirmed, previous, key, change);
        if (next === previous) return false;
        this.allocationPreview = next;
        this.render();
        return change === 1 ? next.potential > 0 : next.stats[key] > confirmed.stats[key];
      };
      const canRemove = editable && stats[key] > confirmed.stats[key];
      const canAdd = editable && potential > 0;
      if (allowHold) {
        this.potentialButton('－', 796, y, canRemove, () => adjust(-1));
        this.potentialButton('＋', 866, y, canAdd, () => adjust(1));
      } else {
        this.button('－', 796, y, 58, 39, canRemove, () => adjust(-1));
        this.button('＋', 866, y, 58, 39, canAdd, () => adjust(1));
      }
    });
    this.text(`剩余潜能  ${potential}`, 685, 457, 22, '#F4DC9C', 240);
    this.text(this.progressError || (editable ? '' : '战斗结束后可分配潜能'), 400, 511, 17, '#F4DC9C', 524);
    this.button('取消', 675, 550, 113, 43, true, close);
    this.button('确认', 809, 550, 113, 43, editable && potential < confirmed.potential, () => {
      if (allowHold) this.stopPotentialRepeat();
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
    });
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

  private render(): void {
    this.lastShownSecond = Math.ceil(this.battle.seconds);
    for (const child of [...this.node.children]) if (child.name !== 'Camera') child.destroy();
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
    if (this.usesTestProgress && !this.playing && !this.rosterOpen)
      this.button('测试重置', 200, 104, 136, 54, true, () => this.resetTestProgress());
    if (this.battle.heroProgress && !this.playing && !this.rosterOpen)
      this.button('人物面板', 343, 104, 124, 54, true, () => this.openHeroPanel());
    if (this.battle.phase !== 'ended') this.autoButton();
    if (!this.playing) this.button(`携带 ${this.battle.roster.entries.length}/${this.battle.roster.capacity}`,
      25, 104, 165, 54, true, () => {
        this.choosingTarget = null;
        this.summonOpen = false;
        this.rosterOpen = !this.rosterOpen;
        this.selectedPetId = null;
        this.allocationPreview = undefined;
        this.render();
      });
    if (this.battle.roster.full && !this.playing) this.text(`携带已满（${this.battle.roster.entries.length}/${this.battle.roster.capacity}），无法抓取`,
      470, 104, 20, '#F8D98A', 360, 1);
    this.rect(1095, 119, 218, 59, '#18312F', '', 9, undefined, 205);
    this.text(this.playing ? '战斗进行中' : this.battle.phase === 'ended'
      ? this.battle.winner === 'ally' ? '胜利' : '失败'
      : this.choosingTarget === 'attack' ? '请选择敌方目标'
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
          { label: '灵术', enabled: false },
          { label: '保护', enabled: this.battle.protectTargets(actor.id).length > 0, action: () => select('protect') },
          { label: '防御', enabled: true, action: () => send('defend') },
          { label: '撤退', enabled: true, action: () => send('retreat') },
        ];
      choices.forEach(choice => {
        const { x, y } = COMMAND_LAYOUT[choice.label];
        this.commandButton(choice.label, x, y, choice.enabled, choice.action);
      });
    }
    if (this.summonOpen && actor?.id === 'hero' && !this.playing && !this.rosterOpen) {
      this.layer = resultLayer;
      this.renderSummonList(actor.id);
    }
    if (!this.playing && this.battle.phase === 'ended') {
      this.layer = resultLayer;
      this.rect(391, 233, 540, 249, '#1e3835', '#e5cb8d', 15);
      this.text(this.battle.winner === 'ally' ? '战斗胜利' : '战斗失败', 441, 260, 48, '#f3dfad', 440, 1);
      const { earnedExp, levelsGained } = this.battle;
      this.text(this.battle.heroProgress && this.battle.winner === 'ally'
        ? `本场获得经验 ${earnedExp}` : '林间遭遇暂告一段落', 470, 322, 22, '#c6dbc6', 380, 1);
      if (levelsGained) this.text(`升 ${levelsGained} 级 · 每级五项各 +1、潜能 +5`, 425, 352, 20, '#F4DC9C', 466, 1);
      this.button('再来一场', 513, 384, 286, 69, true, () => {
        const { roster, heroRage, heroProgress, selectedPetId } = this.battle;
        this.restartBattle(this.createBattle(roster, heroRage, heroProgress, selectedPetId));
        this.render();
      });
    }
    if (this.rosterOpen && !this.playing) {
      this.layer = resultLayer;
      this.renderRosterList();
    }
    if (this.detailsOpen === 'hero' && this.battle.heroProgress && !this.playing) {
      this.layer = resultLayer;
      this.renderHeroPanel(this.battle.heroProgress);
    }
  }
}
