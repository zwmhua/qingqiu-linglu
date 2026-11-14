# 青丘灵录｜当前工程架构

- 引擎：Cocos Creator 3.8.8，TypeScript；设计分辨率 1334×750。
- 入口场景：`assets/boot/Boot.scene` 加载本地 `battle` Asset Bundle，加载完成后由玩家进入 `assets/battle/scenes/Battle.scene`。
- 战斗规则：`assets/battle/scripts/Battle.ts`，不依赖 Cocos UI；可调玩法规则和纯逻辑放在 `assets/battle/logic/`，表现和站位参数放在 `assets/battle/scripts/config.ts`。浏览器与微信的查询及存储接口保留在 `assets/logic/platform.ts`。
- 共用进度：P2-02A 的 `SessionProgress` 持有人物、携带、出战 ID 和抓取编号；`local-progress.ts` 使用原键和 v3 格式读写，加点/放生成功保存后才提交内存。
- 显示与交互：P2-05 的 `BattleView.ts` 默认读取原键 v3 进度进入城镇，读档失败锁定并提示保留原档。Boot 和 Battle.scene 加载边界不变；人物/宠物面板复用原绘制及事务入口。正式地图仅移动遇怪，未开启功能仍显示未开放。
- P2-04 结算：Battle 明确给出 victory/defeat/escaped，人物逃跑在原离场时点整队撤离；原 checkWinner 的 ended 保护只发一次经验。动画播完才用原 v3 格式序列化完整候选，保存失败留场重试同一字符串，成功后回原世界位置或战败回城；待保存不能加点/放生/重置绕过。非终结抓宠仍按原时点保存。
- 地图与战斗复用同一 SessionProgress、TownView 根节点和世界位置；战斗期间隐藏地图，清理瞬态层时保留地图与 Camera。战败城图加载失败锁定回城重试。自动状态复用当前 AutoCommands 最新值，不持久化。胜利、抓胜、逃跑成功回原位停步，重新给予 180 距离保护；战败回城。
- 城镇：`TownView.ts` 从 `town` Bundle 加载 1672×941 斜俯视街图，复用 1334×750 视口、世界层跟随、镜头夹边和 180 单位/秒移动。`walkable-path.ts` 沿用现有 A* 路径规划，逐段校验并行走；`exploration.ts` 配置出生点和地点。点击地点标签打开原功能或显示未开放。波纹、人物翻转与动画只影响显示。开面板、后台/失焦、禁用、销毁清目标，UI 阻断地图触摸。
- 野外：正式出城和回城切换 `TownView` 的区域。3344×941 野外图保留在 `outskirts`，以 750 高度等比铺到约 2665.25 宽。镜头夹边移动世界层，HUD 与面板留在视口层。点击经视口换算为世界坐标，每个路径段须被凸区并集覆盖。
- 城野切换先清目标，成功加载后替换地图节点、出生位置和距离状态，失败保留来源地图与计数。位置、区域、保护和抽取余数只在会话中使用。`EncounterDistance` 先消耗 180 保护，再每 60 距离按 10% 判定；`WalkMovement.update()` 对每个实际段调用截断接口，首命中清路径、丢弃剩余位移。TownView 更新人物和镜头后才通知 BattleView 开战，怪物使用现有生成器。
- 开发样本必须同时满足 Creator `PREVIEW` 和 `devPreview=1`。`encounterSample=1` 固定当前预览的距离抽取为命中，仍须走满保护和间隔；`roundTripSample=single|pair|defeat` 固定遭遇输入，同档保存。旧直接战斗另需 `battlePreview=1`。发布构建不启用上述样本、固定开战或测试重置；正式入口无查询参数。
- 资源边界：城图及原 UUID 留 `assets/town/`；人物、面板和城镇脚本留 `battle`，Boot 不静态引用地图，town 不反向依赖 battle 脚本。不新增分包、存档键或规则迁移。
- 美术：`assets/battle/textures/` 下的背景、角色、汀蛙和玉石按钮；场景通过 SpriteFrame 引用素材。保留对应 `.meta` 文件以维持资源 UUID。
- 验证：`tests/` 用 node:test 检查规则、存档兼容和站位。浏览器预览由 Cocos Creator 打开场景后启动。

第一阶段可玩原型已完成。已实现卡 01 战斗、02a-1 基础抓取、02a-2 携带列表、02a-3a 同场召唤和 02a-3b 跨战斗携带恢复，快捷攻击、L 形按钮与自动战斗也已加入；02b 已实现并经华周试玩验收，变异在野怪出场时判定。目录与资源已整理，进度见 `STATUS.md`，后续卡序见 `docs/roadmap.md`。`docs/` 和 `docs/archive/` 保存设计资料及历史版本。
