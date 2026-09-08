# Issue #25 本地验收记录

日期：2026-09-08（Asia/Shanghai）
结论：本地实现与下述专项验收通过；尚未推送、合并、打包发布或替换用户安装版。

## 交付位置

- 分支：`codex/issue-25-virtual-replay`
- 基线：origin/main，`f0a6d7cca96e01098abe36f062132367f4c874cb`，v4.0.2
- Worktree：`C:\Users\16080\Documents\codeforces刷题工具\open-source-export\cf-compass-issue-25-virtual`
- [设计方案](ISSUE_25_VIRTUAL_REPLAY_DESIGN.md)
- 改动保存在此独立工作区，未提交到远程。原工作区和个人数据不作为测试目标。

## 测试结果

| 门槛 | 结果 |
| --- | --- |
| `pnpm test:contest-sessions` | 26 / 26 通过 |
| `node scripts/test-ai-service.cjs` | 通过，使用 mock，不调用付费 AI |
| `node scripts/test-contest-recommendations.cjs` | 4 个代表案例、6 个对抗案例通过 |
| `node scripts/test-analytics.mjs` | 通过 |
| `node scripts/test-performance.mjs` | 通过，含 100001 条提交的既有性能回归 |
| `node scripts/test-codeforces-source-service.cjs` | 通过 |
| `pnpm build` | 通过，存在既有 ProblemNoteDrawer 动态/静态导入提示；不影响构建成功 |
| `git diff --check`、主进程语法检查 | 通过 |
| `pnpm qa:contest-sessions` | Windows 真实 Electron 窗口流程通过，renderer errors = [] |

## 真实窗口覆盖

1. 没有 Rating 记录、没有参加过该场比赛，也能加入补题并自动进入队列。
2. 比赛详情独有、全局题库没有的题，完整保存题目信息快照。
3. 两次虚拟参赛具有不同 replayId；各自的场内提交、AC 与时间线互不混用。
4. 虚拟场次不产生官方排名、正式场次表现分和 Rating 变化；新增的非官方本场参考分独立保存，见下方补充验收。
5. 保存失败注入后，界面恢复真实保存的队列；磁盘队列不变。
6. 真正关闭并重新启动 Electron，移除比赛详情缓存后，队列依然完整。
7. 新 AC 同步后，题目进入已完成视图；手动移出只删除对应队列 key 与快照。
8. 没有赛事缓存且模拟离线，仍可查看和处理本地补题队列。
9. 新补题队列与虚拟复盘区域的英文文本、title、placeholder、aria-label 无中文残留。
10. 1600×1000 与应用最小窗口 1040×700 检查通过；根布局没有横向溢出，小窗口使用内部滚动。

## 可复核证据

首轮完整 UI 通过批次（单场参考分加入前；包含原子写入、Windows 有限重试与界面保存失败恢复）：

- [JSON 验收报告](../output/playwright/issue-25-1788826158847/report.json)
- [补题队列](../output/playwright/issue-25-1788826158847/02-queue-persistent.png)
- [虚拟复盘与时间线](../output/playwright/issue-25-1788826158847/05-virtual-first-session.png)
- [冷启动恢复](../output/playwright/issue-25-1788826158847/06-cold-start-restored.png)
- [离线英文队列](../output/playwright/issue-25-1788826158847/07-offline-english.png)
- [英文虚拟复盘最小窗口](../output/playwright/issue-25-1788826158847/09-english-virtual-minimum-window.png)

截图中的账号和题目均为明确构造的隔离测试数据，不是用户的真实参赛成绩。测试目录保留本地证据，并通过 .gitignore 排除，不进入发布内容。

## 已发现并修正的问题

- 初轮英文自动化使用了错误的旧按钮译名：修正测试定位，而非修改产品含义。
- 新区域及复用按钮缺少英文词条：补齐并以可访问性文本验证。
- 小窗口说明区占用过多空间：压缩说明区，使队列有实际可滚动空间。
- Windows 高频读写时临时占用阻止 rename：有限退避重试；并发读到的所有 JSON 必须有效。
- 模拟最终替换失败：旧 JSON 保持完整，新临时文件保留以便恢复。

失败证据未删除，位于 output/playwright 下较早的 issue-25-* 与 atomic-* 目录。

## 本场参考分补充验收

用户追加约定：虚拟赛本场 Rating 作为单场参考，但不进入总体参考数据。实现口径、限制和完整证据见 [单场参考分方案与验收](ISSUE_25_VIRTUAL_REFERENCE.md)。

- 37 项场次及参考分专项测试通过；既有 AI 服务与赛事推荐测试通过，生产构建通过。
- 新的完整真实窗口批次：[report.json](../output/playwright/issue-25-1788826720675/report.json)，renderer errors = []。
- 覆盖手动计算、总体统计不变、冷启动保存、离线重算保留旧分、中文和英文以及小窗口。
- 自动化保存检查改为等待目标数据实际落盘，再做断言；不以界面乐观更新或 IPC 读取完成替代磁盘写入完成。此前失败批次保留。

## 发布边界

最新展示修订：虚拟赛已改为自动计算并在列表直接显示，沿用正式表现分色阶，保留本场参考标识且不进入总体统计。39 项专项测试与 [最终真实窗口报告](../output/playwright/issue-25-1788826935473/report.json) 通过；前述手动计算批次为历史记录。

- 未运行 GitHub 原生三平台流水线，也未验证本次改动的 macOS/Linux 安装包。
- 未用真实用户账号进行在线虚拟参赛冒烟；自动化使用符合官方数据结构的确定性 fixtures。
- 没有任何提交或缺少可靠开始时间的虚拟场次不能可靠自动识别；尚未同步的历史也不可见。
- 追加的虚拟参考分仅为非官方单场估计；不增加自动参赛、计时器、登录代理或新 AI 供应商。
- D 盘安装版、桌面快捷方式、本地模板、OJ 与素材绑定均未修改。
