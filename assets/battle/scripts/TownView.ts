import { assetManager, EventTouch, Mask, Node, Sprite, SpriteFrame, UITransform, Vec3 } from 'cc';
import { cameraOrigin, MAPS, Region, TownMovement, worldPoint } from '../logic/exploration';
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
  draw(hero: SpriteFrame | null, blocked: () => boolean): void {
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
    const config = MAPS[this.region];
    const scale = this.region === 'town' ? Math.min(CONFIG.width / config.width, CONFIG.height / config.height) : 1;
    const size = this.size;
    const map = sprite('town-map', this.frame, config.width * scale, config.height * scale);
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
      this.error = this.movement.select(worldPoint(local, this.origin, CONFIG)) ? '' : '不能直达';
      this.changed();
    });
    this.actor = sprite('town-hero', hero, hero ? 140 * hero.rect.width / hero.rect.height : 100, 140);
    this.actor.getComponent(UITransform)!.setAnchorPoint(0.5, 0);
    this.update(0);
  }
  private get size() { return this.region === 'town' ? CONFIG : MAPS.outskirts; }
  update(dt: number): void {
    this.movement.update(dt);
    this.elapsed += dt;
    const { x, y } = this.movement.position;
    this.origin = cameraOrigin(this.movement.position, this.size, CONFIG);
    this.world.setPosition(-CONFIG.width / 2 - this.origin.x, CONFIG.height / 2 + this.origin.y);
    this.actor?.setPosition(x, -y - 3);
    this.actor?.setScale(1, 1 + (this.movement.target ? Math.sin(this.elapsed * 12) * 0.015 : 0), 1);
  }
  dispose(): void {
    this.disposed = true;
    this.stop();
  }
}
