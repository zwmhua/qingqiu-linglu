import { _decorator, Color, Component, EventTouch, Graphics, Label, Node, RichText, Sprite, SpriteFrame, UITransform, view } from 'cc';
import { Battle, Unit } from './Battle';
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

  start(): void {
    view.setDesignResolutionSize(CONFIG.width, CONFIG.height, 4);
    this.render();
  }

  update(dt: number): void {
    const before = this.battle.round;
    this.battle.tick(dt);
    const second = Math.ceil(this.battle.seconds);
    if (second !== this.lastShownSecond || before !== this.battle.round) this.render();
  }

  private pos(node: Node, x: number, y: number): void {
    node.setPosition(x - CONFIG.width / 2, CONFIG.height / 2 - y, 0);
  }

  private rect(x: number, y: number, w: number, h: number, fill: string,
    border = '', radius = 0, onClick?: () => void, alpha = 255): Node {
    const node = new Node('shape');
    this.node.addChild(node);
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
    this.node.addChild(node);
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
    this.node.addChild(node);
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
    this.node.addChild(node);
    this.pos(node, x + w / 2, y + h / 2);
    node.addComponent(UITransform).setContentSize(w, h);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
    sprite.spriteFrame = frame;
    return { node, sprite };
  }

  private button(label: string, x: number, y: number, w: number, h: number,
    enabled: boolean, onClick?: () => void): void {
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

  private unitVisual(unit: Unit): void {
    if (unit.left) return;
    const point = this.unitPoint(unit);
    const dead = unit.hp === 0;
    const isPet = unit.id === 'pet' || unit.side === 'enemy';
    this.ellipse(point.x, point.y + 4, 55, 15, '#17241d', 105);
    const visual = new Node(`unit-${unit.id}`);
    this.node.addChild(visual);
    this.pos(visual, point.x, point.y);
    visual.addComponent(UITransform).setContentSize(256, 256);
    visual.getComponent(UITransform)!.setAnchorPoint(0.5, 0);
    const scale = CONFIG.visual.unitScale;
    visual.setScale(unit.side === 'enemy' && CONFIG.visual.enemyFlipX ? -scale : scale, scale, 1);
    const sprite = visual.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.RAW;
    sprite.trim = false;
    sprite.spriteFrame = isPet ? this.frogArt : this.heroArt;
    if (dead) sprite.grayscale = true;
    if (this.canSelect(unit)) visual.on(Node.EventType.TOUCH_END, () => this.chooseTarget(unit.id));
  }

  private unitInfo(unit: Unit): void {
    if (unit.left) return;
    const point = this.unitPoint(unit);
    const dead = unit.hp === 0;
    const pending = this.battle.pending[0]?.id === unit.id;
    const targetable = this.canSelect(unit);
    const height = (unit.id === 'hero' ? CONFIG.visual.heroHeight : CONFIG.visual.frogHeight)
      * CONFIG.visual.unitScale;
    const centerX = point.x + (unit.side === 'enemy' ? -10 : unit.id === 'hero' ? 65 : 0);
    const plateX = centerX - 59;
    const plateY = point.y - height - 58;
    const targetClick = targetable ? () => this.chooseTarget(unit.id) : undefined;
    this.rect(plateX, plateY, 118, 48, dead ? '#26302e' : '#203b37',
      targetable ? '#F1D788' : '', 7, targetClick, 210);
    this.text(`${unit.name} Lv.${unit.level}`, plateX + 4, plateY + 5, 16,
      dead ? '#B2B7AF' : '#FAF0D8', 110, 1, targetClick);
    this.rect(plateX + 9, plateY + 34, 100, 6, '#60736B', '', 3, targetClick);
    if (unit.hp > 0) this.rect(plateX + 9, plateY + 34, 100 * unit.hp / unit.maxHp, 6,
      '#9FD49F', '', 3, targetClick);
    if (pending) this.text('准备中', plateX, plateY - 24, 18, '#F8DB91', 118, 1);
  }

  private chooseTarget(id: string): void {
    const actor = this.battle.pending[0];
    if (!this.choosingTarget || !actor) return;
    this.battle.command(actor.id, this.choosingTarget, id);
    this.choosingTarget = null;
    this.render();
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
      this.node.addChild(node);
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
    this.image(0, 0, CONFIG.width, CONFIG.height, this.battleBackground);
    this.rect(24, 16, 285, 77, '#18312F', '', 10, undefined, 190);
    this.text('青丘灵录', 35, 24, 31, '#f3e5bc', 240);
    this.text('汀蛙 · 林间遭遇', 35, 65, 19, '#afc8ae', 280);
    this.rect(449, 24, 340, 76, '#243d3c', '#b5a777', 12);
    this.text(`第 ${this.battle.round} 回合`, 460, 34, 27, '#f1e4bd', 145, 1);
    this.text(this.battle.phase === 'ended' ? '战斗结束' : `指令 ${this.lastShownSecond} 秒`, 605, 35, 25, '#f4cf89', 170, 1);
    this.rect(904, 20, 408, 86, '#263e3d', '#788d78', 10);
    for (let i = 0; i < this.battle.allies.length; i++) {
      const u = this.battle.allies[i];
      const x = 922 + i * 190;
      this.ellipse(x + 20, 53, 17, 17, u.hp && !u.left ? i ? '#75ae9b' : '#d9c28f' : '#63716b');
      this.text(u.name, x + 43, 30, 18, '#f4e9c8', 132);
      this.rect(x + 43, 61, 120, 10, '#4d5c55', '', 4);
      if (u.hp && !u.left) this.rect(x + 43, 61, 120 * u.hp / u.maxHp, 10, '#9ccf94', '', 4);
      this.text(u.left ? '离场' : `${u.hp}/${u.maxHp}`, x + 43, 72, 15, '#c8d7bc', 120);
    }
    const units = this.battle.units;
    // Screen y is measured from the top; larger Cocos y is drawn first behind nearer units.
    for (const unit of [...units].sort((a, b) => this.unitPoint(a).y - this.unitPoint(b).y)) this.unitVisual(unit);
    for (const unit of units) this.unitInfo(unit);
    this.renderLog();
    this.rect(1095, 119, 218, 59, '#18312F', '', 9, undefined, 205);
    this.text(this.battle.phase === 'ended'
      ? this.battle.winner === 'ally' ? '胜利' : '失败'
      : this.choosingTarget === 'attack' ? '请选择敌方目标'
        : this.choosingTarget === 'protect' ? '请选择我方目标'
          : `请为 ${this.battle.pending[0]?.name ?? ''} 下达指令`,
      1105, 132, 18, '#F4DC9C', 200);
    const actor = this.battle.pending[0];
    if (this.battle.phase === 'command' && actor) {
      const send = (command: 'defend' | 'retreat' | 'flee') => {
        this.battle.command(actor.id, command);
        this.choosingTarget = null;
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
    if (this.battle.phase === 'ended') {
      this.rect(391, 233, 540, 249, '#1e3835', '#e5cb8d', 15);
      this.text(this.battle.winner === 'ally' ? '战斗胜利' : '战斗失败', 441, 260, 48, '#f3dfad', 440, 1);
      this.text('汀蛙之战暂告一段落', 470, 325, 22, '#c6dbc6', 380, 1);
      this.button('再来一场', 513, 384, 286, 69, true, () => {
        this.battle = new Battle();
        this.choosingTarget = null;
        this.render();
      });
    }
  }
}
