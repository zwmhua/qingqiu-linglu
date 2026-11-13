# 青丘灵录｜当前工程架构

- 引擎：Cocos Creator 3.8.8，TypeScript；设计分辨率 1334×750。
- 入口场景：`assets/boot/Boot.scene` 加载本地 `battle` Asset Bundle，加载完成后由玩家进入 `assets/battle/scenes/Battle.scene`。
- 战斗规则：`assets/battle/scripts/Battle.ts`，不依赖 Cocos UI；可调玩法规则和纯逻辑放在 `assets/battle/logic/`，表现和站位参数放在 `assets/battle/scripts/config.ts`。浏览器与微信的查询及存储接口保留在 `assets/logic/platform.ts`。
- 共用进度：P2-02A 的 `SessionProgress` 持有人物、携带、出战 ID 和抓取编号；`local-progress.ts` 使用原键和 v3 格式读写，加点/放生成功保存后才提交内存。
- 显示与交互：`BattleView.ts` 默认创建战斗界面。Creator 开发预览的 `townPreview=1` 分支直接读取同一进度，不创建 `Battle`；人物/宠物面板复用原绘制及事务入口。正式标题仍进战斗，P2-05 才切正式入口。
- 城镇：`exploration.ts` 配置凸可走区、出生点与 180 单位/秒直线移动；`TownView.ts` 按需加载既有 `town` Bundle 的城图，2048×1152 等比映射到 1334×750 逻辑画布。地图/人物节点保留，移动仅更新人物；面板重绘只替换 `town-ui`。开面板、后台/失焦、禁用、销毁清目标，UI 阻断地图触摸。
- 资源边界：城图及原 UUID 留 `assets/town/`；人物、面板和城镇脚本留 `battle`，Boot 不静态引用地图，town 不反向依赖 battle 脚本。不新增分包、存档键或规则迁移。
- 美术：`assets/battle/textures/` 下的背景、角色、汀蛙和玉石按钮；场景通过 SpriteFrame 引用素材。保留对应 `.meta` 文件以维持资源 UUID。
- 验证：`tests/` 用 node:test 检查规则、存档兼容和站位。浏览器预览由 Cocos Creator 打开场景后启动。

第一阶段可玩原型已完成。已实现卡 01 战斗、02a-1 基础抓取、02a-2 携带列表、02a-3a 同场召唤和 02a-3b 跨战斗携带恢复，快捷攻击、L 形按钮与自动战斗也已加入；02b 已实现并经华周试玩验收，变异在野怪出场时判定。目录与资源已整理，进度见 `STATUS.md`，后续卡序见 `docs/roadmap.md`。`docs/` 和 `docs/archive/` 保存设计资料及历史版本。
