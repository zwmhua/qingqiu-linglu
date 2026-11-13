# 微信小游戏构建

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

NOT_TESTED：内置浏览器真实后台停步未取得独立观察证据，触摸取消、第二触点和禁用使用逻辑回归覆盖其中的触摸与禁用接线。微信模拟器、真机和发布构建中的野外预览未实操，现有预览参数仅在 Creator PREVIEW 下生效。Creator 初次预览在编译完成前打开过，出现模块未就绪，完成编译后刷新恢复。

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
