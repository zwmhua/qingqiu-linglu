# 主角 Spine 站立接入（task/29）

基于 `task/28-spine-test`。站立播放 Spine 4.2 的 `idle` 循环，跑步沿用本地 `task/33-hero-run` 的四方向逐帧资源与朝向逻辑；城镇、野外共用 `TownView`，不改移动、镜头、可走区及 `assets/battle/logic/` 的现有规则。仅本地提交。

验收：Spine 资源进入 `town` 微信分包；站立保留最后左右朝向，移动隐藏 Spine；两种表现共用脚底基线并保持原人物比例。浏览器在城镇和野外各走停验证并截图；微信构建记录主包（上限 4 MB）和 `town` 分包字节数。背面站立暂用同一套正面 `idle`。真机帧率由 Human 验收。
