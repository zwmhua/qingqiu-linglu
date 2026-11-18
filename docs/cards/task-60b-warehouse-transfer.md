# 卡 60B｜W2B｜整堆存取与保存事务 `qa`

华周在 2026-11-18 试玩验收 [W2A](task-60a-warehouse-migration.md)，指定起始提交 `da21f3c1a8999c573a644d3b9d9843af2a9e9381` 和独立分支 `task/60b-warehouse-w2b`。本卡承接[卡 60](task-60-warehouse-w2.md)的整堆玩法和保存事务，使用 W2A 的 v7 存档与读回。

## 范围与规则

- 城镇从「背包 → 仓库」打开双栏，点道具气泡里的「整堆存入」或「整堆取出」。单件堆和多件堆均转移来源全部，同 ID 合堆，超过安全整数上限整笔拒绝。部分转移仅是规则层能力。
- 执行时核对城镇、当前气泡、会话和库存。战斗、野外、切换场景及待保存时阻止存取。过期或重复点击不得再写主档。
- 两侧候选与完整会话经统一保存路径一次写入 v7 主档。写成后发布背包与仓库状态。失败保留操作前主档和两侧数量，显示失败原因，重新选择后用当前状态重试。
- 白名单为 `assets/battle/logic/{inventory,session-progress,local-progress}.ts`、`assets/battle/scripts/BattleView.ts` 和 `tests/{inventory,session-progress,progress-migration,town-progress-integration}.test.mjs`。单卡业务与测试实际增删上限 300 行。数量选择和整理归 [W3](task-61-warehouse-w3.md)。

## 验收

- 定向测试覆盖双向、部分与整堆、同 ID 守恒、过 99 合堆、非法输入与溢出、过期操作、连续点击与待保存、写前状态、失败与重新操作、刷新读回。全量 node:test 回归既有道具和保存路径，限定严格 TypeScript 覆盖玩法逻辑及其真实依赖。
- ego-browser 用隔离旧档核对空仓与既有资料，实点单件存取。用背包 7 瓶、仓库 2 瓶样本模拟写入失败，恢复后连续点击存入并刷新，核对仓库 9 瓶，再连续点击取出并刷新，核对背包 9 瓶。实点背包打书、普通还童与野外入口拦截。
- 交付 Web Mobile、微信小游戏本地构建、截图、可重开试玩入口与本地提交。独立 QA 只读最终完整 SHA 的 diff，检查统一写入、两侧一致性、连击、过期与失败重试。华周试玩验收后另行启动 W3。
