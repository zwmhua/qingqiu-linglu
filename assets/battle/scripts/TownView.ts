import { assetManager, Color, EventTouch, Graphics, Label, Mask, Node, Rect, Size, sp, Sprite, SpriteFrame, Texture2D, UIOpacity, UITransform, Vec3 } from 'cc';
import { cameraOrigin, MAPS, Region, TOWN, TOWN_PLACES, TownMovement, TownPlace, worldPoint } from '../logic/exploration';
import { runFacing, type RunFacing } from './run-facing';
import { CONFIG } from './config';

export class TownView {
  readonly root = new Node('town');
  private readonly world = new Node('map-world');
  private readonly labels = new Node('town-labels');
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
  private idleFrame: SpriteFrame | null = null;
  private actorHeight = 0;
  private facing: RunFacing = { row: 0, flip: 1 };
  private runTime = 0;
  private runFrames: SpriteFrame[] = [];
  private runTexture?: Texture2D;
  private loadingRun = false;
  private spineData?: sp.SkeletonData;
  private spineNode?: Node;
  private spineAnimation?: 'idle' | 'run';
  private loadingSpine = false;
  private spineScale = 1;
  private ripple?: Node;
  private rippleTime = 0;
  constructor(parent: Node, private changed: () => void) {
    parent.addChild(this.root);
    this.root.addComponent(UITransform).setContentSize(CONFIG.width, CONFIG.height);
    this.root.addComponent(Mask);
    this.root.addChild(this.world);
    this.root.addChild(this.labels);
  }
  stop = (): void => {
    this.movement.stop();
    this.touch = undefined;
    this.updateHeroArt(0);
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
        for (const child of [...this.world.children, ...this.labels.children]) {
          child.active = false;
          child.destroy();
        }
        this.actor = undefined;
        this.spineNode = undefined;
        this.spineAnimation = undefined;
        this.ripple = undefined;
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
    this.idleFrame = hero;
    this.actorHeight = height;
    this.actor = sprite('town-hero', hero, hero ? height * hero.rect.width / hero.rect.height : height * 0.7, height);
    this.actor.getComponent(UITransform)!.setAnchorPoint(0.5, 0);
    // Both source images use a bottom foot baseline. The exported Spine artwork
    // occupies y=37..734 in its 768-unit canvas; run art occupies 250/256 high.
    this.spineScale = height * 250 / (256 * 697);
    this.createIdleSpine();
    this.loadSpineData();
    this.loadRunFrames();
    if (this.region === 'town') this.drawPlaces();
    this.update(0);
  }
  private createIdleSpine(): void {
    if (!this.actor || !this.spineData || this.spineNode) return;
    const node = this.spineNode = new Node('town-hero-idle');
    this.world.addChild(node);
    node.addComponent(UITransform).setContentSize(768, 768);
    const skeleton = node.addComponent(sp.Skeleton);
    skeleton.premultipliedAlpha = false;
    skeleton.skeletonData = this.spineData;
    skeleton.setSkin('default');
    skeleton.loop = true;
    skeleton.setAnimation(0, 'idle', true);
    this.spineAnimation = 'idle';
    this.updateHeroArt(0);
  }
  private loadSpineData(): void {
    if (this.loadingSpine || this.spineData) return;
    this.loadingSpine = true;
    const complete = (error: Error | null, data?: sp.SkeletonData) => {
      this.loadingSpine = false;
      if (this.disposed) return;
      if (error || !data) { console.warn('主角 Spine 加载失败', error); return; }
      data.addRef();
      this.spineData = data;
      this.createIdleSpine();
    };
    assetManager.loadBundle('town', (error, bundle) => {
      if (this.disposed) return;
      if (error) complete(error);
      else bundle.load('spine/skeleton', sp.SkeletonData, complete);
    });
  }
  private loadRunFrames(): void {
    if (this.loadingRun || this.runTexture) return;
    this.loadingRun = true;
    const { frames, rows, width, height } = CONFIG.explorationRun;
    const complete = (error: Error | null, texture?: Texture2D) => {
      this.loadingRun = false;
      if (this.disposed) return;
      if (error || !texture || texture.width !== width * frames || texture.height !== height * rows) {
        console.warn('主角跑步图集加载失败', error);
        return;
      }
      texture.addRef();
      this.runTexture = texture;
      this.runFrames = Array.from({ length: frames * rows }, (_, i) => {
        const frame = new SpriteFrame();
        frame.packable = false;
        frame.reset({
          texture,
          rect: new Rect(i % frames * width, Math.floor(i / frames) * height, width, height),
          originalSize: new Size(width, height),
        });
        return frame;
      });
    };
    assetManager.loadBundle('battle', (error, bundle) => {
      if (this.disposed) return;
      if (error) complete(error);
      else bundle.load('textures/units/hero_run/texture', Texture2D, complete);
    });
  }
  private updateHeroArt(dt: number): void {
    if (!this.actor) return;
    const { fps, frames } = CONFIG.explorationRun;
    this.runTime = this.movement.target ? (this.runTime + dt) % (frames / fps) : 0;
    const index = this.facing.row * frames + Math.floor(this.runTime * fps);
    const frame = (this.movement.target && this.runFrames[index]) || this.idleFrame;
    const image = this.actor.getComponent(Sprite)!;
    if (image.spriteFrame !== frame) {
      image.spriteFrame = frame;
      const width = frame ? this.actorHeight * frame.rect.width / frame.rect.height : this.actorHeight * 0.7;
      this.actor.getComponent(UITransform)!.setContentSize(width, this.actorHeight);
    }
    this.actor.setScale(this.facing.flip, 1, 1);
    const moving = !!this.movement.target;
    const spineRun = moving && this.facing.row === 0;
    if (this.spineNode) {
      this.spineNode.active = !moving || spineRun;
      const animation = spineRun ? 'run' : 'idle';
      if (this.spineAnimation !== animation) {
        const skeleton = this.spineNode.getComponent(sp.Skeleton)!;
        skeleton.timeScale = spineRun
          ? TOWN.speed * CONFIG.explorationRun.spineDuration / CONFIG.explorationRun.spineStride : 1;
        skeleton.setAnimation(0, animation, true);
        this.spineAnimation = animation;
      }
      this.spineNode.setScale(this.facing.flip * this.spineScale, this.spineScale, 1);
      const { x, y } = this.movement.position;
      this.spineNode.setPosition(x - this.facing.flip * 389 * this.spineScale,
        -y - 3 - 37 * this.spineScale);
    }
    this.actor.active = !this.spineNode || (moving && !spineRun);
  }
  private drawPlaces(): void {
    for (const place of TOWN_PLACES) {
      const node = new Node(place.id);
      this.labels.addChild(node);
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
    const { position, target } = this.movement;
    this.movement.update(dt);
    const { x, y } = this.movement.position;
    if (target && (x !== position.x || y !== position.y)) {
      const { axisTolerance } = CONFIG.explorationRun;
      const axis = (distance: number) => Math.abs(distance) <= axisTolerance ? 0 : distance;
      this.facing = runFacing(axis(target.x - position.x), axis(target.y - position.y), this.facing);
    }
    this.origin = cameraOrigin(this.movement.position, this.size, CONFIG);
    this.world.setPosition(-CONFIG.width / 2 - this.origin.x, CONFIG.height / 2 + this.origin.y);
    this.labels.setPosition(this.world.position);
    this.actor?.setPosition(x, -y - 3);
    this.updateHeroArt(dt);
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
    for (const frame of this.runFrames) frame.destroy();
    this.runTexture?.decRef();
    this.spineData?.decRef();
  }
}
