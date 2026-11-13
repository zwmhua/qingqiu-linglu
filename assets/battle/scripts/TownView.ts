import { assetManager, Color, EventTouch, Graphics, Label, Mask, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3 } from 'cc';
import { cameraOrigin, MAPS, Region, TOWN_PLACES, TownMovement, TownPlace, worldPoint } from '../logic/exploration';
import { CONFIG } from './config';

export class TownView {
  readonly root = new Node('town');
  private readonly world = new Node('map-world');
  movement = new TownMovement();
  region: Region = 'town';
  private origin = { x: 0, y: 0 };
  private request = 0;
  private loadError = '';
  get message(): string { return this.loading ? '地图加载中…' : this.error; }
  get canRetry(): boolean { return !!this.loadError && !this.frame; }
  get destination(): Region { return this.region === 'town' ? 'outskirts' : 'town'; }
  error = '';
  loading = false;
  frame?: SpriteFrame;
  private actor?: Node;
  private touch?: number;
  private disposed = false;
  private elapsed = 0;
  private facing = 1;
  private ripple?: Node;
  private rippleTime = 0;
  constructor(parent: Node, private changed: () => void) {
    parent.addChild(this.root);
    this.root.addComponent(UITransform).setContentSize(CONFIG.width, CONFIG.height);
    this.root.addComponent(Mask);
    this.root.addChild(this.world);
  }
  stop = (): void => {
    this.movement.stop();
    this.touch = undefined;
  };
  load(region = this.region): void {
    if (this.loading || this.disposed || (this.frame && region === this.region)) return;
    this.stop();
    const request = ++this.request;
    const current = () => !this.disposed && this.loading && request === this.request;
    this.loading = true;
    this.error = '';
    this.loadError = '';
    const complete = (error: Error | null, frame?: SpriteFrame) => {
      if (!current()) return;
      this.loading = false;
      if (error || !frame) {
        this.error = this.loadError = '地图加载失败，请重试';
      } else {
        for (const child of [...this.world.children]) {
          child.active = false;
          child.destroy();
        }
        this.actor = undefined;
        this.ripple = undefined;
        this.facing = 1;
        this.region = region;
        this.frame = frame;
        this.movement = new TownMovement(MAPS[region].area);
      }
      this.changed();
    };
    assetManager.loadBundle(region, (error, bundle) => {
      if (!current()) return;
      if (error) complete(error);
      else bundle.load(`textures/${MAPS[region].texture}/spriteFrame`, SpriteFrame, complete);
    });
  }
  draw(hero: SpriteFrame | null, blocked: () => boolean, activatePlace: (place: TownPlace) => void): void {
    if (!this.frame || this.actor) return;
    const sprite = (name: string, frame: SpriteFrame | null, w: number, h: number) => {
      const node = new Node(name);
      this.world.addChild(node);
      node.addComponent(UITransform).setContentSize(w, h);
      const image = node.addComponent(Sprite);
      image.sizeMode = Sprite.SizeMode.CUSTOM;
      image.spriteFrame = frame;
      return node;
    };
    const size = this.size;
    const map = sprite('town-map', this.frame, size.width, size.height);
    map.setPosition(size.width / 2, -size.height / 2);
    const movement = this.movement;
    const unavailable = () => this.loading || this.disposed || movement !== this.movement || blocked();
    map.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      if (!unavailable() && this.touch === undefined) this.touch = e.getID() ?? undefined;
    });
    map.on(Node.EventType.TOUCH_CANCEL, this.stop);
    map.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      if (e.getID() !== this.touch) return;
      this.touch = undefined;
      if (unavailable()) return this.stop();
      const p = e.getUILocation();
      const local = this.root.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y));
      const point = worldPoint(local, this.origin, CONFIG);
      if (this.region === 'town') {
        this.showRipple(point.x, point.y);
        const place = TOWN_PLACES.find(p => Math.abs(point.x - p.x) <= 74 && Math.abs(point.y - p.y) <= 42);
        if (place) {
          this.stop();
          activatePlace(place);
          return;
        }
      }
      this.error = this.movement.select(point) ? '' : '不能直达';
      this.changed();
    });
    const height = this.region === 'town' ? 96 : 140;
    this.actor = sprite('town-hero', hero, hero ? height * hero.rect.width / hero.rect.height : height * 0.7, height);
    this.actor.getComponent(UITransform)!.setAnchorPoint(0.5, 0);
    if (this.region === 'town') this.drawPlaces();
    this.update(0);
  }
  private drawPlaces(): void {
    for (const place of TOWN_PLACES) {
      const node = new Node(place.id);
      this.world.addChild(node);
      node.setPosition(place.x, -place.y);
      const label = node.addComponent(Label);
      label.string = place.name;
      label.fontSize = 23;
      label.color = new Color(255, 245, 209);
      label.enableOutline = true;
      label.outlineColor = new Color(37, 62, 44);
      label.outlineWidth = 3;
    }
  }
  private showRipple(x: number, y: number): void {
    if (!this.ripple) {
      this.ripple = new Node('town-ripple');
      this.world.addChild(this.ripple);
      const ring = this.ripple.addComponent(Graphics);
      ring.lineWidth = 3;
      ring.strokeColor = new Color(255, 246, 204);
      ring.circle(0, 0, 12);
      ring.stroke();
      this.ripple.addComponent(UIOpacity);
    }
    this.ripple.setPosition(x, -y);
    this.ripple.setScale(0.8, 0.8, 1);
    this.ripple.getComponent(UIOpacity)!.opacity = 255;
    this.rippleTime = 0;
    this.ripple.active = true;
  }
  private get size() { return MAPS[this.region]; }
  update(dt: number): void {
    const beforeX = this.movement.position.x;
    this.movement.update(dt);
    this.elapsed += dt;
    const { x, y } = this.movement.position;
    this.origin = cameraOrigin(this.movement.position, this.size, CONFIG);
    this.world.setPosition(-CONFIG.width / 2 - this.origin.x, CONFIG.height / 2 + this.origin.y);
    if (this.region === 'town') {
      if (x !== beforeX) this.facing = x < beforeX ? -1 : 1;
      const bob = this.movement.target ? Math.abs(Math.sin(this.elapsed * 14)) * 4 : 0;
      this.actor?.setPosition(x, -y - 3 + bob);
      this.actor?.setScale(this.facing, 1, 1);
    } else {
      this.actor?.setPosition(x, -y - 3);
      this.actor?.setScale(1, 1 + (this.movement.target ? Math.sin(this.elapsed * 12) * 0.015 : 0), 1);
    }
    if (this.ripple?.active) {
      const progress = Math.min(1, (this.rippleTime += dt) / 0.5);
      const scale = 0.8 + progress * 0.9;
      this.ripple.setScale(scale, scale, 1);
      this.ripple.getComponent(UIOpacity)!.opacity = Math.round((1 - progress) * 255);
      this.ripple.active = progress < 1;
    }
  }
  dispose(): void {
    this.disposed = true;
    this.stop();
  }
}
