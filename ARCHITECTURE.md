# 青丘灵录｜当前工程架构

- 引擎：Cocos Creator 3.8.8，TypeScript；设计分辨率 1334×750。
- 入口场景：`assets/scenes/Battle.scene`，Canvas 挂载 `assets/scripts/BattleView.ts`。
- 战斗规则：`assets/scripts/Battle.ts`，不依赖 Cocos UI；数值和站位集中在 `assets/scripts/config.ts`。
- 显示与交互：`BattleView.ts` 创建战斗界面，调用 `Battle` 接收指令与显示结算结果。
- 美术：`assets/textures/` 下的背景、角色、汀蛙和玉石按钮；场景通过 SpriteFrame 引用素材。保留对应 `.meta` 文件以维持资源 UUID。
- 验证：`tests/battle.test.mjs` 和 `tests/formation.test.mjs` 检查规则与站位。浏览器预览由 Cocos Creator 打开场景后启动。

当前处于第一阶段可玩原型：卡 01 战斗、02a-1 基础抓取、02a-2 携带列表和 02a-3a 同场召唤已实现，快捷攻击、L 形按钮与自动战斗也已加入；02a-3b 跨战斗携带恢复及 02b 尚未实现。目录与资源已整理，进度见 `STATUS.md`，后续卡序见 `docs/roadmap.md`。`docs/` 和 `docs/archive/` 保存设计资料及历史版本。
