# Issue #31：训练偏好与双 Rating

## 最终规则（v4.2.0）

- 首次默认官方模式；主页个人进度可切换估算模式，按账号保存。
- 官方模式下，今日训练支持自动参考官方分（无分时 1200）或手动输入 800–3500。
- 估算模式采用累计虚拟赛参考分，并限制训练题目难度范围在 800–3500；手动输入此时不覆盖估算。
- 原设计中的「勾选场次并平均表现分」已废弃。现在自动累计有历史官方 Rated 对照证据的虚拟场次，完整规则见 [双 Rating](./dual-rating.md)。
- 支持自动 / 手动弱项标签；手动标签不伪造真实掌握度。留空时不生成专项题单。
- 复习题量、难度范围和巩固/稳步/挑战题量集中在今日训练。题量设置沿用全局设置，Rating 与弱项偏好按账号保存。
- 恢复默认计算保留笔记、复习和完成记录；已选估算视图保持不变。

## 数据与缓存

`study.json.trainingProfiles` 保存按账号分开的偏好。主进程和前端共享字段规范化；不新增遥测。官方缓存不写入派生估算。题单上下文包含有效参考分和偏好，变化后刷新题单，保留完成记录。

旧版本可能不保留新字段，降级前请备份。双 Rating 的历史场次缺失、重算与来源限制见专门说明。

## 验证

```text
node scripts/test-training-profile.mjs
node --test scripts/test-virtual-rating.cjs scripts/test-virtual-reference.cjs scripts/test-contest-sessions.cjs
node scripts/qa-issue-31-training.cjs
node scripts/qa-dual-rating.cjs
```

训练偏好逻辑测试覆盖 10 项；独立 Electron 偏好回归覆盖保存、重启、账号切换、失败回退、重置及中英文等 7 个检查点。双 Rating 独立回归覆盖累计计算、视图传播、重启和官方缓存不变等 7 项。使用合成数据和隔离用户目录，不代表真实长期训练效果或预测精度。
