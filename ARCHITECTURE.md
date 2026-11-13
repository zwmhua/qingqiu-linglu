# 青丘灵录｜当前工程架构

- 引擎：Cocos Creator 3.8.8，TypeScript；设计分辨率 1334×750。
- 入口场景：`assets/boot/Boot.scene` 加载本地 `battle` Asset Bundle，加载完成后由玩家进入 `assets/battle/scenes/Battle.scene`。
- 战斗规则：`assets/battle/scripts/Battle.ts`，不依赖 Cocos UI；可调玩法规则和纯逻辑放在 `assets/battle/logic/`，表现和站位参数放在 `assets/battle/scripts/config.ts`。浏览器与微信的查询及存储接口保留在 `assets/logic/platform.ts`。
- 显示与交互：`BattleView.ts` 创建战斗界面，调用 `Battle` 接收指令与显示结算结果。
- 美术：`assets/battle/textures/` 下的背景、角色、汀蛙和玉石按钮；场景通过 SpriteFrame 引用素材。保留对应 `.meta` 文件以维持资源 UUID。
- 验证：`tests/` 用 node:test 检查规则、存档兼容和站位。浏览器预览由 Cocos Creator 打开场景后启动。

第一阶段可玩原型已完成。已实现卡 01 战斗、02a-1 基础抓取、02a-2 携带列表、02a-3a 同场召唤和 02a-3b 跨战斗携带恢复，快捷攻击、L 形按钮与自动战斗也已加入；02b 已实现并经华周试玩验收，变异在野怪出场时判定。目录与资源已整理，进度见 `STATUS.md`，后续卡序见 `docs/roadmap.md`。`docs/` 和 `docs/archive/` 保存设计资料及历史版本。
