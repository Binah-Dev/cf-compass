# 计划题单计时表 / Study timer

本地计时小工具；不改变题单完成记录、训练成绩或 Rating，不增加统计和云同步。

## 使用

在 **计划题单 → 计时表** 打开真正的辅助窗口，独立题单窗口也提供入口。重复打开会显示已有窗口，不创建多个计时表。全局同时保留一只计时表。

- **正向计时**：开始、暂停、继续、重置。累计时间可以超过 24 小时。
- **反向计时**：指定时长（1 秒到 7 天），开始、暂停、继续、重置。到时显示完成提示，不播放声音。
- **定点计时**：指定本地日期和时刻，清晰显示跨日日期与时区；开始后目标时刻固定。没有暂停，取消后可以修改。目标必须在未来 366 天内。

正在计时或暂停时，须先重置/取消，才能修改模式或设置。点击开始后保存设置与计时状态；尚未开始的输入只在当前窗口内，关闭后不保留。开始等操作落盘后才更新状态，重复点击不会重新创建计时器。

## 定点响铃

声音配置仅在定点模式显示。默认是程序生成的温和短铃声，也可用系统文件选择框选择本地音频，试听或停止。自动播放与试听均有上限（最多 15 秒），不循环。正向和反向计时保持静音。

支持选择 `.wav`、`.mp3`、`.ogg`、`.m4a`、`.aac`、`.flac` 文件，单文件最多 20 MiB。实际解码能力取决于当前 Electron/系统；自定义音频无法解码或副本缺失时尝试默认铃声并显示提示。音频只复制到本地应用数据，不上传，原文件之后移动不影响已保存副本。播放器只通过固定内部地址读取受管理的默认/自定义音频，页面不能指定任意文件路径。

取消、重置、切换模式和显式“停止铃声”会停止播放。同一次到时不会因为普通刷新或重复轮询反复响铃。系统静音、音量和通知设置仍可能影响提示。

## 关闭、后台与恢复

- 主窗口切页或最小化不影响计时。关闭辅助窗口也不暂停；应用仍在运行时，定点到时仍可播放音频。
- 退出整个应用后保存时间锚点；正在运行的计时继续按现实经过时间计算，暂停的计时仍暂停。重新启动后恢复状态，过期的计时补完成提示。
- 应用退出期间不会播放声音，也不会自动启动。电脑休眠期间不能保证准时响铃；恢复运行时立即校准并检查到时。此功能不会唤醒电脑，不是系统级闹钟。
- 使用系统时间而非每秒累加，避免后台节流和休眠漏计；手动修改系统时钟仍会影响时间计算。

状态保存在应用数据目录的 `study-timer.json`；音频配置为 `study-timer-audio.json`，音频副本位于 `study-timer-audio/`。它们独立于学习数据，目前不随学习数据导入/导出迁移。试用和自动化检查使用独立数据目录，不修改正式安装。

## 开发验证

`pnpm test:study-timer` 检查时间边界、恢复、并发和本地音频存储；`pnpm verify` 编译；`pnpm qa:study-timer` 使用独立测试数据执行实际 Electron 窗口流程。此功能无需新增开发依赖。

## English

Open **Study Plan → Timer**, or use the timer button in the separate study-plan window. Repeated opens focus the same auxiliary window. There is one timer at a time.

Stopwatch and countdown support start, pause, resume, and reset. Target-time mode uses an explicit local date and time, displays its date and time zone, and offers cancel/edit instead of pause. Reset or cancel before changing an active timer's settings. Starting saves the settings and timer state; unstarted form inputs are not retained after closing the window.

Only target-time mode plays audio. It uses a short generated bell by default, supports a local audio copy (up to 20 MiB), and offers preview/stop. Playback never loops and lasts at most 15 seconds. Unsupported or missing custom audio falls back to the default bell. Other timer modes and OS completion notifications are silent.

Timers survive closing the auxiliary window and restarting the application. Running timers include elapsed time while the app is closed; paused timers stay paused. No sound plays while the app is fully exited. Sleep does not guarantee a punctual alarm; resuming recalibrates from the system clock. The feature neither wakes the computer nor starts the application automatically.

Timer/audio state stays local and separate from learning-data backups. The timer adds no statistics, cloud service, or Rating changes.
