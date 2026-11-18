# 青丘灵录｜当前工程架构

《青丘灵录》是横屏单机回合制抓宠与养成游戏，使用 **Cocos Creator 3.8.8 + TypeScript**，设计分辨率为 **1334×750**。阶段进度、任务验收和构建记录见 [STATUS.md](STATUS.md)、[任务卡](docs/cards/) 和 [构建与试玩记录](docs/wechat-build.md)。

## 启动与 Asset Bundle

Web Mobile 和微信小游戏的构建配置分别位于 `settings/web-mobile-build.json` 和 `settings/wechat-build.json`。两端都从主包的 `assets/boot/Boot.scene` 启动。`assets/boot/BootView.ts` 加载 `battle` Bundle 和其中的 `assets/battle/scenes/Battle.scene`，显示进度并提供失败重试。加载完成后点「开始游戏」，游戏读取本地存档并进入城镇。

| Bundle | 源目录 | 加载与内容 |
| --- | --- | --- |
| `battle` | `assets/battle/` | Boot 加载。包含游戏场景、逻辑、界面脚本、战斗资源、人物与召唤兽面板、合宠底图及技能图标。 |
| `town` | `assets/town/` | `TownView` 按需加载。包含城镇贴图及地图人物的 Spine 资源。 |
| `outskirts` | `assets/outskirts/` | `TownView` 出城时加载。包含野外宽幅地图贴图。 |
| `inventory` | `assets/inventory/` | `BattleView` 打开背包时按需加载。包含背包与仓库面板、技能书封面及两种还童露图标。 |

人物面板、召唤兽面板、合宠和技能美术位于 `assets/battle/textures/ui/`。`art-source/` 用于保存美术源文件，构建使用 `assets/` 内导入的资源。`.meta` 记录资源 UUID 和导入配置，包括目录的 Bundle 配置。

## 玩法逻辑与界面

- `assets/battle/logic/` 是纯 TypeScript 玩法模块。战斗参数在 `battle-rules.ts`，抓取、野怪生成、资质、成长和变异的数值及公式分布在 `capture.ts`、`wild-encounter.ts`、`aptitude.ts`、`growth.ts` 和 `mutation.ts`。技能参数和法术公式在 `pet-skills.ts`，人物和召唤兽的属性计算分别由 `hero-progress.ts` 和 `pet-panel.ts` 提供。
- `assets/battle/scripts/Battle.ts` 使用这些配置和公式编排回合、指令、战斗事件及胜负结算。战斗模型可在脱离 Cocos 场景的测试中运行。`assets/battle/scripts/BattleView.ts` 接入场景输入、指令按钮、事件回放、动效、城野入口和各面板。
- `assets/battle/scripts/config.ts` 管理视口、站位、按钮位置、动画和地图可行走多边形。走路速度、地点、出生点及按距离触发暗雷的参数在 `assets/battle/logic/exploration.ts`，寻路和逐段移动在 `assets/battle/scripts/walkable-path.ts`。

## 城野与养成界面

- **城镇与野外**　`assets/battle/scripts/TownView.ts` 管理地图切换、镜头、人物移动及暗雷接线。城镇街图在 `assets/town/textures/`，野外贴图在 `assets/outskirts/textures/`。底栏提供背包和出城／回城，人物与召唤兽面板可由状态栏头像打开。城野面板与战斗共享同一个会话进度。进入面板或战斗会中止地图移动，结算后返回地图，战败走回城路径。
- **背包**　界面和道具使用确认在 `assets/battle/scripts/BattleView.ts`。`assets/battle/logic/inventory.ts` 负责道具定义、库存和掉落，`skill-books.ts` 与 `rejuvenation.ts` 分别负责打书和两种还童露。城野可使用道具，战斗背包只读。技能书共用 `assets/inventory/textures/items/item_skillbook.png`，封面叠加 battle Bundle 的对应技能图标。
- **仓库**　城内从「背包 → 仓库」进入。野外点仓库页签会提示「回城后可使用仓库」，战斗背包保持只读。`BattleView.ts` 使用 `assets/inventory/textures/warehouse_panel.jpg` 绘制左侧仓库和右侧背包，每侧可见 5×5 格，超出时独立滚动。道具气泡发起存入或取出。单件堆直接转移，多件堆弹出数量选择，默认全量，可输入或用加减按钮调整，确认数量须为 1 至来源堆可用量之间的整数。取消不写档。
- **仓库整理**　两侧默认分别按各自的库存记录顺序展示。两颗整理按钮各自按道具目录顺序重排对应侧，只改变当前仓库页的显示，不写入存档。切回背包、关闭仓库或刷新后恢复默认顺序。
- **人物与召唤兽面板**　`BattleView.ts` 绘制人物属性、潜能加点、召唤兽属性、资质技能及出战操作。人物计算在 `assets/battle/logic/hero-progress.ts`，召唤兽计算在同目录的 `pet-panel.ts`、`base-stats.ts` 和 `pet-skills.ts`，携带名单在 `roster.ts`。技能格使用图标与角标，空位和锁定位有独立文字标记，点技能可查看说明气泡。
- **合宠**　从召唤兽属性页的「炼妖」进入，关闭后回到该属性页。主界面、选宠弹窗、手动预览、确认及新宠结果在 `assets/battle/scripts/BattleView.ts`。左右父宠整栏都能打开选宠，点击同一格可选中或取消，选中合格宠物后点「选择」才放入。`assets/battle/scripts/fusion-preview.ts` 读取 `assets/battle/logic/pet-fusion.ts` 的规则，计算双亲造型概率、六项资质与成长区间及可能得到的技能。双亲同种时，并排的两张卡各显示该造型概率的一半。磐龟实际抽取率为 5%，预览只列双亲造型。主界面与预览的技能格为四列三行，超出可滚动。确认合成后才抽取并保存，保存成功后替换双亲并显示新宠结果。

## 会话、结算与存档

- `assets/battle/logic/session-progress.ts` 的 `SessionProgress` 持有人物、携带宠物、出战 ID、背包库存 `inventory`、仓库库存 `warehouse` 及结算 ID。背包道具和合宠确认先检查当前条件，保存成功后才更新会话。结算写入失败时保留待重试的候选，避免重抽掉落或重复发放。
- **仓库存取**　`assets/battle/logic/inventory.ts` 按方向、道具 ID 和数量计算两侧候选，同 ID 合堆，拒绝数量不足、非法数量及安全整数溢出。`BattleView.ts` 在提交时复核城镇、界面与保存状态，`SessionProgress.prepareWarehouseTransfer` 检查来源和两侧库存变化，并阻止重复提交。`saveProgress` 将两侧候选随完整进度一次写入主档，成功后才更新内存中的两侧库存。写入报错时两侧数量保持原状，界面显示失败原因，重新选择后按当前库存重试。
- `assets/battle/logic/local-progress.ts` 负责存档校验、快照和旧档迁移。当前版本为 **v7**，保存人物、宠物、出战选择、背包 `inventory`、仓库 `warehouse`、抓取和合成序号及最近结算 ID。两侧库存复用已知道具 ID 和非负安全整数校验。统一快照随养成、道具使用、合宠和结算的保存路径保留仓库字段。
- `ProgressLoader` 按旧版规则校验 v1～v6 存档，将原始文本备份到 `qingqiu-linglu:test-progress:backup:v<旧版本>` 后迁移到 v7，仓库初始化为空。已有进度和技能 ID 随迁移保留，v6 合宠来源的宠物可保留超过八个合法且不重复的技能。备份内容冲突时停止迁移。主档写入失败且原档未变化时，加载器保留同一迁移候选供重试。
- `assets/logic/platform.ts` 提供浏览器参数及存储适配。Web 使用本地存储，微信使用同步存储，两端沿用主键 `qingqiu-linglu:test-progress`。读档或迁移失败时保留原档，由界面显示原因并提供重试。

## 测试与浏览器验收

- `tests/*.test.mjs` 使用 Node.js 自带的 `node:test`，覆盖启动、规则、面板接线、地图移动、合宠和存档兼容等。运行全量 `node --test tests/*.test.mjs` 前，将 `COCOS_TYPESCRIPT` 指向本机 Creator 内置的 TypeScript 模块目录，供涉及 Cocos 视图的集成测试转译脚本。
- 浏览器验收使用 **ego-browser**，按任务卡在 Creator 预览或对应的 Web Mobile 构建中实点。固定遭遇、开发测试入口等由 `PREVIEW` 和 `devPreview=1` 控制，正式构建通过正常标题入口运行。微信模拟器与真机的结果在构建记录中单列。
