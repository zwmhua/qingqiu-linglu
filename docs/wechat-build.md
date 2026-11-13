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
) -Wait -PassThru
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
