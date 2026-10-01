# 自定义训练赛 / Custom Training

自定义训练赛把本地题库中的题目组合成一场单人限时练习。题目和提交仍由 Codeforces 提供；CF Compass 负责组题、计时、同步公开提交和保存训练记录。

Custom Training turns locally cached Codeforces problems into a timed solo practice session. Codeforces continues to host the problems and judge submissions. CF Compass assembles the session, tracks time, synchronizes public submissions, and stores the record locally.

## 使用 / Use

1. 在左侧选择 **自定义训练赛**（English: **Custom Training**）。同步自己的 Codeforces 账号后，检查页面显示的训练账号。
2. 从 **题库**、**收藏**或 **计划题单**筛选题目。选择题目后可以上移、下移或移除；已有提交和通过记录会在组题时提示。
3. 设置名称和时长，选择是否隐藏算法标签与难度，然后保存草稿或开始训练。第一版每场最多 100 题，时长为 1 分钟至 24 小时。
4. 开始后，本场账号、题目顺序、时长和隐藏选项锁定。倒计时使用保存的绝对截止时间；离开页面或关闭应用不会暂停计时。重新启动后从历史记录继续查看该场训练。
5. 打开题目会跳转 Codeforces 原站，请使用本场绑定账号提交。页面同步后显示未尝试、错误尝试、判题中和通过状态。断网时保留上次结果；联网后可再次同步。
6. 到期或手动结束后，查看通过数、首次 AC 用时、错误尝试与待补题。隐藏标签与隐藏难度分别控制，赛后仍沿用本场隐藏选项；需要查看时主动展开相应信息，也可以再次收起。展开只影响当前查看，切换会话或重启后恢复本场隐藏设置。使用题目笔记和加入计划题单入口安排复盘与补题。取消会保留取消状态和已经同步的记录。

1. Open **Custom Training** in the left navigation. Synchronize your Codeforces account and check the displayed session account.
2. Select problems from the **Problem Library**, **Favorites**, or **Study Plan**. Move or remove selected problems before starting. Existing attempts and accepted submissions are shown while composing the session.
3. Set a title and duration, choose whether to hide tags and ratings, then save a draft or start. Version one supports up to 100 problems and durations from 1 minute to 24 hours.
4. Starting locks the account, problem order, duration, and visibility settings. The countdown uses a persisted absolute deadline. Leaving the page or closing the app does not pause time; the session remains available in history after restart.
5. Open problems on Codeforces and submit using the bound account. Synchronization shows unattempted, wrong, pending, and accepted states. Offline failures preserve previous results; synchronize again after reconnecting.
6. After the deadline or an early finish, review the solved count, first AC times, wrong attempts, and unsolved problems. Tag and rating visibility are independent and remain hidden after finish when configured that way. Reveal each explicitly when needed, or collapse it again. Reveals apply only to the current view; changing sessions or restarting restores the session's saved visibility choices. Use the shared problem notes and study plan actions for follow-up work. Cancellation preserves the cancelled record and synchronized evidence.

隐藏选项只控制 CF Compass 训练页面内显示的信息，不修改 Codeforces 原站。跳转原站后仍可能看到官方标签与难度。

Visibility controls affect the CF Compass training page only. Codeforces pages remain unchanged and may display their original tags and ratings.

## 统计边界 / Counting rules

- 本场与官方比赛、Codeforces 虚拟赛及其复盘记录独立；不会更新官方 Rating，也不会进入正式赛 / 虚拟赛综合估计 Rating。
- 只计入本场绑定账号的单人 `PRACTICE` 提交，按完整 `contestId + index` 匹配。不同比赛中同为 A 的题目不会混用；其他账号、团队和其他参赛类型的提交不计入本场。
- 时间窗口为 `startTimeSeconds <= creationTimeSeconds <= endTimeSeconds`。首次 AC 用时为提交创建时间减本场开始时间；不使用原比赛的 `relativeTimeSeconds`。手动结束或取消将截止时间收缩至操作时间，原定截止之后的提交不计入。
- 判题中提交不算错误或通过。截止前创建的提交即使截止后才完成判题，仍可在再次同步后更新本场结果。提交按 ID 去重，重复同步不会增加尝试次数。
- 切换账号后保留原账号的本地会话。原账号的会话不能以新账号同步；切回原账号后可以继续补同步。
- 已有做题记录只作为组题提醒，不会自动转为本场 AC。历史中的本场首次 AC 用时只依据本场有效提交。

- These sessions are independent of official contests and Codeforces virtual participation. They never change official Rating or enter the combined official/virtual Rating estimate.
- Only solo `PRACTICE` submissions belonging to the bound account count. Matching uses the complete `contestId + index`; identical indices in different contests remain distinct. Other accounts, teams, and participation types are excluded.
- The window is `startTimeSeconds <= creationTimeSeconds <= endTimeSeconds`. First AC time is the submission creation time minus the session start, never the original contest's `relativeTimeSeconds`. Finishing early or cancelling moves the cutoff to the action time.
- Pending verdicts count as neither wrong nor accepted. A submission created before the cutoff can update the result when judging finishes later. Submission IDs are deduplicated across synchronization attempts.
- Changing accounts preserves existing local sessions. A session cannot synchronize under a different account; switch back to its original account to refresh it.
- Previous solving history is a composition hint, not an in-session AC. Session first AC times use valid submissions from this session only.

同步通过 [Codeforces `user.status` 公开 API](https://codeforces.com/apiHelp/methods#user.status) 分页读取，官方接口按提交 ID 降序返回。训练同步保留时间窗口中的证据，不把分页上限或网络失败当作已完成的完整结果。

Synchronization pages through the [public Codeforces `user.status` API](https://codeforces.com/apiHelp/methods#user.status), which returns submissions in descending ID order. A pagination limit or a network failure must not be treated as a complete successful result.

## 本地数据与兼容 / Local data and compatibility

桌面端会话保存在应用用户数据目录的 `custom-training.json`，包含版本、草稿 / 会话状态、绑定账号、题目快照、绝对起止时间以及同步到的提交证据。写入采用原子替换。浏览器预览使用本地存储，并沿用相同会话模型。

数据中心导出和自动备份中的 `data.customTraining` 携带这些会话；导入前仍按现有流程创建安全快照。旧备份不含该字段时保留现有自定义训练记录；首次使用没有记录时为空。题目笔记和计划题单继续使用项目已有的公共记录，不为每场训练复制一份笔记。

Desktop sessions live in `custom-training.json` under the application's user data directory. The versioned store contains drafts and session states, the account, problem snapshots, absolute start/end timestamps, and synchronized submission evidence. Writes use atomic replacement. Browser preview uses local storage with the same session model.

Data Center exports and automatic backups include sessions in `data.customTraining`. Import retains the existing pre-import safety snapshot flow. Older backups without this field preserve existing custom training records; a fresh installation starts empty. Problem notes and the study plan keep their existing shared identities.

## 验证 / Verification

```sh
pnpm verify
pnpm test:custom-training
pnpm qa:custom-training
```

Electron 验收使用虚构单人账号、独立 `CF_COMPASS_USER_DATA` 和模拟 Codeforces API，不读取个人数据。截图、无障碍快照和 `report.json` 写入 `output/playwright/custom-training-*`。该流程验证真实桌面 UI，但模拟 API 不代表对 Codeforces 在线服务的端到端可用性验证。

The Electron acceptance script uses a fictional solo account, isolated `CF_COMPASS_USER_DATA`, and a mocked Codeforces API. It writes screenshots, accessibility snapshots, and `report.json` to `output/playwright/custom-training-*`. It exercises the actual desktop UI; mocked API results do not establish live Codeforces service availability.

## 第一版限制 / Version-one limits

第一版不提供自建判题、多人成绩榜、积分或 Rating。计时依赖系统时间，修改系统时钟会影响截止判断。Codeforces 公开提交存在更新延迟，结束时可能仍有判题中结果；必要时再次同步。首次 AC、错误尝试和待补题用于个人训练复盘，不表示官方比赛成绩。

Version one provides no private judge, multiplayer leaderboard, scoring system, or Rating. Timing depends on the system clock. Codeforces public submissions may arrive late, and pending verdicts can remain after finish; synchronize again when needed. First AC, wrong attempts, and unsolved lists are personal practice evidence rather than official contest results.
