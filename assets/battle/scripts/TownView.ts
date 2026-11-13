import { assetManager, EventTouch, Node, Sprite, SpriteFrame, UITransform, Vec3 } from 'cc';
import { TownMovement } from '../logic/exploration';
import { CONFIG } from './config';

export class TownView {
  readonly root = new Node('town');
  readonly movement = new TownMovement();
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
  }
  stop = (): void => {
    this.movement.stop();
    this.touch = undefined;
  };
  load(): void {
    if (this.loading || this.frame || this.disposed) return;
    this.loading = true;
    this.error = '';
    const complete = (error: Error | null, frame?: SpriteFrame) => {
      if (this.disposed) return;
      this.loading = false;
      this.error = error ? '城图加载失败，请重试' : '';
      this.frame = frame;
      this.changed();
    };
    assetManager.loadBundle('town', (error, bundle) => {
      if (error) complete(error);
      else bundle.load('textures/map_qingqiu_town/spriteFrame', SpriteFrame, complete);
    });
  }
  draw(hero: SpriteFrame | null, blocked: () => boolean): void {
    if (!this.frame || this.actor) return;
    const sprite = (name: string, frame: SpriteFrame | null, w: number, h: number) => {
      const node = new Node(name);
      this.root.addChild(node);
      node.addComponent(UITransform).setContentSize(w, h);
      const image = node.addComponent(Sprite);
      image.sizeMode = Sprite.SizeMode.CUSTOM;
      image.spriteFrame = frame;
      return node;
    };
    const scale = Math.min(CONFIG.width / 2048, CONFIG.height / 1152);
    const map = sprite('town-map', this.frame, 2048 * scale, 1152 * scale);
    map.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      if (!blocked() && this.touch === undefined) this.touch = e.getID() ?? undefined;
    });
    map.on(Node.EventType.TOUCH_CANCEL, this.stop);
    map.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      if (e.getID() !== this.touch) return;
      this.touch = undefined;
      if (blocked()) return this.stop();
      const p = e.getUILocation();
      const local = this.root.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y));
      this.error = this.movement.select({ x: local.x + CONFIG.width / 2, y: CONFIG.height / 2 - local.y }) ? '' : '不能直达';
      this.changed();
    });
    this.actor = sprite('town-hero', hero, hero ? 140 * hero.rect.width / hero.rect.height : 100, 140);
    this.actor.getComponent(UITransform)!.setAnchorPoint(0.5, 0);
    this.update(0);
  }
  update(dt: number): void {
    this.movement.update(dt);
    this.elapsed += dt;
    const { x, y } = this.movement.position;
    this.actor?.setPosition(x - CONFIG.width / 2, CONFIG.height / 2 - y - 3);
    this.actor?.setScale(1, 1 + (this.movement.target ? Math.sin(this.elapsed * 12) * 0.015 : 0), 1);
  }
  dispose(): void {
    this.disposed = true;
    this.stop();
  }
}
