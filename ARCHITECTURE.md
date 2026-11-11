# 青丘灵录｜当前工程架构

- 引擎：Cocos Creator 3.8.8，TypeScript；设计分辨率 1334×750。
- 入口场景：`assets/scenes/Battle.scene`，Canvas 挂载 `assets/scripts/BattleView.ts`。
- 战斗规则：`assets/scripts/Battle.ts`，不依赖 Cocos UI；数值和站位集中在 `assets/scripts/config.ts`。
- 显示与交互：`BattleView.ts` 创建战斗界面，调用 `Battle` 接收指令与显示结算结果。
- 美术：`assets/textures/` 下的背景、角色、汀蛙和玉石按钮；场景通过 SpriteFrame 引用素材。保留对应 `.meta` 文件以维持资源 UUID。
- 验证：`tests/battle.test.mjs` 和 `tests/formation.test.mjs` 检查规则与站位。浏览器预览由 Cocos Creator 打开场景后启动。

当前处于阶段一：卡 01 战斗与 02a-1～3a 的抓取、携带列表、同场召唤已实现；02a-3b 的跨战斗携带恢复及卡 02b 尚未开发。`docs/` 和 `docs/archive/` 是现有设计资料，其中部分旧名称与当前已确定名称不同；实现以当前工程及华周最新指令为准。
