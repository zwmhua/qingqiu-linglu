import { _decorator, Color, Component, EventTouch, Graphics, Label, Node, RichText, Sprite, SpriteFrame, tween, UIOpacity, UITransform, Vec3, view } from 'cc';
import { AttackEvent, Battle, Unit } from './Battle';
import { CONFIG } from './config';

const { ccclass, property } = _decorator;
const C = (hex: string) => new Color(hex);

@ccclass('BattleView')
export class BattleView extends Component {
  @property(SpriteFrame) battleBackground: SpriteFrame | null = null;
  @property(SpriteFrame) heroArt: SpriteFrame | null = null;
  @property(SpriteFrame) frogArt: SpriteFrame | null = null;
  @property(SpriteFrame) jadeNormal: SpriteFrame | null = null;
  @property(SpriteFrame) jadePressed: SpriteFrame | null = null;
  @property(SpriteFrame) jadeDisabled: SpriteFrame | null = null;
  private battle = new Battle();
  private choosingTarget: 'attack' | 'protect' | null = null;
  private lastShownSecond = -1;
  private layer!: Node;
  private markerLayer!: Node;
  private unitLayer!: Node;
  private unitNodes = new Map<string, Node>();
  private shadowNodes = new Map<string, Node>();
  private markerNodes = new Map<string, Node>();
  private basePositions = new Map<string, Vec3>();
  private displayedHp: Map<string, number> | null = null;
  private animationQueue: AttackEvent[] = [];
  private playing = false;
  private speedMultiplier = 1;

  start(): void {
    view.setDesignResolutionSize(CONFIG.width, CONFIG.height, 4);
    this.render();
  }

  update(dt: number): void {
    if (this.playing) { this.syncMovingUnits(); return; }
    const before = this.battle.round;
    const phase = this.battle.phase;
    const hp = this.captureHp();
    this.battle.tick(dt);
    if (this.startPlayback(before, phase, hp)) return;
    const second = Math.ceil(this.battle.seconds);
    if (second !== this.lastShownSecond || before !== this.battle.round) this.render();
  }

  private pos(node: Node, x: number, y: number): void {
    node.setPosition(x - CONFIG.width / 2, CONFIG.height / 2 - y, 0);
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

  private unitPoint(unit: Unit): { x: number; y: number } {
    if (unit.side === 'enemy') return CONFIG.positions.enemy[unit.slot];
    const group = CONFIG.positions.allyGroups[Math.floor(unit.slot / 2)];
    return unit.slot % 2 === 0 ? group.pet : group.hero;
  }

  private canSelect(unit: Unit): boolean {
    const actor = this.battle.pending[0];
    if (!actor || unit.hp === 0 || unit.left) return false;
    if (this.choosingTarget === 'attack') return unit.side === 'enemy';
    if (this.choosingTarget === 'protect') return this.battle.protectTargets(actor.id).some(u => u.id === unit.id);
    return false;
  }

  private unitShadow(unit: Unit): void {
    if (unit.left || (this.displayedHp?.get(unit.id) ?? unit.hp) === 0) return;
    const previous = this.layer;
    const group = new Node(`shadow-${unit.id}`);
    previous.addChild(group);
    this.shadowNodes.set(unit.id, group);
    this.layer = group;
    const point = this.unitPoint(unit);
    if (this.canSelect(unit)) this.ellipse(point.x, point.y + 4, 64, 20, '#F1D788', 150);
    this.ellipse(point.x, point.y + 4, 55, 15, '#17241d', 105);
    this.layer = previous;
  }

  private unitVisual(unit: Unit): void {
    if (unit.left) return;
    const point = this.unitPoint(unit);
    const dead = (this.displayedHp?.get(unit.id) ?? unit.hp) === 0;
    const isPet = unit.id === 'pet' || unit.side === 'enemy';
    const visual = new Node(`unit-${unit.id}`);
    this.layer.addChild(visual);
    this.pos(visual, point.x, point.y);
    this.unitNodes.set(unit.id, visual);
    this.basePositions.set(unit.id, visual.position.clone());
    visual.addComponent(UITransform).setContentSize(256, 256);
    visual.getComponent(UITransform)!.setAnchorPoint(0.5, 0);
    const scale = CONFIG.visual.unitScale;
    visual.setScale(unit.side === 'enemy' && CONFIG.visual.enemyFlipX ? -scale : scale, scale, 1);
    const sprite = visual.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.RAW;
    sprite.trim = false;
    sprite.spriteFrame = isPet ? this.frogArt : this.heroArt;
    if (dead) sprite.grayscale = true;
    visual.addComponent(UIOpacity).opacity = dead ? 0 : 255;
    if (!this.playing && this.canSelect(unit)) visual.on(Node.EventType.TOUCH_END, () => this.chooseTarget(unit.id));
  }

  private unitInfo(unit: Unit): void {
    if (unit.left || (this.displayedHp?.get(unit.id) ?? unit.hp) === 0) return;
    const previous = this.layer;
    const group = new Node(`markers-${unit.id}`);
    previous.addChild(group);
    this.markerNodes.set(unit.id, group);
    this.layer = group;
    const point = this.unitPoint(unit);
    const pending = this.battle.pending[0]?.id === unit.id;
    const targetable = this.canSelect(unit);
    const v = CONFIG.visual;
    const height = (unit.id === 'hero' ? CONFIG.visual.heroHeight : CONFIG.visual.frogHeight)
      * CONFIG.visual.unitScale;
    const headX = point.x + (unit.id === 'hero' ? 50 : 0);
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
    const nameX = point.x + (unit.side === 'enemy' ? 22 : unit.id === 'pet' ? -50 : 0) - 64;
    const name = this.text(`${unit.name} Lv.${unit.level}`, nameX,
      point.y + 19 + v.nameGap, v.nameSize, '#FFFFFF', 128, 1, targetClick);
    const label = name.getComponent(Label)!;
    label.enableOutline = true;
    label.outlineColor = C('#1A2826');
    label.outlineWidth = 2;
    if (pending) this.text('准备中', headX - 59, healthY - 28, 18, '#F8DB91', 118, 1);
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
    if (!this.choosingTarget || !actor) return;
    const before = this.battle.round;
    const phase = this.battle.phase;
    const hp = this.captureHp();
    this.battle.command(actor.id, this.choosingTarget, id);
    this.choosingTarget = null;
    if (this.startPlayback(before, phase, hp)) return;
    this.render();
  }

  private captureHp(): Map<string, number> {
    return new Map(this.battle.units.map(unit => [unit.id, unit.hp]));
  }

  private startPlayback(round: number, phase: string, hp: Map<string, number>): boolean {
    if (round === this.battle.round && phase === this.battle.phase) return false;
    if (this.battle.attackEvents.length === 0) return false;
    this.displayedHp = hp;
    this.animationQueue = [...this.battle.attackEvents];
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
      this.render();
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
        target.getComponent(Sprite)!.color = Color.WHITE;
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

  private render(): void {
    this.lastShownSecond = Math.ceil(this.battle.seconds);
    for (const child of [...this.node.children]) if (child.name !== 'Camera') child.destroy();
    this.unitNodes.clear();
    this.shadowNodes.clear();
    this.markerNodes.clear();
    this.basePositions.clear();
    const background = new Node('background-layer');
    const interfaceLayer = new Node('interface-layer');
    const unitLayer = new Node('unit-layer');
    this.unitLayer = unitLayer;
    const markerLayer = new Node('unit-marker-layer');
    this.markerLayer = markerLayer;
    const resultLayer = new Node('result-layer');
    for (const layer of [background, interfaceLayer, unitLayer, markerLayer, resultLayer]) this.node.addChild(layer);
    this.layer = background;
    this.image(0, 0, CONFIG.width, CONFIG.height, this.battleBackground);
    this.layer = interfaceLayer;
    this.rect(24, 16, 285, 77, '#18312F', '', 10, undefined, 190);
    this.text('青丘灵录', 35, 24, 31, '#f3e5bc', 240);
    this.text('汀蛙 · 林间遭遇', 35, 65, 19, '#afc8ae', 280);
    let speedButton: Node;
    speedButton = this.button(this.speedMultiplier === 1 ? '加速 ×2' : '恢复 ×1',
      315, 31, 128, 52, true, () => {
        this.speedMultiplier = this.speedMultiplier === 1 ? CONFIG.animation.fastMultiplier : 1;
        speedButton.getChildByName('button-label')!.getComponent(Label)!.string =
          this.speedMultiplier === 1 ? '加速 ×2' : '恢复 ×1';
      });
    this.rect(449, 24, 340, 76, '#243d3c', '#b5a777', 12);
    this.text(`第 ${this.battle.round} 回合`, 460, 34, 27, '#f1e4bd', 145, 1);
    this.text(this.playing ? '战斗进行中' : this.battle.phase === 'ended' ? '战斗结束'
      : `指令 ${this.lastShownSecond} 秒`, 605, 35, 25, '#f4cf89', 170, 1);
    this.rect(904, 20, 408, 86, '#263e3d', '#788d78', 10);
    for (let i = 0; i < this.battle.allies.length; i++) {
      const u = this.battle.allies[i];
      const x = 922 + i * 190;
      this.ellipse(x + 20, 53, 17, 17, u.hp && !u.left ? i ? '#75ae9b' : '#d9c28f' : '#63716b');
      this.text(u.name, x + 43, 30, 18, '#f4e9c8', 132);
      this.rect(x + 43, 61, 120, 10, '#4d5c55', '', 4);
      const visibleHp = this.displayedHp?.get(u.id) ?? u.hp;
      if (visibleHp && !u.left) this.rect(x + 43, 61, 120 * visibleHp / u.maxHp, 10, '#9ccf94', '', 4);
      this.text(u.left ? '离场' : `${visibleHp}/${u.maxHp}`, x + 43, 72, 15, '#c8d7bc', 120);
    }
    const units = this.battle.units;
    this.layer = unitLayer;
    for (const unit of units) this.unitShadow(unit);
    // Screen y is measured from the top; units with lower feet are drawn later.
    for (const unit of [...units].sort((a, b) => this.unitPoint(a).y - this.unitPoint(b).y)) this.unitVisual(unit);
    this.layer = markerLayer;
    for (const unit of units) this.unitInfo(unit);
    this.layer = interfaceLayer;
    this.renderLog();
    this.rect(1095, 119, 218, 59, '#18312F', '', 9, undefined, 205);
    this.text(this.playing ? '战斗进行中' : this.battle.phase === 'ended'
      ? this.battle.winner === 'ally' ? '胜利' : '失败'
      : this.choosingTarget === 'attack' ? '请选择敌方目标'
        : this.choosingTarget === 'protect' ? '请选择我方目标'
          : `请为 ${this.battle.pending[0]?.name ?? ''} 下达指令`,
      1105, 132, 18, '#F4DC9C', 200);
    const actor = this.battle.pending[0];
    if (!this.playing && this.battle.phase === 'command' && actor) {
      const send = (command: 'defend' | 'retreat' | 'flee') => {
        const before = this.battle.round;
        const phase = this.battle.phase;
        const hp = this.captureHp();
        this.battle.command(actor.id, command);
        this.choosingTarget = null;
        if (this.startPlayback(before, phase, hp)) return;
        this.render();
      };
      const select = (command: 'attack' | 'protect') => {
        this.choosingTarget = command;
        this.render();
      };
      const choices: { label: string; enabled: boolean; action?: () => void }[] = actor.id === 'hero'
        ? [
          { label: '攻击', enabled: true, action: () => select('attack') },
          { label: '防御', enabled: true, action: () => send('defend') },
          { label: '保护', enabled: this.battle.protectTargets(actor.id).length > 0, action: () => select('protect') },
          { label: '抓取', enabled: false },
          { label: '道具', enabled: false },
          { label: '逃跑', enabled: true, action: () => send('flee') },
        ] : [
          { label: '攻击', enabled: true, action: () => select('attack') },
          { label: '灵术', enabled: false },
          { label: '保护', enabled: this.battle.protectTargets(actor.id).length > 0, action: () => select('protect') },
          { label: '防御', enabled: true, action: () => send('defend') },
          { label: '撤退', enabled: true, action: () => send('retreat') },
        ];
      choices.forEach((choice, index) => this.button(choice.label, 1115, 188 + index * 84,
        195, 70, choice.enabled, choice.action));
    }
    if (!this.playing && this.battle.phase === 'ended') {
      this.layer = resultLayer;
      this.rect(391, 233, 540, 249, '#1e3835', '#e5cb8d', 15);
      this.text(this.battle.winner === 'ally' ? '战斗胜利' : '战斗失败', 441, 260, 48, '#f3dfad', 440, 1);
      this.text('汀蛙之战暂告一段落', 470, 325, 22, '#c6dbc6', 380, 1);
      this.button('再来一场', 513, 384, 286, 69, true, () => {
        this.battle = new Battle();
        this.choosingTarget = null;
        this.displayedHp = null;
        this.animationQueue = [];
        this.render();
      });
    }
  }
}
