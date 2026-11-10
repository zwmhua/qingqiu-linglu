import { _decorator, Color, Component, EventTouch, Graphics, Label, Node, Sprite, SpriteFrame, UITransform, view } from 'cc';
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
  private choosingTarget = false;
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
    border = '', radius = 0, onClick?: () => void): Node {
    const node = new Node('shape');
    this.node.addChild(node);
    this.pos(node, x + w / 2, y + h / 2);
    node.addComponent(UITransform).setContentSize(w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = C(fill);
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
    text.fontSize = 25;
    text.color = C(enabled ? '#f8f0d4' : '#a5a9a1');
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

  private unitVisual(unit: Unit): void {
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
  }

  private unitInfo(unit: Unit): void {
    const point = this.unitPoint(unit);
    const dead = unit.hp === 0;
    const pending = this.battle.pending[0]?.id === unit.id;
    const targetable = this.choosingTarget && unit.side === 'enemy' && !dead;
    const height = (unit.id === 'hero' ? CONFIG.visual.heroHeight : CONFIG.visual.frogHeight)
      * CONFIG.visual.unitScale;
    if (dead) this.text(unit.id === 'hero' ? '倒地' : '无法出战', point.x - 70, point.y - height / 2, 19, '#e9b8a6', 140, 1);
    if (pending) this.text('准备中', point.x - 70, point.y - height - 36, 21, '#f9d786', 140, 1);
    if (targetable) this.text('点击选择目标', point.x - 95, point.y - height - 38, 19, '#f3dc8b', 190, 1);
    const targetClick = targetable ? () => this.chooseTarget(unit.id) : undefined;
    this.rect(point.x - 78, point.y + 26, 156, 57, dead ? '#313938' : targetable ? '#506545' : '#2d4542',
      targetable ? '#f2d789' : '#8d9d83', 7, targetClick);
    this.text(`${unit.name}  Lv.${unit.level}`, point.x - 74, point.y + 29, 19, dead ? '#a9aaa4' : '#f1e6c7', 148, 1, targetClick);
    this.text(`${unit.hp} / ${unit.maxHp}`, point.x - 74, point.y + 54, 17, dead ? '#999f99' : '#d1e9d4', 148, 1, targetClick);
  }

  private chooseTarget(id: string): void {
    const actor = this.battle.pending[0];
    if (!this.choosingTarget || !actor) return;
    this.battle.command(actor.id, 'attack', id);
    this.choosingTarget = false;
    this.render();
  }

  private render(): void {
    this.lastShownSecond = Math.ceil(this.battle.seconds);
    for (const child of [...this.node.children]) if (child.name !== 'Camera') child.destroy();
    this.image(0, 0, CONFIG.width, CONFIG.height, this.battleBackground);
    this.text('青丘灵录', 35, 24, 31, '#f3e5bc', 240);
    this.text('汀蛙 · 林间遭遇', 35, 65, 19, '#afc8ae', 280);
    this.rect(449, 24, 340, 76, '#243d3c', '#b5a777', 12);
    this.text(`第 ${this.battle.round} 回合`, 460, 34, 27, '#f1e4bd', 145, 1);
    this.text(this.battle.phase === 'ended' ? '战斗结束' : `指令 ${this.lastShownSecond} 秒`, 605, 35, 25, '#f4cf89', 170, 1);
    this.rect(904, 20, 408, 86, '#263e3d', '#788d78', 10);
    for (let i = 0; i < this.battle.allies.length; i++) {
      const u = this.battle.allies[i];
      const x = 922 + i * 190;
      this.ellipse(x + 20, 53, 17, 17, u.hp ? i ? '#75ae9b' : '#d9c28f' : '#63716b');
      this.text(u.name, x + 43, 30, 18, '#f4e9c8', 132);
      this.rect(x + 43, 61, 120, 10, '#4d5c55', '', 4);
      if (u.hp) this.rect(x + 43, 61, 120 * u.hp / u.maxHp, 10, '#9ccf94', '', 4);
      this.text(`${u.hp}/${u.maxHp}`, x + 43, 72, 15, '#c8d7bc', 120);
    }
    const units = this.battle.units;
    // Screen y is measured from the top; larger Cocos y is drawn first behind nearer units.
    for (const unit of [...units].sort((a, b) => this.unitPoint(a).y - this.unitPoint(b).y)) this.unitVisual(unit);
    for (const unit of units) this.unitInfo(unit);
    this.rect(32, 544, 570, 67, '#1e3333', '#637e6e', 8);
    const lines = this.battle.log.slice(-2);
    this.text(lines.join('  '), 44, 553, 17, '#e8dec0', 546);
    this.text(this.battle.phase === 'ended'
      ? this.battle.winner === 'ally' ? '胜利' : '失败'
      : this.choosingTarget ? '请选择左侧存活的野外汀蛙' : `请为 ${this.battle.pending[0]?.name ?? ''} 下达指令`,
      1110, 126, 19, '#f4dc9c', 210);
    this.button('灵术', 1116, 174, 195, 75, false);
    this.button('秘技', 1116, 260, 195, 75, false);
    this.button('攻击', 1116, 346, 195, 75, this.battle.phase === 'command', () => {
      this.choosingTarget = true;
      this.render();
    });
    this.button('行囊', 1116, 432, 195, 75, false);
    this.button('抓取', 296, 655, 174, 66, false);
    this.button('撤离', 484, 655, 174, 66, false);
    this.button('防御', 672, 655, 174, 66, this.battle.phase === 'command', () => {
      const actor = this.battle.pending[0];
      if (!actor) return;
      this.battle.command(actor.id, 'defend');
      this.choosingTarget = false;
      this.render();
    });
    this.button('自动', 860, 655, 174, 66, false);
    if (this.battle.phase === 'ended') {
      this.rect(391, 233, 540, 249, '#1e3835', '#e5cb8d', 15);
      this.text(this.battle.winner === 'ally' ? '战斗胜利' : '战斗失败', 441, 260, 48, '#f3dfad', 440, 1);
      this.text('汀蛙之战暂告一段落', 470, 325, 22, '#c6dbc6', 380, 1);
      this.button('再来一场', 513, 384, 286, 69, true, () => {
        this.battle = new Battle();
        this.choosingTarget = false;
        this.render();
      });
    }
  }
}
