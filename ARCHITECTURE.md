# 青丘灵录｜当前工程架构

- 引擎：Cocos Creator 3.8.8，TypeScript；设计分辨率 1334×750。
- 入口场景：`assets/scene/Battle.scene`，Canvas 挂载 `assets/scripts/BattleView.ts`。
- 战斗规则：`assets/scripts/Battle.ts`，不依赖 Cocos UI；数值和站位集中在 `assets/scripts/config.ts`。
- 显示与交互：`BattleView.ts` 创建战斗界面，调用 `Battle` 接收指令与显示结算结果。
- 美术：`assets/textures/` 下的背景、角色、汀蛙和玉石按钮；场景通过 SpriteFrame 引用素材。保留对应 `.meta` 文件以维持资源 UUID。
- 验证：`tests/battle.test.mjs` 和 `tests/formation.test.mjs` 检查规则与站位。浏览器预览由 Cocos Creator 打开场景后启动。

当前只有阶段一的卡 01 战斗原型。`qingqiu-docs/` 和 `需求文档/` 是现有设计资料，其中部分旧名称与当前已确定名称不同；实现以当前工程及华周最新指令为准。
