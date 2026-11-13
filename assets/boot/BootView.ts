import { _decorator, assetManager, Color, Component, director, Graphics, Label, Node, ResolutionPolicy, Sprite, SpriteFrame, UITransform, view } from 'cc';

@_decorator.ccclass('BootView')
export class BootView extends Component {
  @_decorator.property(SpriteFrame) titleArt: SpriteFrame = null;

  start(): void {
    view.setDesignResolutionSize(1334, 750, ResolutionPolicy.SHOW_ALL);
    const bg = this.child('标题背景', 0).addComponent(Sprite);
    bg.spriteFrame = this.titleArt;
    this.label('青丘灵录', 160, 94, new Color(255, 232, 171), 540);
    const status = this.label('', -239, 28, new Color(255, 242, 212), 350);
    const bar = this.child('加载进度', 0).addComponent(Graphics);
    const action = this.child('启动操作', -296);
    const button = action.addComponent(Graphics);
    button.fillColor = new Color(33, 67, 55, 245);
    button.roundRect(-151, -26, 302, 52, 10);
    button.fill();
    button.lineWidth = 2;
    button.strokeColor = new Color(238, 198, 112);
    button.roundRect(-151, -26, 302, 52, 10);
    button.stroke();
    const caption = this.label('', 0, 29, new Color(255, 232, 171), 302, action);
    action.active = false;
    const progress = (ratio: number) => {
      bar.clear();
      bar.fillColor = new Color(20, 43, 38, 220);
      bar.roundRect(-160, -204, 320, 12, 6);
      bar.fill();
      bar.fillColor = new Color(238, 198, 112);
      if (ratio > 0) { bar.roundRect(-160, -204, 320 * ratio, 12, 6); bar.fill(); }
      status.string = Math.floor(ratio * 100) + '%';
    };
    const showAction = (text: string, callback: () => void) => {
      caption.string = text;
      action.active = true;
      caption.node.once(Node.EventType.TOUCH_END, callback);
    };
    const load = () => {
      action.active = false;
      progress(0);
      const fail = (error: Error) => {
        console.warn('battle', error);
        showAction('加载失败，点击重试', load);
      };
      assetManager.loadBundle('battle', (error, bundle) => {
        if (error) return fail(error);
        bundle.loadScene('Battle', (done, total) => progress(total ? Math.min(0.99, done / total) : 0), (err, scene) => {
          if (err) return fail(err);
          progress(1);
          showAction('开始游戏', () => director.runScene(scene));
        });
      });
    };
    this.scheduleOnce(load);
  }

  private child(name: string, y: number, parent = this.node): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(0, y);
    return node;
  }

  private label(text: string, y: number, size: number, color: Color, width: number, parent = this.node): Label {
    const node = this.child(text, y, parent);
    node.addComponent(UITransform).setContentSize(width, size + 20);
    const label = node.addComponent(Label);
    Object.assign(label, { string: text, fontSize: size, lineHeight: size, color, overflow: Label.Overflow.CLAMP,
      horizontalAlign: Label.HorizontalAlign.CENTER, verticalAlign: Label.VerticalAlign.CENTER,
      enableOutline: true, outlineColor: new Color(23, 42, 34), outlineWidth: 2 });
    return label;
  }
}
