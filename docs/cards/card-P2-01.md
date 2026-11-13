# P2-01｜逻辑整理、配置与文档对齐（qa）

基线 `origin/main` 的 `3f64cb5`。任务分支 `task/28-p2-01-logic-cleanup`，使用独立工作树。只做本地提交，不推送、不合并、不 rebase、不强推，不动 `task/13`。原工作区两张未跟踪的宠物参考图保留，不提交、不删除。

依据 [第二阶段设计定稿 v0.4](../phase2-design.md) 第 1.1、1.2 节和 P2-01。原稿归档仅更正第 13 节「仍待落实」中的地图尺寸措辞。

## 范围

1. 分开 `scripts/config.ts` 中的玩法与界面配置，使 `logic/pet-panel.ts` 只依赖逻辑配置，保留已有分领域配置。
2. 核对遭遇、身份、资质成长、基础点、伤害、防御保护、携带召唤、升级及现有宠物公式的配置来源。数组索引和控制流中的 0/1 保持原意。
3. 用限定 tsc 核实 `local-progress.ts` 的 `ProgressStorage` 同名声明，若复现则最小修复并记录到 `docs/bugs.md`。涉及存档模块的改动标 qa。
4. 更新 `docs/roadmap.md` 的阶段进度和第二阶段卡序，更新 `AGENTS.md` 的 node:test、300 行与本地提交口径，修正 `ARCHITECTURE.md` 和 `STATUS.md` 的逻辑路径。

业务和测试按相对基线增删合计最多 300 行，文档不计。超过即停下报告，不压缩代码、删有效测试或自行拆卡。不改数值、点数规则、场景和存档格式，不增加技能、道具、地图或新玩法。

## 验收

- 用 node:test 对照固定随机序列下的抓取、资质、成长、伤害、升级，并回归旧存档。保留现有 109 项测试。
- 限定 tsc 检查纯逻辑及真实传递依赖，包括 `Battle.ts` 和平台接口，记录基线及修复后的结果。
- 本机浏览器从标题旧入口打一场、抓一只、加点并刷新，对照原有资料与行为。未实测项标 NOT_TESTED。
- 重建 wechatgame，报告主包、battle 分包、总包字节数和相对上次的增量。
- 交付本地提交 SHA、改动文件、业务和测试各自的增删行数、实测结果及华周试玩步骤。

## 执行记录

- 规则来源：`battle-rules.ts` 管理遭遇数量、伤害、防御、保护、携带召唤及回合参数；`wild-encounter.ts` 管理物种、等级池和野怪面板；`baby.ts`、`mutation.ts`、`aptitude.ts`、`growth.ts`、`base-stats.ts`、`capture.ts`、`hero-progress.ts` 和 `pet-panel.ts` 保留各自领域配置。旧版本存档的专用校验仍按原版本规则执行。
- qa：`local-progress.ts` 移除重复的 `ProgressStorage` 类型，默认读取容量与战斗携带容量共用同一配置，仍为 5。存档键、版本号、序列化和旧档迁移规则沿用基线。
- TypeScript 5.8.2 限定检查：`tsc --noEmit --target ES2020 --module ESNext --moduleResolution bundler --lib ES2020,DOM assets/battle/logic/*.ts assets/battle/scripts/Battle.ts assets/logic/platform.ts`。PowerShell 通过 `Get-ChildItem` 展开逻辑文件。基线报 TS2440，整理后退出码为 0。`--listFilesOnly` 核对了全部 16 个战斗逻辑文件、`Battle.ts` 和平台接口。
- `node --test tests/*.test.mjs`：原有 109 项与新增 2 项共 111 项通过。
- 本机浏览器在基线与本卡构建都从标题进入、抓获一只变异汀蛙并获胜。人物升到 1 级，确认加 1 点体质，刷新后保留携带 3/5、体质 12、潜能 4。两版刷新前后的四份存档一致。
- Creator 3.8.8 重建 wechatgame。按构建目录字节数与 task/27 同口径对比，主包 686,275（+0）、battle 2,845,858（+613）、总包 4,773,299（+613）。微信模拟器与真机本卡 NOT_TESTED。
- 刷新后以同样输入在两版完成一场自动攻击胜利，人物获得 10 经验、出战宠升至 2 级，两份结算存档一致。
