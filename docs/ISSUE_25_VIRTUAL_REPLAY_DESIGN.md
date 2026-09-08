# Issue #25：虚拟参赛复盘与可靠补题队列

状态：本地实现与专项验收通过，尚未推送、合并或发布。基线为 v4.0.2 / f0a6d7c。详见 [本地验收记录](ISSUE_25_LOCAL_ACCEPTANCE.md)。
分支：`codex/issue-25-virtual-replay`。开发目录为与安装版隔离的 Git worktree。

## 1. 要解决的不是一个筛选按钮，而是两条断开的链路

Issue：<https://github.com/Binah-Dev/cf-compass/issues/25>

- 原复盘入口来自 `user.rating`，所以没有 Rating 变化的虚拟参赛根本没有入口。
- 原“待补题”通过“参加过比赛且存在未通过题”推断，并未读取已写入的 `study.contestQueue`。
- 只保存题目 key 不够：从比赛详情取到、但全局题库没有的题，在缓存变化后会失去展示信息。
- 原场内提交只接受 CONTESTANT，并且对通常倒序的提交列表使用 find(OK)，可能把最后一次 AC 当成首次 AC。

## 2. 产品契约

| 数据 | 身份 | 展示与边界 |
| --- | --- | --- |
| 正式 Rated 参赛 | contestId | 保留官方 Rating、排名和现有 Carrot 表现分 |
| 虚拟参赛 | contestId + virtualStart | 每次独立场次，只统计该身份和时间窗口的提交；结束后自动计算并在列表显示非官方本场参考分，不进入总体 Rated 指标 |
| 正式未计分参赛 | contestId | 可以逐题复盘，不依赖 ratingChanges 成功 |
| 非正式参赛 | contestId + unofficial | 与正式、虚拟分离，不产生 Rated 指标 |
| 补题队列 | contestId-index | 与参赛身份无关，跨场次共享，加入后必须可见、可移除、可持久化 |

同一道题可以属于多个复盘，但在补题队列只有一条。完成状态从本地同步到的 AC 派生，不自动删除队列记录。

## 3. 界面与操作

### 赛事中心

- 保留全部、适合、我参加过、待补题、即将开始。
- “待补题”成为真正的题目工作区：待完成 / 已完成 / 全部已加入，独立题目搜索。
- 从未参加过的已结束比赛也能加入补题；加入成功后直接转到队列。
- 已通过与已加入分别反馈；不把已通过题重复加入补题。
- 队列提供题目打开、笔记、今日待做计划、移出操作。
- 队列不受场次类型、参赛状态、赛事搜索等遗留筛选影响。
- 更新场次失败或离线时仍可使用本地队列；提示不能伪装成联网成功。
- 队列达到 1000 条时拒绝新增并说明原因，已有记录不会被静默挤掉。

### 赛事复盘

- 增加全部 / 正式 Rated / 虚拟 / 其他未计分筛选。
- 列表明确显示参赛身份与虚拟开赛时间，重复虚拟场次各自展开。
- 展示本场最早 AC、尝试数、当前补题状态；区分赛前已通过和赛后已补题。
- 虚拟场次详情展示首次 AC、场内提交数、未通过尝试与场内 AC；同一时间窗口内、但不属于本次参赛身份的 AC 标记为“场外已通过”，不误称赛后补题。
- 展示本场按时间排序的提交时间线；TESTING 不计入已判定错误次数。
- 虚拟与未计分不参与平均表现分、最佳表现、官方排名统计。
- AI 与源码增强复盘沿用原有显式操作与配置，输入和保存结果都按 replayId 隔离。本次验收不调用付费 API。

## 4. 数据与实现

### Replay

`replayId`：正式场次保留旧 key，例如 `1900`；虚拟为 `1900:virtual:1700100000`；非正式为 `1900:unofficial`。

关键字段：
`participationType`、`rated`、`sessionStartTimeSeconds`、`durationSeconds`、`submissionFingerprint`、`timeline`。

- 先从 Rating 历史和真实提交建立参赛索引；使用已缓存的比赛元数据完成本地复盘。
- 缺少比赛元数据时，先拉取最小 standings 元数据；已结束的虚拟场次随后自动获取全榜与 Rated 对照数据计算参考分，失败不无限轮询，可在详情手动重试。详见 [单场参考分补充方案](ISSUE_25_VIRTUAL_REFERENCE.md)。
- 虚拟起点优先采用 Party.startTimeSeconds；缺失时仅在 relativeTimeSeconds 有效的情况下由 creationTimeSeconds - relativeTimeSeconds 还原。没有可靠时间不猜测。
- 按 participantType、contestId、virtualStart 和场内相对时间共同过滤。PRACTICE、其他虚拟场次、场外提交不会混入。
- 本地提交变化会刷新逐题结果；补题后的 AC 不改变历史场内成绩。
- 增量同步会更新已知提交的最新判定，避免 TESTING 永久停留在旧值。
- 复盘写入串行化；网络计算完成后仅合并对应场次，校验账号和提交指纹。退出后遗留 calculating 状态可恢复重试。
- 旧正式参赛 key 不变，已有 Rated 成果保留；支持旧版本复盘备份经索引升级使用。
- 官方数据中找不到当前 handle 时明确失败，不用“同分同排名的另一位选手”冒充当前用户。

### Queue

保留原 `contestQueue: string[]`；增加 `contestQueueProblems: Record<key, problemSnapshot>`。

快照仅存 contestId、index、name、rating、tags；不存远程 HTML、源码或任意 URL。
展示按快照、提交中的题目、比赛详情、当前题库合并。即便只有旧 key，也显示占位题目和明确的缺少详情提示，而非隐藏记录。
Electron 保存和备份导入保留并约束快照；移出后清理对应快照，不改题解、笔记、模板和素材。

学习记录和复盘 JSON 使用同目录临时文件、flush 后替换，避免读到写了一半的 JSON。Windows 短暂文件占用采用有限退避重试；仍失败时保留原文件和可恢复临时文件，不通过清空原文件绕过锁。界面保存失败后回读真实已保存状态，避免“假加入 / 假移除”。这不是对磁盘损坏或所有外部故障的永久保证。

## 5. 已知数据边界，不许用推测填平

- 没有提交的虚拟参赛不会出现在 user.status。当前不会声称可以自动发现这类场次；可以在赛事中心直接建立补题队列。
- 同步尚未覆盖的旧记录、缺失有效虚拟起点的记录，不冒充完整参赛历史。
- 本地历史可能不完整，因此“场内未做”准确含义是当前同步记录中没有该场提交；界面提示以同步数据为准。
- 虚拟时间线不等于官方赛事排名；单场参考分是有条件的非官方估计，数据不完整时拒绝估算，绝不填入官方表现分或 Rating 变化字段。
- 不创建本地虚拟比赛计时器，不自动注册比赛，不实现登录代理，不更改推荐排序算法。
- 本次是本地开发验收，不等于 Windows/macOS/Linux 正式发布验收。

## 6. 回归与验收入口

- `node --test scripts/test-contest-sessions.cjs`：纯函数及主进程隔离集成测试。
- `node scripts/qa-issue-25-virtual.cjs`：独立 Electron 用户目录，真实点击、冷启动、离线和英文验证；保留截图、可访问性快照及 JSON 报告于 output/playwright。
- 现有 AI / 推荐 / 性能 / 分析测试，以及生产构建继续作为回归门槛。
- 个人安装目录、AppData 账号数据、D 盘 OJ、本地素材和原分支未提交文件均不作为测试输入和写入目标。

## 7. 官方依据

Codeforces API 对 Party.participantType、Party.startTimeSeconds 和 Submission.relativeTimeSeconds 的定义：
<https://codeforces.com/apiHelp/objects>

对虚拟参赛，relativeTimeSeconds 相对虚拟开始时间；不能将官方比赛日期直接当作虚拟训练起点。
