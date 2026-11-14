# 微信小游戏构建

## P2-06 本地交付（qa，2026-11-15）

任务：技能数据、旧宠迁移与点数口径。起始 `8674c5db14505500b2e9187c1a72d488a0db5303`，分支 `task/39-p2-06-skills`，目录 `C:/Users/hua/cocos/Project/qingqiu-linglu-task39`。最终候选以本节所在本地提交及交付答复的完整 SHA 为准，独立 QA 必须审该 SHA；不自动推送、合并或修改 STATUS。下方开工 X2/测试错误为历史停止记录，Human 已明确批准扩白与修正断言后恢复。本卡完整范围特批 700 行，卡序仍为 16 张。

### 实现与保护契约

- v4 仍使用 `qingqiu-linglu:test-progress`。v1/v2 使用原临时面板及名单规则，v3 使用原正式派生值及允许单宠的名单规则；原始字符串先备份到 `qingqiu-linglu:test-progress:backup:v1|v2|v3`。相同备份复用，不同备份冲突锁定。未知版本、技能或写回会丢失的业务字段拒绝；不回退新档。
- 完整候选校验、主档原值复核、写入成功后才创建可玩会话。同实例主档写失败重试相同字节；刷新已提交 v4 不抽取。开发测试重置只清主档，保留备份。P2-04 的战后结算一次写完整 v4，保留原同候选重试。
- 12 技能数据和说明复用配置，初始宠与敌方使用独立随机源；抓取保持技能顺序。自然池不含雷击术/火球术；已拥有合法技能不受自然池白名单限制。资质页 8 个拥有/空位及 4 个锁定格，文字占位、天生标记、说明浮窗，不接技能战斗效果。
- 宝宝每级五项各 +1、潜能 +5；野生每级五项各 +1、新获 5 点按原算法自动分配，旧余额保留且可手加。总额为 `50 + 10 × 真实等级`，人物原规则不变。

### 实际自测与回修

`COCOS_TYPESCRIPT=E:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript`。证据均保留在本工作树忽略目录 `temp/p2-06/`。

| 检查 | 本地实际结果与证据 |
| --- | --- |
| 测试先行 | `red.log` 缺新增技能模块/迁移入口；`points-red.log` 野生旧余额应为 3、实际 13；`ui-red.log` 启动重试和技能页缺实现 |
| 12 条说明 | Human 允许替换错误长度断言，逐条精确核对设计 4.1，保留动态配置和必带说明；`description-red.log` 先捕获三术说明多出的“术”字，再修显示文字 |
| Creator 兼容回修 | ego-browser 正式入口报技能池配置无效；构建把 `[...new Set(pool)]` 降为 `[].concat(new Set(pool))`。`creator-spread-red.log` 先复现数组展开降级错误，改 `Array.from` 后 `creator-spread-green.log` 3 项成功；不改引擎配置 |
| 切宠浮窗 | `slot-red.log` 捕获原携带槽切换未清浮窗，补清理；保留原面板入口 |
| 全量 node:test | `node --test tests/*.test.mjs`，160 项成功、0 失败、0 跳过，退出 0；`all-final.log` |
| 限定 tsc | 纯逻辑全部 `.ts`、Battle.ts、platform.ts 及真实传递依赖，strict/ES2022/module ESNext/node resolution/noEmit/skipLibCheck，退出 0；`tsc.log` |
| 额外全 View 类型审计 | 退出 2，仅既有 Tween `onUpdate` TS2322；起始归档在 553 行、本卡在 568 行为相同签名错误，见 `tsc-view-baseline.log` / `tsc-view.log`，不宣称这项成功 |
| 主线/落卡 | 最终 fetch 后 origin/main 仍为起始 SHA；附件与原样卡 SHA256 均为 `F1C6FD24701819D1125182DEF6E85196501AAF2AAA414EB718C030BBDB2DEE11` |

受影响旧回归预期只按批准规则改变：`p2-01-regression` 加入 skillIds 及确定性技能输入，野生新增点自动分配；旧档原版归一化断言保留并核对迁移备份。`pet-progression`、`session-progress`、`town-progress-integration` 的手加旧潜能夹具从五项预算移入旧余额，保留总额守恒与确认事务断言；没有删除有效测试。

### ego-browser 试玩与隔离资料

正式入口：`http://127.0.0.1:18386/`，无参数，服务本工作树 `build/web-mobile`。样本入口：`http://127.0.0.1:18387/?scene=3ca2435e-bec8-4656-9bf9-63cfaadc18b7&devPreview=1&roundTripSample=single`，18387 仅代理本工作树 Creator 7459 预览。该 origin 在写夹具前已核对 localStorage 为空，和正式入口、历史 7456/7457/7458/7459 试玩地址隔离；不自动向玩家存档写样本。

本地准备文件为 `temp/p2-06/make-fixtures.mjs` 与 `fixture-v1.json`、`fixture-v2.json`、`fixture-v3.json`。生成脚本直接调用现有 SessionProgress、Battle 捕获与原版本面板，再用 ProgressLoader 验证；不是另建产品入口。v3 包含两只 initial 汀蛙、caught-1 野生磐龟、caught-2 磐龟宝宝，出战 caught-1；抓取编号为 3。原五项/潜能如下，顺序为体质/法力/力量/耐力/敏捷：

| 个体 | 等级/经验 | 五项 | 旧潜能 | 迁移固定输入 0.5 后技能 |
| --- | --- | --- | --- | --- |
| pet 初始汀蛙 | 2 / 29 | 3/3/55/3/3 | 3 | combo |
| pet-2 初始汀蛙 | 1 / 19 | 1/1/53/1/1 | 3 | combo |
| caught-1 野生磐龟 | 3 / 39 | 1/1/73/1/1 | 3 | armor, regen |
| caught-2 磐龟宝宝 | 0 / 9 | 1/1/46/1/1 | 0 | armor, regen |

重新演示仅在明确隔离且为空的新样本 origin：标题准备好后注入 `fixture-v3.json` 原字符串；暂时包装 Storage.setItem，使主键写入抛错、备份正常，并记录候选字节；技能随机设 0.5。点开始，检查锁定与原档/备份；解除写故障、将随机改为抛错，再点「重试读取/迁移」，确认仍能成功且两次候选相等。恢复 Storage.setItem；刷新两次时把随机设为抛错，读取仍成功，主档字符串不变。此故障注入仅存在于验收页面内存，刷新消失。已有样本 origin 再演示前须先另存其当前主档，不清旧备份。

| 实际操作 | 观察结果 / 截图文件（temp/p2-06） |
| --- | --- |
| v3 标题进入，主档写入故障 | 明确错误、无法操作地图、未建会话，主档和 v3 备份均等于原字符串；`migration-failed.png` |
| 同实例解除故障点击重试 | 两次主档候选逐字相等，写 v4 才进入城镇；未再次抽取 |
| 打开磐龟资质技能 | armor/regen、6 空位、4 锁定格，硬甲标天生；`pangui-skills.png` |
| 点硬甲、外侧地图、关闭、切宠 | 左文字徽章/右名称/下配置说明和天生附加行；点遮罩后位置不变、无目标；关闭并切宠正常；`innate-popup.png` |
| 连续两次刷新 | 原始等级、五项、潜能、资质与技能保持；整段已提交主档字符串不变 |
| 旧野生潜能手加 | caught-1 体质 1→2、潜能 3→2，点击确认保存；`old-potential.png` 为操作前证据 |
| 固定战斗野生升级 | 3→4 级，五项变 3/2/79/2/2，潜能保持 2；系统额外 5 点投入力量，升级总额仍 90。该场超时默认攻击实际获胜 |
| 固定抓取 | 下一场开战立即点抓取敌方、宠防御，敌方技能 `[combo]` 与新 caught-3 一致且顺序保留；刷新后 v4 不变；`captured-skills.png` |
| 宝宝实际参战获胜 | 下一场人物召唤第 4 只 0 级宝宝、旧宠防御，下一回合开自动；宝宝 0→1、五项 2/2/47/2/2、潜能 0→5；`summon-baby.png`、`baby-upgrade.png` |
| initial 旧潜能 | 刷新后选首只汀蛙，体质 3→4、潜能 3→2，确认保存；初始宠与野生旧潜能均可手加 |
| Web 手机尺寸模拟 | 最终正式构建在 ego-browser 同轮设 844×390 并重载，实际 inner/canvas 均为 844×390；实点打开噬血说明、关闭与关面板，`web-mobile-844.png`。仅桌面尺寸/触摸模拟，真实手机 NOT_TESTED |

固定战斗复用既有 single 预览，非宝宝、不变异、汀蛙 1 级；遭遇/抓取输入 0，资质/成长/五项 0.5，技能输入由隔离页面 Math.random=0.5 控制，故为 combo。正式构建不启用固定开战或样本参数。

### 构建与包体

Creator 3.8.8，原 `settings/web-mobile-build.json` / `settings/wechat-build.json`，修补后两平台均退出 36、日志 Finished，见 `repair-web-mobile.log`、`repair-wechat.log` 及对应 exit.txt。首轮构建虽成功但浏览器暴露 Set 转换错误，不能作为最终可玩证据；最终产物已重新打开无参数正式入口、进城/出城/原宠技能页/回城，`formal-town-final.png`、`formal-outskirts-skills.png` 记录实际显示，运行时 devPreview=false、主档 v4。

基线复用 P2-05 最终验收产物（a4b4012）；已核对其与本卡起始 8674c5d 的 Git 差异仅 STATUS.md，业务、资源、构建配置完全相同。按全部产物文件字节求和，非上传压缩大小；Web 主包排除四个 Bundle，微信主包排除 subpackages。`package-bytes.json` 为实际测量。

| 项目（字节） | 基线 | 本卡最终 | 增量 |
| --- | ---: | ---: | ---: |
| Web 主包 | 2,835,648 | 2,835,648 | 0 |
| Web battle | 3,026,807 | 3,035,008 | +8,201 |
| Web town | 1,923,710 | 1,923,710 | 0 |
| Web outskirts | 594,500 | 594,500 | 0 |
| Web inventory | 57,666 | 57,666 | 0 |
| Web 总包 | 8,438,331 | 8,446,532 | +8,201 |
| 微信主包 | 919,168 | 919,168 | 0 |
| 微信 battle | 3,026,640 | 3,034,841 | +8,201 |
| 微信 town | 1,923,710 | 1,923,710 | 0 |
| 微信 outskirts | 594,500 | 594,500 | 0 |
| 微信 inventory | 57,666 | 57,666 | 0 |
| 微信总包 | 6,521,684 | 6,529,885 | +8,201 |

微信主包低于 3.5 MB 停止线。未改 Bundle、素材、UUID 或构建配置；Creator 自动产生的 engine.json 换行差异经规范化核对后恢复，不纳入本卡。相对起始提交，业务与测试实际合计 522 行（含新增文件；文档和 meta 不计），在 700 行特批内。

### 未验证与交接

微信开发者工具模拟器、本轮微信真机、真实手机浏览器均 `NOT_TESTED`；桌面触摸输入及尺寸模拟不等于手机实测。技能效果、备份手动恢复/删除工具不在本卡范围。原工作区的 logic.meta 修改与未跟踪美术、其它工作树均保留。本卡不修改 STATUS；建议华周验收后登记「P2-06 技能数据/旧宠迁移/点数口径（qa），验收 SHA：____」，下一步 P2-07 数值类被动，另行定稿授权。

## P2-06 开工复估与 X2（2026-11-15，历史记录）

续行记录（2026-11-15）：Human 已批准将 `tests/p2-01-regression.test.mjs` 扩入白名单，原白名单 X2 解除，仍执行整卡 700 行。已先运行技能/迁移新增测试（缺少模块与 ProgressLoader 的失败），再加入技能数据及生成、点数分配和迁移候选逻辑；野生新增潜能负例先得到 13 而非保留旧余额 3。正式 UI 接线尚未完成。

测试错误停止记录（2026-11-15）：新写 `tests/pet-skills.test.mjs` 第 29 行使用了无卡面依据的说明长度 >12 断言，卡面迅捷说明“速度提高10%。”不满足该限制。定向执行实际为 4 成功、1 失败（`temp/p2-06/migration-tests.log`），失败属于测试自身错误。依据 AGENTS“测试本身有错：停下报告，不自己改”，暂停在发现处，未改长产品文案迎合断言。建议经 Human 确认后将长度断言替换为 12 条卡面文案的逐项精确校验，并保留动态配置取值与必带说明断言。当前改动未提交，后续 UI、全量测试、限定 tsc、ego-browser、构建及最终 SHA 独立 QA 均待完成；此次定向测试不代表整卡验收。

Human 已批准附件完整范围一次交付、仅本卡业务与测试增删上限 700 行，主卡序仍为 16 张。附件中“等待授权”为发卡时的历史状态，以本轮批准为准。已 fetch origin/main，基线为 `8674c5db14505500b2e9187c1a72d488a0db5303`，P2-05 验收提交 `a4b40128c634bf983beb163cfe574ee5147858db` 为其祖先。main 工作树干净；原工作区 logic.meta 修改与未跟踪美术保留。

新建独立工作树 `C:/Users/hua/cocos/Project/qingqiu-linglu-task39`，分支 `task/39-p2-06-skills`。原样落卡 `docs/cards/card-P2-06.md`，附件与落卡 SHA256 均为 `F1C6FD24701819D1125182DEF6E85196501AAF2AAA414EB718C030BBDB2DEE11`。已读取当前 AGENTS、ARCHITECTURE、任务卡、生成/升级/存档和启动面板接线。

以下为基于真实调用链的初步增删估算，含改写的两侧，文档和生成 meta 不计。新增文件名以卡面为准，受影响测试只按需修改；本表不是实际 diff。

| 文件或测试组 | 预计增删 | 工作 |
| --- | ---: | --- |
| `assets/battle/logic/pet-skills.ts` | 85–105 | 12 技能及参数、物种池、生成/校验、配置取值说明 |
| `assets/battle/logic/session-progress.ts` | 10–16 | 初始宠生成一次，独立随机输入 |
| `assets/battle/logic/roster.ts` | 24–34 | 列表复制与捕获继承，野生升级只分新获点数 |
| `assets/battle/logic/base-stats.ts` | 8–14 | 复用现有随机分配口径处理新增点数 |
| `assets/battle/scripts/Battle.ts` | 16–24 | 敌我列表与生成输入接线，避免扰动原战斗随机序列 |
| `assets/battle/logic/local-progress.ts` | 95–125 | 显式版本分支、字段校验、备份冲突、候选与原档比对及同候选重试 |
| `assets/logic/platform.ts` | 8–14 | 原键及按旧版本备份存取 |
| `assets/battle/scripts/BattleView.ts` | 75–95 | 启动错误原因/重试，技能格、浮窗及关闭/阻断 |
| `tests/pet-skills.test.mjs` | 34–46 | 分布边界、必带/去重、书本专属排除、12 文案 |
| `tests/progress-migration.test.mjs` | 58–78 | 各原版校验、备份、故障/冲突/未知字段、同候选、刷新 |
| `tests/pet-progression.test.mjs` | 26–36 | 身份升级、旧潜能保留、多级/封顶及守恒 |
| `tests/town-progress-integration.test.mjs` | 24–34 | 正式启动锁定、重试和技能页交互 |
| 卡面其余受影响测试合计 | 18–26 | 生成/捕获/读回夹具及新契约预期 |
| `tests/p2-01-regression.test.mjs`（待批准扩白） | 20–30 | 保留回归目标，更新与 P2-06 有意改变行为冲突的夹具和预期 |
| **业务 / 测试 / 合计** | **321–427 / 180–250 / 501–677** | 初步在 700 内，实施时继续按实际累计复核 |

X2 留痕（2026-11-15）：卡面未列入 `tests/p2-01-regression.test.mjs`，但其第 38 行起完整比较抓获宠物旧结构，第 54–55 行断言初始野生 pet 升级得到 5 点未分配潜能。P2-06 要求 skillIds 及野生新增 5 点自动分配，因此需更新该有效回归测试。其第 58 行起还绑定 v1/v2 读取为 v3 的旧入口契约，须结合最终迁移入口安排保留原版归一化验证并增加新版读回验证。不得为满足旧断言而保留错误的正式升级行为，也不得删除测试。按 AGENTS 的白名单外文件门禁，在新增产品代码和测试之前停止。

已运行基线 `node --test tests/p2-01-regression.test.mjs`，2 成功、0 失败、退出 0。该结果确认原测试在当前基线有效，不代表 P2-06 已实现。所需授权仅为增加上述测试文件至白名单，允许按已批准玩法更新受影响预期和确定性输入，同时保留战斗、捕获、人物经验、旧档资料保留的有效断言；仍按整卡 700 行计算。

当前实际业务与测试 +0/-0，仅落卡及本记录，尚未提交。P2-06 新失败测试、限定 tsc、浏览器、Web/微信构建与包体、微信模拟器/真机及绑定最终 SHA 的独立 QA 均 NOT_TESTED，原因是白名单 X2 在实施前停止。无最终候选 SHA。待扩白后继续先测试再实现及完整验收。

## P2-05 开工复估与 X2（2026-11-15，历史停止记录）

本节只记录本卡开工检查，不代表实现、自测或试玩验收完成。用户本轮明确要求保留原工作区及素材，在干净独立工作树开发，单卡业务与测试增删仍按 300 行门槛。

- 已执行 `git fetch origin main`；最新远端为 `5d93387ecb654d0a174701aea5720d67cf311743`，与策划基线一致。`git merge-base --is-ancestor a2b5b9a751543dca785e7a06051ea22ded9829b8 origin/main` 返回 0，STATUS 记录 P2-04 已合入。
- 原目录在 `task/26-boot-subpackage`，有 `assets/battle/logic.meta` 修改及未跟踪美术。按本轮明确授权保留，未清理、覆盖或切分支。已列出现有 worktree；未复用其它任务目录。
- 新分支 `task/38-p2-05-dark-encounters`，独立目录 `C:/Users/hua/cocos/Project/qingqiu-linglu-task38`，起始 HEAD 为上述完整 SHA。创建后 `git status --short` 无输出。
- 附件原样复制到 `docs/cards/card-P2-05.md`；两份 SHA-256 同为 `7B95DF006DBEC6F088F04EBA2BAD3C7C5932B1F3D9B910B1FC33DF9FC2B1990E`。
- 已读最新主线 AGENTS、ARCHITECTURE、卡片、相关设计及真实调用链。旧工作区的阶段一文件不作为本卡执行基线。
- 两张 JPG 与 meta 均存在：城镇 `town_qingqiu_streets`，meta 尺寸 1672×941、UUID `a89cf5e7-55a5-49f0-9b04-c1cb71cff9c1`；野外 `map_qingqiu_outskirts_wide`，3344×941、UUID `d7908920-076d-4b75-99ab-4ce7f3577b0c`。TownView 引用匹配；各自目录声明 town/outskirts Bundle。仅静态核对，尚未证明运行加载或滚屏显示正常。

### 按实际调用链复估

下表是相对起始提交的预估增删总和，不是新增行数或实测 diff；文档不计。已考虑复用 P2-04 的结果保存与回场测试，不重写 Battle、存储、Boot、资源或构建配置。

| 白名单文件 | 预计增删 | 必要工作 |
| --- | ---: | --- |
| `assets/battle/logic/exploration.ts` | 36–44 | 区域遇怪参数、保护和余数状态、逐阈值判定及首命中距离，保留浮点边界语义 |
| `assets/battle/scripts/walkable-path.ts` | 20–26 | 在现有逐段 while 中提交实际步长；段中/段末命中均停止并丢弃剩余路径，保留原调用方式 |
| `assets/battle/scripts/TownView.ts` | 28–36 | 成功换区才重设状态，移动阻挡与真实段回调，位置及镜头更新后通知开战，战后重置入口 |
| `assets/battle/scripts/BattleView.ts` | 66–84 | 无参数同档进城、显式开发路径隔离、读档失败锁定和提示、移动开战与固定开战共用接线、回场保护、开发控件收敛 |
| **业务合计** | **150–190** | 不改生成器、存档键或格式 |
| `tests/outskirts-exploration.test.mjs` | 36–44 | 0/1 概率、180/240 边界、小数余数、多个阈值先失败后命中及帧切分等价 |
| `tests/town-pathfinding.test.mjs` | 30–38 | 真实多段拐弯大/小帧命中同点、段末命中、清路径及余下位移丢弃 |
| `tests/town-progress-integration.test.mjs` | 104–128 | 更新有意变化的启动预期及开发入口夹具；补实际移动开战、单场锁和位置/镜头顺序、面板/后台计数保留、加载失败与成功初始化、旧档刷新/坏档保护；在原结果测试中补回场保护断言 |
| `tests/boot.test.mjs` | 0 | 现有两平台 Boot/Battle 场景及分包配置断言可继续复用 |
| **测试合计** | **170–210** | 保留现有保存失败、同候选重试、捕获进度、自动最新选择及败回城失败断言 |
| **总计** | **320–400** | **超过 300 行，触发 X2** |

估算差异的具体依据：`WalkMovement.update()`（起始版第 104 行）直接在循环内改位置，尚无消费距离或截断接口；`TownView.update()`（第 282 行）只能看到整帧前后位置，不能用两点距离覆盖绕行。必须增加逐段截断的逻辑和测试。

现有集成夹具 `roundTripView()`（第 361 行）直接指定位置再调用 `startFixedBattle()`，能证明回场却不能证明移动触发、保护计数和镜头完成后的单次开战。可复用夹具与 P2-04 断言，但新增移动路径验收仍需独立断言。`BattleView` 的 `townPreview` 同时决定地图模式与开发入口，`usesTestProgress` 又决定读写；不能只把地图开关改成 true 就视为完成入口隔离。集成测试第 351 行和第 517 行还明确依赖无参数直接战斗，需要保留各自有效验证目标并调整入口，替换行的增删均计入预算。

### 门禁与后续建议

X2 留痕（2026-11-15，Asia/Shanghai）：完整范围复估业务 150–190、测试 170–210，合计 320–400，超过项目 300 行上限；停止在新增测试和产品实现前，未压缩代码、删除断言或自行放宽门槛。实际业务/测试改动均为 +0/-0。

建议交华周决定：维持主卡编号，将 P2-05 内部分两次授权交付，先完成纯距离判定、逐段移动截断及真实地图开发预览接线，再完成正式入口/开发隔离、同档安全与完整验收；两步各自复估且各不超过 300，第一步不得记整卡完成。另一选择是明确批准完整范围单卡 400 行上限；这仍是估算上界，实际超限继续按 X2 停止。未自行执行任一选择。

本轮只落原卡和本节门禁记录，尚未提交，无最终候选或 QA 所审 SHA。未推送、合并或修改 STATUS。待后续完整验收时，STATUS 建议条目为「P2-05 暗雷与场景正式闭环（qa），填写华周实际验收 SHA；验收后下一步 P2-06」，目前不得登记已完成。

NOT_TESTED：node:test、限定及全视图 tsc、ego-browser、无参数正式试玩入口、确定性遇怪样本、Web/微信构建与同口径包体增量、Web 手机实操、微信模拟器、微信真机、独立静态 QA。原因是实施前 X2 停止，未产生本卡功能候选；历史 P2-04 的运行证据不作为本卡结果。

## P2-05 本地开发交付（2026-11-15，qa）

华周本轮明确解除上节 X2：完整范围上限 400 行、不拆卡，在现有独立工作树继续，先测试后实现；实际超限仍须停止。原附件未改，新的授权记录在本节。分支 `task/38-p2-05-dark-encounters`，起始 SHA `5d93387ecb654d0a174701aea5720d67cf311743`；含头像修补的最终提交及独立 QA 所审完整 SHA 以交付消息和 `temp/p2-05/qa-repair-final.md` 回执为准。STATUS 未改，未推送或合并。

### 实现与运行检查

- 正式 Boot → Battle.scene → 同档城镇，无查询参数；保留原存档键、v3 格式、Boot 加载边界及全部资源。坏档或读取抛错锁定地图操作，不创建 SessionProgress/Battle，不写回。
- `OUTSKIRTS.encounter` 配置 180 保护、60 间隔、10% 概率。`EncounterDistance.advance()` 只消费实际路径段；`WalkMovement.update()` 在首命中点截断并清路径；TownView 先更新人物和镜头，再调用原地图开战入口。成功换图、胜/抓胜/逃回场重新保护，地图加载失败保留来源和计数。
- 自动状态沿用会话最新选择；开面板、后台、禁用、切图及战斗阻断移动，关闭/返回不续走。保持 P2-04 动画后保存、同字符串重试、战败回城失败锁及一次结算。
- 含头像修补的本卡业务 +94/-28 = 122，测试 +234/-11 = 245，合计 **367 行**，低于 400。文档、原样卡片、忽略的构建与验收产物另计；首轮 315 行为修补前记录。
- 先运行新增失败用例，再实现：`node --test tests/outskirts-exploration.test.mjs tests/town-pathfinding.test.mjs tests/town-progress-integration.test.mjs`，原失败日志 `temp/p2-05/red-tests.log`。后台目标及十进制帧边界另有先失败后修复日志 `foreground-red.log`、`fractional-red.log`。
- 头像修补后 `node --test tests/*.test.mjs`：150 项成功、0 失败、0 跳过，日志 `repair-tests.log`（首轮 `tests.log` 为 149 项）。环境 `COCOS_TYPESCRIPT=E:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript`，没有新增依赖或改有效断言。
- 限定 tsc：`node <COCOS_TYPESCRIPT>/bin/tsc --noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution node <assets/battle/logic/*.ts全部文件> assets/battle/scripts/Battle.ts assets/battle/scripts/walkable-path.ts assets/logic/platform.ts`，退出码 0，真实传递依赖包含在内。
- 额外全视图严格 tsc 使用同一 Creator cc/cc.env 声明及 `--experimentalDecorators`。候选与起始 SHA archive 均只有 Tween onUpdate 可选 Node 参数的同一 TS2322；未修改白名单外的动效或声明来掩盖基线问题，不声称全视图严格检查成功。
- 开发回修留痕：保留旧 PREVIEW 显式条件并增加开发开关，以保留旧样本共用经验路径的源断言；后台迟到目标由 hide/show 阻挡；0.1×2400 的舍入漏检以 1e-9 世界单位容差修复。业务问题和复现均记入 `docs/bugs.md`，尚无 QA 打回回修。

### ego-browser 逐项证据

使用独立 ego TaskSpace 32。正式 Web 发布构建地址 `http://127.0.0.1:18385/`，静态服务为本工作树 `build/web-mobile`。测试在本机浏览器进行，不代表手机实体触摸或微信平台验收。没有把人工编造的进度写入存储；两个本地来源的进度均由实际开始、战斗与抓宠产生，原用户浏览器及素材未清理。

| 验收点 | 实际观察与证据（均在 `temp/p2-05/`） |
| --- | --- |
| 正式无参数标题进城 | 实点开始后城镇出生 `(690,443)`，`dev=false`，未创建 Battle；出城只有自动和养成/回城按钮，没有固定开战/样本控件。`browser-13/15/16.log`、`formal-town.png`、`formal-field-state.png`、`formal-title-ready.png` |
| 城内走动与首次保护 | 城内走到 `(842.5978,467.6814)` 不计数；出城 `(540,375)` 为 180/0。走到约 `(659.6162,375.0689)` 保护余 60.383744，尚无战斗。`browser-04/05.log` |
| 宠物面板阻挡 | 在保护内开面板、点击遮罩、关闭后位置和保护均不变，目标清空。`browser-06.log`、`protected-pet-panel.png` |
| 实际 240 距离命中 | 再次点地，首次命中 `(779.999980,375.068881)`，镜头原点 `(112.999980,0)`，清目标、开一场。小数是 CSS 点击落点造成，两段合计 240。`browser-06.log`、`first-240-encounter.png` |
| 自动与胜利 | 野外开自动后进场实际出手；胜利回原位停步并重设 180/0。第二场中关闭自动，回图及下一场均关。`browser-07/08/09.log`、`auto-victory-return.png` |
| 逃跑返回 | 整队逃跑后回 `(1259.999980,375.068881)`，无本场经验、180/0，自动保持关。`browser-09.log`、`escaped-return.png` |
| 抓胜、保存失败和重试 | 当前页面仅对原键的 setItem 注入抛错；抓最后一只后留结果页、旧快照不变；失败重试候选相同，恢复原方法并点重试后保存字符串精确等于候选，回原位，三只宠物保留。`browser-10/11.log`、`capture-save-failed.png`、`capture-retry-return.png` |
| 战败与刷新 | defeat 样本实际击败全队后回城；人物面板气血 60/60、法力 36/36，三只宠物与经验保留；刷新从城镇出生且自动关。`browser-11/12.log`、`defeat-town.png`、`defeat-hero-panel.png` |
| 正式读档失败 | 在页面启动前拦截读取返回坏 JSON，不改磁盘原档；正式标题进入后显示读取失败、Session/Battle 均无、写入计数 0、原始字符串不变。移除注入并刷新后正常读取原进度。`browser-17.log`、`formal-bad-read-locked.png` |
| 地图加载失败 | 单次拦截 outskirts 加载失败，留城镇并显示重试提示；再次点出城成功，保护 180/0。`browser-18.log`、`outskirts-load-failed.png` |
| 滚屏与边缘 | 仅当前开发页把随机输入临时设为 0.99，沿岸走到 `(2264.3631,589.9457)`，镜头夹在右端 `1331.249734`；HUD 固定，画面不露白。刷新取消输入替换，不改变区域配置或存档。`browser-18/19.log`、`outskirts-right-edge.png` |

### 最终构建与同口径包体

同一 Creator 3.8.8、仓库原有两份构建配置；基线为起始 SHA 的 `git archive` 独立副本。基线 Web/微信和头像修补后的最终候选 Web/微信均退出 36。最终日志为 `repair-web-mobile.log`、`repair-wechat.log`，测量为 `repair-package-bytes.json`；首轮 final2 日志仍保留。按所有产物文件字节求和，非上传压缩大小。微信主包排除整个 subpackages；Web 的主包口径为排除 battle/town/outskirts/inventory 四个 Bundle 后的其余全部文件（含引擎、main、internal）。

| 平台/目录 | 基线字节 | 最终字节 | 增量 |
| --- | ---: | ---: | ---: |
| Web 主包口径 | 2,835,648 | 2,835,648 | 0 |
| Web battle | 3,024,770 | 3,026,807 | +2,037 |
| Web town | 1,923,710 | 1,923,710 | 0 |
| Web outskirts | 594,500 | 594,500 | 0 |
| Web inventory | 57,666 | 57,666 | 0 |
| Web 总包 | 8,436,294 | 8,438,331 | +2,037 |
| 微信主包 | 919,168 | 919,168 | 0 |
| 微信 battle | 3,024,603 | 3,026,640 | +2,037 |
| 微信 town | 1,923,710 | 1,923,710 | 0 |
| 微信 outskirts | 594,500 | 594,500 | 0 |
| 微信 inventory | 57,666 | 57,666 | 0 |
| 微信总包 | 6,519,647 | 6,521,684 | +2,037 |

微信主包低于 3.5 MB 停止线。未改构建配置、场景、UUID 或资源。Creator 自动改写的 engine.json 经规范化字节核对只有换行变化，恢复本轮生成的换行差异，不纳入提交。

辅助工具记录：首次预览资源就绪前截图超时，等就绪后解除；一次等待自动回场超时，随后实际观察其自然完成，没有缩短产品动画。小数边界修复后的首次重建与打开的编辑器共用工程时未能推进，已停止本轮自建的预览/构建进程并串行重建，第二轮两平台均成功；只对验收页忽略缓存，未清理浏览器配置或存档。正式页实测 `EncounterDistance` 以 0.1×2400 在 240 处命中，确认最终修复已加载（`browser-20.log`）。

最终输入复核：ego 的鼠标操作在按下与抬起之间触发页面 visibilitychange → Cocos hide，实际调用 stopTown 清触点（`browser-22/23.log`），导致该次点地被正确取消；两轮等待未解除后没有继续重复等待脚本或修改保护规则。改用浏览器协议触摸输入实际点地，发布包走到 `(800.069393,399.556382)`、保护 0、余数 21.226157，无 visibility 事件（`browser-25/26.log`、`final-touch-walked.png`）。这是桌面浏览器模拟触摸，不是手机实机结论。

最终预览重新确认修复代码已加载，并实际触摸完成「出城 → 保护内分段停步 → 打开/关闭宠物面板 → 继续行走 → 首次命中 → 自动战胜回图」。命中和返回同为 `(779.999762,374.760843)`，镜头 `(112.999762,0)`；胜后 180/0、无目标（`browser-27.log`、`final-preview-240.png`、`final-preview-return.png`）。最终 TownView 严格 tsc 退出 0（`tsc-town-final.log`）。

### 华周反馈：出城头像消失修补（2026-11-15）

首轮本地提交 `23ee459106fb0f0c5b5e284b80e0e257e4c3e525` 后，华周要求城野复用现有状态卡，并沿用整卡 400 行上限。回修原因是 `renderTown()` 只在 town 区域调用状态卡；现去掉区域限制，保留状态卡原坐标、同一 SessionProgress、原头像面板回调和 BlockInputEvents。没有增加存档写入或新 UI。

先新增集成测试，实际得到 12 成功、1 失败，失败信息为 `outskirts must show both portraits`（`repair-red.log`）；再修改实现。新用例覆盖城镇→野外→城镇、原 HUD 父节点与坐标、原人物/宠物入口、同一进度和无额外保存。全量结果 150/150；纯逻辑及 TownView 限定严格 tsc 均退出 0（`repair-tsc.log`、`repair-tsc-town.log`）。有效旧测试未删。两平台重新构建及最新包体已更新到上表。

本轮在同一 ego TaskSpace 32 使用真实浏览器触摸输入，未直接调用产品方法代替点击，未替换随机源或存档。正式 Web 发布包完成头像与滚屏交互，显式 single 开发样本完成战胜回场：

| 验收 | 实际结果与本地证据（`temp/p2-05/`） |
| --- | --- |
| 出城显示 | 正式标题进城后点出城，人物与出战 pet 两张头像及状态条可见，均有 SpriteFrame、父节点为 town-ui。`repair-browser-02.log`、`repair-formal-field.png` |
| 滚屏固定 | 走到 `(700.060719,374.760843)`，镜头原点从 0 移到 `33.060719`；两头像局部坐标始终为 `(271,321)`、`(467,321)`，显示位置不随世界层移动。`repair-browser-03.log`、`repair-formal-scrolled.png` |
| 原面板与不穿透 | 先后实点宠物及人物头像，打开对应原属性面板；再点面板区域并关闭。选中宠物为当前出战 pet，位置、保护余量 `19.939103` 均不变，目标为空，同一 progress 对象未替换。`repair-formal-pet-panel.png`、`repair-formal-hero-panel.png`、`repair-browser-03.log` |
| 战胜回野外 | 显式开发样本实际走满 240 触发一场，开自动战胜后回 `(779.999978,374.897521)`、镜头 `112.999978`，180/0 且停步。两头像恢复在原位置，分别点击仍打开原面板且不移动。`repair-browser-04/05.log`、`repair-victory-return.png` |
| 回城 | 正式包和样本战后均实点回城，回 `(690,443)`，两张状态卡仍可见，同一进度保留。`repair-formal-return-town.png`、`repair-post-battle-town.png`、`repair-browser-04/05.log` |

本轮修补属于华周试玩反馈，未发生 QA 打回。整卡实际 367/400 行；文档补丁曾因匹配不到标题而整体未应用，按真实标题重作后完成，未改产品代码或断言绕过工具错误。最终提交后由独立 QA 对新完整 SHA 重新静态审查，回执保存在 `qa-repair-final.md`，旧 `qa-final.md` 仅对应修补前 SHA。Web 手机、微信模拟器和微信真机仍为下节 NOT_TESTED，Human 最终试玩未代签。

### 华周试玩入口与确定性样本

- 无参数正式入口：`http://127.0.0.1:18385/`，点击「开始游戏」进城；点「出城」后正常按 10% 遇怪。本机 HTTP 服务已启动，跨设备需另行配置可访问地址，本次未开放外网。
- 最终 Creator 开发预览：`http://127.0.0.1:7456/?scene=66ba6897-199f-4cf3-acc4-a475045cdfa8&devPreview=1&encounterSample=1&roundTripSample=single`。早期证据使用 7459，最终重新启动预览使用 7456；不同端口是不同浏览器存储来源，不搬运或覆盖两处资料。
- 在设计视口 1334×750 下点右下「出城」约 `(1215,706)`；从野外出生 `(540,375)` 点地 `(660,375)`，在保护内停步；打开宠物面板后关闭，人物应仍停着。再点 `(1100,375)`，累计实际路程 240 后在约 `(780,375)` 首次遇怪。屏幕缩放会有亚像素差异，实际世界路程仍为 240。
- `encounterSample=1` 只在当前显式 Creator 预览中令检查必命中，仍保留 180 保护和 60 阈值；移除该参数即恢复 10%。`roundTripSample` 可换 `pair` 或 `defeat`，分别为两敌或必败遭遇；只改遭遇输入，不初始化覆盖旧档，不把参数入档。
- 野外开自动再走动，战斗中点取消，回图后下一场应沿用关；胜/抓胜/逃成功返回命中点停步，败回城且满血法力。正式发布构建忽略这些开发参数。

### 未测项与交接边界

- **Web 手机实体浏览器：NOT_TESTED**；上述为桌面 ego 上的 web-mobile 构建及 Creator 预览，不冒充手机实操。
- **微信开发者工具模拟器：NOT_TESTED；微信真机：NOT_TESTED**。本轮实际运行微信构建，不上传、不发布。
- 原生后台切换的 browser 实操 **NOT_TESTED**：切换标签的尝试读到 `document.hidden=false`，未取得后台证据；node:test 已调用真实 hide/show 接线，验证禁止消费和恢复停步。组件禁用/多触点、战败城图失败重试、pair 样本的本轮浏览器逐项实操未追加；对应自动化与 P2-04 断言保留并运行。
- 独立 QA 仅对最终完整 SHA 做只读静态审查，不跑测试或独立用例。含头像修补的最终回执与 SHA 见交付消息及忽略目录下 `qa-repair-final.md`；Human 最终试玩仍待华周完成。
- STATUS 建议（本轮不写入）：华周验收后记录「P2-05 暗雷与场景正式闭环（qa）完成，验收 SHA：____」；下一步 P2-06，另行发卡。

使用 Cocos Creator 3.8.8。设计分辨率为 1334×750，构建方向为横屏，AppID 为 `wx2b83dfd606e96e59`。构建配置保存在 `settings/wechat-build.json`。

## 本地构建

1. 在 PowerShell 中切到本项目根目录。
2. 用下面的命令构建。将第一行改成你的 Cocos Creator 3.8.8 安装路径。

```powershell
$creator = 'E:/ProgramData/cocos/editors/Creator/3.8.8/CocosCreator.exe'
$project = (Get-Location).Path
$build = Start-Process -FilePath $creator -ArgumentList @(
  '--project', "`"$project`"", '--build',
  "`"configPath=$project/settings/wechat-build.json;logDest=$project/creator-wechat-build.log`""
) -WindowStyle Hidden -Wait -PassThru
if ($build.ExitCode -ne 36) { throw "Cocos 构建失败，请查看 creator-wechat-build.log" }
```

构建产物在 `build/wechatgame/`。确认目录内有 `game.js`、`game.json` 和 `project.config.json`。Git 已忽略整个 `build/`。本配置使用 Cocos Creator 3.8.8 内置引擎进行非调试构建，并开启分离引擎。确认 `game.json` 声明 Cocos 插件 `wx0446ba2621dda60a`，AppID 已授权使用该插件。

## 主包与战斗分包

- `Boot.scene` 是微信小游戏和 web-mobile 的首场景。主包保留启动场景、压缩标题图、加载代码和本地进度读写。美术原图留在 `art-source/`。
- 战斗场景、动效、角色、怪物和面板素材放在 `assets/battle/`。微信使用本地 `battle` 分包，浏览器构建为本地 Asset Bundle。新增内容默认进分包。
- 构建后检查 `game.json` 中 `battle` 的根目录为 `subpackages/battle/`，并分别记录主包及分包大小。主包超过 3.5 MB 时停止交付，先定位增长来源。
- web-mobile 沿用上述命令，将配置文件换为 `settings/web-mobile-build.json`，产物位于 `build/web-mobile/`，用本地 HTTP 服务打开。

## 模拟器与真机

1. 在微信开发者工具选「小游戏」并导入 `build/wechatgame/`，核对 AppID。
2. 点「编译」，确认横屏显示标题及进度，加载完点「开始游戏」进入战斗。到「详情」的「代码依赖分析」查看主包大小。
3. 用模拟器验证战斗、抓宠、加点、两个属性面板、放生、自动战斗及测试重置。进度保存在当前微信运行环境中，重编译后可验证保留。
4. 准备真机测试时，使用有该 AppID 开发权限的微信账号，点「预览」，再用手机微信扫码。

## 体验版

获得上传授权后，在开发者工具点「上传」，填写版本号和说明。随后到微信公众平台的版本管理，将对应开发版本设为体验版，由体验成员扫码测试。提审在体验版验收后另行安排。


## P2-02B 本地验收记录（2026-11-14，qa）

起始为华周已验收的 P2-02A `6013bcebfcd4bcd12a5f3589b73049905c0ece0e`。工作树 `C:/Users/hua/cocos/Project/qingqiu-linglu-task30`，分支 `task/30-p2-02b-town`。先本地交付，华周于 2026-11-14 确认测试通过并授权合并推送。正式标题进战斗，P2-05 才切换。

### 构建实测

用同一 Creator 3.8.8、同一 `settings/wechat-build.json`，将 A 的 git archive 解包到仓外临时目录重建，再构建 B；A 和 B 最终回修构建退出码均为 36。没有改动 A 工作树的产物。按所有构建文件的实际字节求和，主包排除整个 subpackages 目录；不是微信上传压缩大小。

| 部分 | A 本次重建字节 | B 字节 | 增量 |
| --- | ---: | ---: | ---: |
| 主包 | 686,275 | 686,275 | 0 |
| battle | 2,847,555 | 2,853,927 | +6,372 |
| town | 589,000 | 589,000 | 0 |
| inventory | 57,666 | 57,666 | 0 |
| outskirts | 594,500 | 594,500 | 0 |
| 总包 | 4,774,996 | 4,781,368 | +6,372 |

主包低于 3.5 MB 停止线。game.json 仍声明原有四个分包，未新建分包。城图原 UUID `b2bd3452-0d53-46f3-bdec-9b8699e5e5c9` 的 jpg 仅在 `subpackages/town/native/b2/`；battle 动态加载 town，未将城图静态带入主包，也未复制运行图。

日志和截图保存在本机 `E:/Documents/AI-Developer/temp/qingqiu-p2-02b-evidence/`：`baseline-wechat.log`、`B-wechat-final.log`、`tests-final.log` 及城镇/面板截图。

### 可直接打开的预览

B 的 Creator 预览服务当前为 7457（重启编辑器后以实际端口为准）：

- 城镇：<http://127.0.0.1:7457/?scene=3ca2435e-bec8-4656-9bf9-63cfaadc18b7&townPreview=1>
- 正常标题到战斗：<http://127.0.0.1:7457/?scene=3ca2435e-bec8-4656-9bf9-63cfaadc18b7>

`townPreview=1` 仅在 Creator PREVIEW 生效，不能与 mutationSample、babySample、layout 混用。它读取原存档键 `qingqiu-linglu:test-progress`，没有新增键或版本；打开普通个人浏览器时读取该浏览器原档，不会静默准备固定样本。

开发在新建的本机 Edge 验收浏览器中明确准备样本，不触碰个人浏览器已有档。样本通过 A 的 SessionProgress / awardExperience / saveProgress 入口生成：人物 1 级、潜能 5；宠物 pet（出战）和 pet-2，pet-2 为 2 级、潜能 5。构造器注入固定随机数；未改成长或技能规则。最终还原此初始验收样本并保留浏览器供华周试玩。此前的保存、放生、坏档与失败注入只作用于此验收浏览器内的同一原键。

### 实际执行的检查

- 先写两份 town 测试，再实现。测试夹具随机等级导致潜能不满足断言时曾停止；华周明确批准后只注入固定随机数，保留全部断言。失焦停步另补失败测试，再修复；独立QA发现禁用组件期间仍能点地留下目标，第1次回修同样先看到新增回归失败，再阻断禁用输入；没有删减断言。
- 全量 `node --test tests/*.test.mjs`：118 项成功，0 失败。新增接线测试用 Creator 已安装 TypeScript 编译视图并模拟 cc，无新增依赖。运行前设 `COCOS_TYPESCRIPT=E:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript`。
- 限定 tsc 成功：`--noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution node`，输入全部 `assets/battle/logic/*.ts`、`assets/battle/scripts/Battle.ts`、`assets/logic/platform.ts`，包括真实传递依赖。
- TownView限定严格tsc成功，Creator实际编译并运行新视图，微信构建成功。全视图严格 tsc 仍有 A 已存在的两项声明不匹配：Tween onUpdate 的可选 Node 参数、Mask.Type.ELLIPSE；在 A 同范围核对存在，未借本卡修改旧表现。不能称全项目 tsc 成功。
- `git diff --check` 无空白错误。原始卡与下载附件 SHA256 一致：`FCF4527B49D13399B87AA73FBD530041C1FBCB493E97F28128F5A57A8FF3F564`。

### 浏览器逐项操作

均为本机有界面的 Edge，实际鼠标/触摸输入，另读状态核对；保存和加载失败用明确的开发注入。

| 检查 | 实际结果 |
| --- | --- |
| 城图/人物/五入口 | 人物与宠物打开原面板，另外三入口灰色未开放，点击不移动；无 Battle 实例 |
| 城内待机 | 连续 74 秒无敌人、伤害、自动出手，存档字符串不变 |
| 点地/换目标/区外 | 直线移动、到点停止，途中改点替换；区外停止清目标并显示不能直达 |
| 等比与黑边 | 1000×600、1600×700 重新布局后点地误差小于 2 逻辑单位；上下/左右黑边不产生目标，截图无拉伸/按钮裁切 |
| 面板拦截 | 行走中打开人物/宠物立即停步；面板空白、切页、加点、关闭和放生确认不穿透，关闭不续走 |
| 后台/取消 | 实际窗口切换触发 blur 后停步，返回位置稳定；触摸取消清目标，第二触点不替换第一触点；禁用期间点地→启用后位置/目标不变，重新点地才移动 |
| 人物加点 | 预览取消不写；确认体质+1，潜能减1；刷新保留并回出生点 |
| 宠物加点 | 查看 pet-2 不改 pet 出战标；预览取消不写，确认、刷新保留正确个体，资质技能页正常 |
| 放生 | 出战宠拒绝；pet-2 取消仍在，确认后消失且刷新仍保持 |
| 保存失败 | 人物/宠物加点、非出战宠放生均显示失败，正式内存与旧档不变；恢复写入后重试只生效一次 |
| 加载重试 | 注入 town 加载错误，点击重试恢复，一套地图/人物，同一存档与会话不重建 |
| 坏档 | 显示读取失败，无 Battle、无自动重置；原坏档字符串保留 |
| 旧入口 | 不带参数从标题进入战斗，同一人物/携带数据；实际战中拒绝人物/宠物加点和非出战放生；完成战斗后点击再来一场，自动继续 |

预览工具注意：Creator 的 Webpage Full Screen 配合浏览器尺寸模拟，宽度变化后外层预览框有一次未同步；重新加载后尺寸与点击正确，两个尺寸均已复核。触摸探针先开启浏览器触摸能力再加载引擎；初始桌面环境不分发触摸事件，不能据其结果判定产品失败。多触点释放参数曾把第一触点释放，事件记录纠正后确认第二触点被忽略；未据此修改产品或测试断言。

NOT_TESTED：本卡微信模拟器、微信真机城镇操作、web-mobile 构建中的城镇（PREVIEW 开关不可用）、手机实体触摸。未改正式入口或发布配置来绕过这些限制。上述结果是开发自测。第1次 QA 回修后，开发又实际确认人物加点并刷新保留，随后还原样本供华周验收。

独立 QA：初版 `7e7160a21412f4fec18ac049bc63a6e4324baed9` 提出禁用输入 P2 问题；回修 `bba74800e91145be5da006abd9c64a60bb64a859` 已获只读静态复核，无剩余阻塞。QA 仅做静态审查。华周试玩验收的提交为 `6338fc4572e89e6587f1c9aec84802034f0dd580`。代码、测试与最终构建对应回修提交。

## P2-03 野外滚屏与往返验收记录

分支 `task/31-p2-03-outskirts` 从 `99b4ed7436867af3503ed8b4d44bb2ad17495da5` 开始。首次按实际接口复估 304–363 行，超过 300 行触发 X2。华周批准单卡上限 365 行，保留完整范围。任务卡与下载原件的 SHA-256 一致。正式进度待华周试玩验收后更新。

- 常规城镇预览 <http://127.0.0.1:7458/?scene=3ca2435e-bec8-4656-9bf9-63cfaadc18b7&townPreview=1>
- 正常战斗入口 <http://127.0.0.1:7458/?scene=3ca2435e-bec8-4656-9bf9-63cfaadc18b7>
- 本机独立验收样本 <http://127.0.0.1:7463/qa-sample>。首次在该地址无存档时导入 B 的专用样本，后续保留该地址的档。内置浏览器中已确认体质 13、潜能 9、有两只汀蛙且第一只出战。此验收地址需要本地临时服务。

### 执行检查

- 先补测试。基线定向测试 19 项成功、5 项因新接口尚不存在失败。
- 设置 `COCOS_TYPESCRIPT` 指向 Creator 3.8.8 内置 TypeScript 后，运行 `node --test tests/*.test.mjs`，124 项通过。含合法端点夹河沟、凸区相接/重叠、镜头与坐标、禁用与多触点、重试与旧回调、同一会话零额外写档、普通入口及怪物池回归。
- Creator 内置 `tsc --noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution node` 检查全部 battle 纯逻辑、Battle 与 platform。另以生成的 cc 声明及 `--experimentalDecorators` 检查 TownView。两项均通过。
- Cocos Creator 3.8.8 使用仓库微信构建配置，退出码 36，产物在本工作树的 `build/wechatgame`。

### 内置浏览器实操

1. 从标题进城，点出城。野外出生点约为世界 (540, 375)。在出生视图点 (70, 420) 到左端，随后点 (1200, 410) 滚屏。等人物到点后，按当前视口依次点 (1117, 445)、(1277, 544)、(1256, 611) 可到右端。上述点击为 1334×750 视口逻辑坐标，须逐段停稳后再点。两端地图填满逻辑视口，HUD 固定。
2. 在第二个滚屏落点附近点桥、水面和对岸，见「不能直达」，人物不动。两端都合法但整条线段中间断开的情况由固定几何测试验证。内置浏览器另切到 1000×600，Creator 预览外框刷新重新布局后复核点地和滚屏。
3. 行走时打开人物面板，点面板空白、关面板，人物保持在停步处。野外宠物面板显示两只携带宠及原出战标。野外探索和停留未触发战斗。
4. 临时验收代理对野外 Bundle 配置请求返回 503。点击出城后显示「地图加载失败，请重试」，城镇保持可见。恢复响应后再点出城，正常进入一张野外图。
5. 样本在野外加 1 点体质，体质从 12 到 13，潜能从 10 到 9。回城落在出生点，属性一致。刷新后从城镇出生点进入，仍为体质 13、潜能 9。移除预览参数后正常进入战斗并读到同档属性。

NOT_TESTED：内置浏览器真实切后台、触摸取消、第二触点及组件禁用未取得实操证据。集成测试已触发引擎后台事件、触摸取消和多触点、面板停步与禁用回调。微信模拟器、真机和发布构建中的野外预览未实操，现有预览参数仅在 Creator PREVIEW 下生效。Creator 初次预览在编译完成前打开过，出现模块未就绪，完成编译后刷新恢复。

独立静态 QA 在候选 `48aaf9976a9aadbe775bbe9f5b989938f6e21335` 上未发现产品阻塞，指出触摸取消、引擎后台及面板停步的直接断言缺口。开发补齐后重跑全量 124 项。QA 只读审查。

### 微信包体实测

按产物文件字节求和。主包排除整个 `subpackages` 目录，总包包含 inventory。P2-02B 的构建产物与起始 SHA 的资源、构建配置和源码一致，作为同口径基线。

| 部分 | 基线字节 | P2-03 字节 | 增量 |
| --- | ---: | ---: | ---: |
| 主包 | 686,275 | 686,275 | 0 |
| battle | 2,853,927 | 2,856,953 | +3,026 |
| town | 589,000 | 589,000 | 0 |
| outskirts | 594,500 | 594,500 | 0 |
| 总包 | 4,781,368 | 4,784,394 | +3,026 |

主包低于 3.5 MB。野外图 UUID `d7908920-076d-4b75-99ab-4ce7f3577b0c` 的运行 JPG 只出现于 `subpackages/outskirts`。

## 城镇换图插卡验收记录

基线 `1b13064e8755d1bc6cf5612d0db779d330a5303f`，分支 `task/32-town-streets`。业务 +118/-21，测试 +54/-10，合计增删 203 行。Creator 3.8.8 [城镇试玩](http://127.0.0.1:7460/?scene=3ca2435e-bec8-4656-9bf9-63cfaadc18b7&townPreview=1)。

- 内置浏览器实点广场及石门斜街，看到圆环出现后消失、横纵镜头跟随并夹边。向左点击时立绘翻转，停步后恢复站立。点屋顶和溪水验证拒绝，逻辑测试另外覆盖栏杆和花坛坐标。临近镜头边缘的标签随地图滚动。
- 点击杂货铺、丹炉台、告示牌，分别出现「未开放」。灵兽栏打开原宠物面板。出城石门切到野外，点击回城恢复新城出生点。互动只使用原会话和面板接口。存档读写没有变更，无需标 qa。
- `node --test tests/*.test.mjs` 125 项通过，使用已安装的 Creator 内置 TypeScript 运行接线测试。限定 `tsc` 检查 battle 纯逻辑、Battle、platform，以及含 Creator 声明的 TownView。定向测试先验证新图配置、波纹和提示未实现时失败。
- Creator 3.8.8 微信构建退出码 36。JPG 保持原图 1672×941，687,148 字节。主包 686,275 字节，town 1,277,041 字节（比基线增加 688,041），总包 5,474,714 字节。旧 JPG 与新 JPG 均在 town，原 PNG 在美术源目录。700 KB 目标针对新增 JPG。
- 微信模拟器和真机城镇操作 `NOT_TESTED`。Creator 预览使用开发参数，未变更正式入口。首次预览发现 JPG 默认仅导入纹理，以及原型提示使用系统弹窗，两处均已修复后实操复测。
## P2-04 开工门禁记录（2026-11-15，未实施）

- 起始 SHA：`a0e79aaae126326a2b3648b0e8392396942ce66c`；fetch 后的 `origin/main` 与 Human 核对值一致。
- 分支：`task/36-p2-04-round-trip`；独立工作树：`C:/Users/hua/cocos/Project/qingqiu-linglu-task36`。创建后、复制任务卡前 `git status --short` 为空。
- P2-03 前置：主线 `STATUS.md` 明确记载华周验收合入；`git merge-base --is-ancestor 29c1906e9b9c8b6ab90501564af0b7ff34399959 origin/main` 返回 0。
- 原卡已原样保存为 `docs/cards/card-P2-04.md`。附件与落卡的 SHA256 均为 `42A0802652B93BEF3C9703873EEA396CC1D834961846AB5F32F8705D1A55F8E4`，未向原卡追加执行记录。
- X1 原记录（2026-11-15）：原工作区 `task/26-boot-subpackage` 存在 `assets/battle/logic.meta` 修改及未跟踪美术素材，停止实施，未清理或覆盖。
- X1 处置（2026-11-15）：Human 明确授权保留原工作区、全部素材和其他工作树，fetch 后另建 P2-04。已逐一读取现有工作树状态；另见 character-panel 工作树中 `settings/v2/packages/cocos-service.json`、`engine.json` 两处既有修改，同样原样保留。新工作树基线干净，原 X1 已按此授权解除。

### 逐文件真实接线估算

口径为相对上述起始 SHA 的新增行加删除行，包含改写旧行的两侧，不是净新增。以下是实施前估算，未写产品代码或测试，不作为实际 diff。

| 文件 | 预计增删 | 必须覆盖的职责 |
| --- | ---: | --- |
| `assets/battle/scripts/Battle.ts` | 22–30 | 明确三种结果；在既有离场时点整队逃跑；保留角色/宠物指令限制、原经验与 ended 防重判保护 |
| `assets/battle/scripts/BattleView.ts` | 160–190 | 地图/战斗模式分离、固定入口及返回点、动画结束保存同候选与失败重试、待保存操作阻断、节点存活、消息、最新自动选择、旧入口回归 |
| `assets/battle/scripts/TownView.ts` | 6–12 | 隐藏期间的输入/更新保护、复用位置与镜头、返回及加载失败状态的最小接线，不改可走区 |
| `assets/battle/logic/session-progress.ts`、`local-progress.ts` | 0 | 预计沿用既有 SessionProgress 与完整快照保存接口；若不足须重新估算 |
| 可选 `assets/battle/logic/battle-result.ts` | 0 | 本估算把最小候选/完成锁放在视图接线内，未另计一个协调层 |
| `tests/battle.test.mjs` | 40–50 | 人物整队逃跑且无敌方续攻/经验、倒地和指令种类限制、单宠撤退、抓非最后/最后、重复判胜与经验 |
| `tests/town-progress-integration.test.mjs` | 100–130 | 复用真实视图测试入口，补节点销毁及调度模拟；四种返回、播放时序、存储失败和同候选重试、重复/后台回调、面板阻断、自动最新选择及旧入口 |
| `tests/auto.test.mjs`、`tests/session-progress.test.mjs`、可选新测试文件 | 0 | 以上两份测试承接新增验收，保留这些文件已有断言，不重复计算 |
| **业务合计** | **188–232** | |
| **测试合计** | **140–180** | |
| **总计** | **328–412** | **超过 300 行门槛** |

核对依据：

- `Battle.checkWinner()` 在第 214 行起直接更新同一 SessionProgress 的人物和宠物经验；现有 ended 保护可复用。应在此结果上冻结结算候选，不能在保存重试时重新判胜或发奖。
- `BattleView.startPlayback()` 第 638 行起在动画前调用 `persistProgress()`；后者第 186 行起只记错误、不返回成功状态。无动画事件时直接退出，故人物逃跑路径也必须进入同一个完成入口。
- `playNextAttack()` 第 730 行起在队列结束后自动调度或重绘；需要结算完成锁，不能让重复回调和后台恢复绕过失败。
- `townPreview` 同时用于 update/render 路由、人物/宠物实时数据、加点和放生事务判断。只切换显示会导致地图进入的战斗仍走非战斗事务，待保存候选可能被面板写操作改变。
- `render()` 第 1345 行起销毁所有非 Camera 节点，会销毁复用的 TownView.root；返回时也需清理战斗层，保留同一地图实例、位置与镜头。当前 TownView 为 311 行，包含后续走路和 Spine 接线，不再是卡面历史 292 行。
- 现有集成测试多数用空函数替代 `render()`，Node mock 的 `destroy()` 仅标记 destroyed；不能据此声称已经覆盖真实重绘和动画完成流程，需补有效接线测试。

X2（2026-11-15）：按实际调用链估算业务与测试增删 328–412 行，超过 300 行。停止在产品代码和失败用例编写前；没有通过压缩代码、删断言或省略验收控制行数。

建议交 Human/策划决定：维持 16 张主卡序，将 P2-04 内部拆成两次单独授权的交付（先结果原因/整队逃跑及动画后保存重试，再地图往返/自动/固定样本和整体验收），各自重新估算，整体 P2-04 尚未完成；或由 Human 明确批准本卡完整范围的新上限。当前不擅自拆卡、不提高门槛、不继续 P2-05。

实际产品/测试 diff：业务 +0/-0、测试 +0/-0；仅原卡落盘和本开工记录，未提交。`STATUS.md` 未修改，不提供已完成条目。

NOT_TESTED：node:test、限定 tsc、Creator/ego-browser 试玩、固定验收样本、微信构建、各包字节及相对基线增量、微信模拟器/真机、QA。原因：X2 在实施前停止，没有可交付候选；无最终/QA 所审 SHA，不引用旧包体作为本卡实测。

## P2-04 本地交付记录（2026-11-15，qa，待华周最终试玩）

上节是实施前的历史门禁记录，保留不覆盖。X2 处置：Human 于本轮明确批准完整 P2-04 单卡上限 450 行、不拆卡；在原独立工作树继续，先测试后实现，只本地提交。原 X1/X2 均已按明确授权解除；STATUS 未改，没有推送、合并或进入 P2-05。

起始 SHA `a0e79aaae126326a2b3648b0e8392396942ce66c`，分支 `task/36-p2-04-round-trip`。实际业务 +164/-32 = 196 行；测试 +231/-2 = 233 行；合计 429 行，按该起始提交计算，未压缩代码或删除断言。任务卡原文哈希仍与附件一致。最终提交 SHA 和独立 QA 所审完整 SHA 在本轮交付报告提供，华周验收状态尚未完成。

QA 第 1 次回修（2026-11-15）：独立静态审查 `8ac9c53d9886cb66d23a1fa585628bf24b1169d9` 提出旧地图错误遮蔽返回消息、普通入口测试重置可绕过失败候选两项 P2。分别先补失败断言（8 成功/1 失败、9 成功/1 失败），再仅修改 BattleView 清理开战前地图错误、统一重置按钮和处理入口的可用条件；保留读取失败重置恢复。未删旧断言。最终复审 SHA 见交付报告。

### 实际运行的检查

- 失败用例先行：`node --test tests/battle.test.mjs tests/town-progress-integration.test.mjs`，20 成功、5 失败；失败来自未实现的明确结果及固定开战接口。新增回城加载失败负例先失败再修；逃跑提示统一也先补断言再接线。原断言保留。
- 最终 `node --test tests/*.test.mjs`：145 成功、0 失败，退出码 0（QA 回修后 qa1-tests-final.log）。`COCOS_TYPESCRIPT=E:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript`；沿用 Creator 内置编译器及 node:test，无新依赖。
- 限定 tsc：`node <COCOS_TYPESCRIPT>/bin/tsc --noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution node <assets/battle/logic/*.ts全部文件> assets/battle/scripts/Battle.ts assets/logic/platform.ts`，退出码 0，包含真实传递依赖。
- 额外全视图严格检查仍报 BattleView 既有 Tween onUpdate 可选 Node 参数不匹配；对起始 SHA 的 archive 用同一 cc 声明、同一命令复核得到同一 TS2322。未排除文件来伪称全视图严格检查成功，未扩大范围修改旧动效声明。Creator 实际编译、预览和微信构建另已运行。
- `git diff --check` 无空白错误。Creator 自动改写的三份 settings/v2/packages JSON 只有换行差异；恢复本工作树原字节，不提交配置。其他工作树和原素材未改。

### 试玩入口与固定样本

- 城野入口：`http://127.0.0.1:7458/?scene=66ba6897-199f-4cf3-acc4-a475045cdfa8&townPreview=1`。
- 正常入口：`http://127.0.0.1:7458/?scene=3ca2435e-bec8-4656-9bf9-63cfaadc18b7`，标题加载后点「开始游戏」，仍进原直接战斗。
- 固定样本：在城野 URL 后加 `&roundTripSample=single`、`pair` 或 `defeat`。single/pair 分别 1/2 只非宝宝、非变异、1 级汀蛙；动作/抓取随机源固定 0，资质/成长/基础点源固定 0.5，物种/等级源固定 0，宝宝和变异源固定 1。defeat 额外仅把当场敌人的攻击和速度置 10000，人物、宠物和存档不替换。两轮防御即可确定战败。未选择样本时沿用三物种正式随机遭遇；不使用 babySample/mutationSample 替代同档验收。
- 这些开关只在明确选择时改变当场敌人，仍写原键 `qingqiu-linglu:test-progress` 的同一 v3 快照。不会静默覆盖角色档案、不建立隔离进度。界面显示「验收样本：…（同档）」。刷新自动默认关闭、从城里出生。
- 本轮初始角色为等级 0、五项各 10、潜能 0；初始汀蛙分别等级 4/3、气血 130/95。重复战斗及普通入口回归正常累积经验后，交付留样角色等级 4、经验 6、五项各 14、潜能 20；pet 等级 5、经验 0、气血 138，pet-2 等级 4、经验 36、气血 103，另保留 caught-1 等级 1、气血 8；出战 pet-2。使用现有放生界面释放本轮生成的 caught-2/3，留下两格空位；无存档注入或新键。
- 落脚点：出城后点击设计坐标约 (1000,410) 的河岸草地，波纹标记到点；本轮实际脚底世界坐标 (999.2694,409.5264)、镜头原点 (332.2694,0)。胜利和逃跑后精确保留该次记录的位置，清目标；另在出生点 (540,375) 验证往返。回城出生 (690,443)。

### ego-browser 逐项实际操作

| 验收 | 本轮结果 |
| --- | --- |
| 出城、移动、固定开战 | 实际鼠标操作；只点入口开一场，UI 阻断触摸，开战清目标；战斗重绘后地图仍存活 |
| 普通击杀胜 | 手动连续攻击两敌样本，胜利后系统消息经验 20，回原位置停步；换宠后的 pet-2 出战选择保留 |
| 抓非最后一只 | pair 抓第一只后仍在第 2 回合，经验未发，携带增加；随后整队逃跑，已抓宠保留 |
| 抓最后一只 | single 抓走最后一只，动画后胜利消息经验 10，回原位置；刷新同档宠物、经验保留 |
| 人物逃跑/单宠撤退 | 人物逃跑整队撤离，无整场经验；单宠撤退后仍在战斗，原撤退宠不可召回，可召 pet-2 |
| 确定战败 | defeat 两轮防御，人物倒地后只剩宠物指令；最终回城出生点，人物面板满气血/法力，原经验和抓获不减 |
| 自动最新值 | 野外开自动进入本场并出手；战斗关闭后手动打赢，下场 round=1 且自动关；战斗开启后回图仍开，再下一场自动完成胜利；回图目标为空，刷新默认关 |
| 保存失败 | 显式临时替换当前页 Storage.prototype.setItem，仅对原游戏键抛错。最后抓取动画后留结果页，提示保存失败并出现重试；两次失败重试、切新标签页再返回均未离场，磁盘保持旧值；解除故障后重试回图 |
| 同候选/刷新 | 写入故障样本记录 4 次尝试、唯一序列化字符串 1 份；成功值等于最初候选。刷新经验仅增加一场，宠物只增加一只，出战 ID 不变 |
| 回城加载失败 | 显式临时拦截当页 town Bundle 加载；战败保存后显示地图失败和重试回城，returningTown 锁定，无固定开战按钮；解除后点重试回到城里出生点 |
| 普通入口 | 实点标题「开始游戏」进入直接战斗；人物逃跑后仍有「再来一场」，点击后新场第 1 回合、出战 ID 保留 |
| QA 回修：旧地图错误 | 越界点击被现有寻路投影到可走区，未声称复现不可达报错；改用当页 town 加载故障产生真实「地图加载失败」，恢复加载器后固定开战并逃跑，返回正确显示「整队逃离 · 无本场经验」；旧版本先复现遮蔽，新版本已确认清理 |
| QA 回修：重置绕过 | 普通直接战斗只注入原键 setItem 失败，逃跑后点禁用的测试重置，无确认框、仍在 ended、候选和磁盘原值不变；解除故障点重试，保存值等于同一候选，恢复「再来一场」。读取失败恢复另由集成断言覆盖 |

浏览器故障注入均只存在当前页，刷新移除。证据截图/脚本、测试日志、两次构建产物在本工作树忽略目录 `temp/p2-04/` 与 `build/wechatgame/`。两次自动验收等待脚本超时后未进行第三轮同类脚本纠错；按实际画面分步操作补齐结果，未修改产品计时或断言以迎合辅助脚本。初次加载和代码更新期间出现未就绪/旧缓存页面；等待就绪并使用单页忽略缓存刷新后核对已加载最新 render 接线，没有清理全浏览器状态。

QA 回修预览初次仍为旧脚本；最终重新构建后，忽略当前页缓存刷新，核对 startFixedBattle 的清错语句和 canResetProgress getter 均已加载才执行上述复测。辅助等待曾因页面 cc 尚未定义报错，增加就绪检查后解除；没有改产品计时。回修胜利消息路径有自动化断言，但该次追加浏览器击杀未结束即换入口，不计为新增胜利试玩证据；表内普通手动击杀胜为首轮实际完成记录。

### 微信包体实测

同一 Creator 3.8.8、同一 settings/wechat-build.json。起始 SHA 用 git archive 解到本工作树 temp/p2-04/baseline 后重建，基线日志记录构建 Finished、产物完整（初次进程退出码未单独捕获）；QA 回修后最终候选构建退出码 36（qa1-build.log）。按所有产物文件字节求和，主包排除整个 subpackages，总包包含 inventory，不沿用旧卡包体。

| 部分 | 本次基线字节 | 最终候选字节 | 增量 |
| --- | ---: | ---: | ---: |
| 主包 | 919,168 | 919,168 | 0 |
| battle | 3,020,780 | 3,024,603 | +3,823 |
| town | 1,923,710 | 1,923,710 | 0 |
| outskirts | 594,500 | 594,500 | 0 |
| inventory | 57,666 | 57,666 | 0 |
| 总包 | 6,515,824 | 6,519,647 | +3,823 |

主包低于 3.5 MB。没有新增资源、Bundle、Boot 依赖或构建配置。微信模拟器、真机、发布构建中 townPreview 入口均 NOT_TESTED；Creator 预览不代表上述平台已验收。180 世界单位保护距离、暗雷、掉落和正式入口切换未实现也未验证，按卡留后续。

STATUS 建议（仅供华周最终试玩后使用，本轮未写 STATUS）：P2-04 固定战斗往返与结果（qa）完成，填入本轮最终验收 SHA；下一步 P2-05 待另行授权。不得把此建议当作已经完成 Human 验收。
