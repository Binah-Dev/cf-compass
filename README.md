<p align="center">
  <img src="./build/icon.png" width="104" alt="CF Compass 图标" />
</p>

<h1 align="center">CF Compass</h1>

<p align="center">
  <strong>把零散刷题变成一条看得见、走得稳的训练路线。</strong><br />
  面向 Windows 的 Codeforces 训练、复习与赛事复盘桌面工作台。
</p>

<p align="center">
  <a href="https://github.com/qeffg/cf-compass/actions/workflows/build.yml"><img src="https://github.com/qeffg/cf-compass/actions/workflows/build.yml/badge.svg" alt="Build" /></a>
  <a href="https://github.com/qeffg/cf-compass/releases/latest"><img src="https://img.shields.io/github/v/release/qeffg/cf-compass?display_name=tag&sort=semver" alt="Latest release" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-2ea44f.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows" alt="Windows" />
</p>

<p align="center">
  <a href="#界面预览">界面预览</a> ·
  <a href="#功能一览">功能一览</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#隐私与数据">隐私与数据</a> ·
  <a href="#参与贡献">参与贡献</a>
</p>

CF Compass 把 Codeforces 题库、提交记录、每日训练、间隔复习、赛事表现和本地算法模板装进同一座“训练驾驶舱”。你不必在网页、表格和零散笔记之间反复横跳，可以在一个界面里回答三个关键问题：**今天练什么、哪些题该复习、最近究竟进步了多少。**

## 界面预览

![CF Compass 题库工作台](./docs/screenshots/dashboard-sky.png)

<p align="center"><sub>题库工作台 · 天空蓝主题 · 仓库内置虚构演示数据</sub></p>

![CF Compass 三套主题色选择器](./docs/screenshots/theme-picker.png)

<p align="center"><sub>开源版外观抽屉只提供天空蓝、薄荷绿与珊瑚粉</sub></p>

## 功能一览

| 模块 | 能做什么 |
| --- | --- |
| 题库工作台 | 按标签、Rating、完成状态、收藏和关键词筛选题目，集中查看刷题进度。 |
| 今日训练 | 根据当前水平生成分档题单，把“想刷题”变成可以立刻执行的任务。 |
| 复习库 | 维护错题、笔记与间隔复习队列，让做过的题真正沉淀下来。 |
| 赛事复盘 | 整理 Rated 比赛记录、筛选赛事并计算表现分，观察比赛能力变化。 |
| 赛事中心 | 浏览赛事信息，把参赛与赛后训练串进同一套工作流。 |
| 模板库 | 浏览本地算法源码，保存结构清晰、数学符号可读的题意摘要。 |
| 数据中心 | 导入、导出与备份本地训练数据，方便迁移和恢复。 |

此外，应用可以同步 Codeforces 用户资料、题库、提交记录与 Rating 历史，并提供个人进度、标签掌握度、AC 质量与近期活动等可视化信息。

## 三套主题色

开源版固定保留三套原创、纯 CSS 主题，不依赖任何第三方图片素材：

| 主题 | 标识 | 主色 | 气质 |
| --- | --- | --- | --- |
| 天空蓝 | `sky` | `#2F86F6` | 清澈、专注，默认主题。 |
| 薄荷绿 | `mint` | `#43C7A1` | 柔和、舒缓，适合长时间使用。 |
| 珊瑚粉 | `coral` | `#F27D9B` | 明快、醒目，强调关键状态。 |

> 本仓库不包含角色图片、游戏素材、壁纸图库、用户自定义背景或维护者的本地训练数据。公开版本默认使用深色渐变背景。

## 快速开始

### 环境要求

- Windows 10/11
- Node.js 22（CI 使用版本）
- pnpm 11.19.0（已在 `package.json` 中锁定）
- Git

### 获取并运行

```powershell
git clone https://github.com/qeffg/cf-compass.git
cd cf-compass
corepack enable
pnpm install --frozen-lockfile
pnpm desktop
```

首次启动后，在顶部输入 Codeforces Handle 即可同步公开数据。CF Compass **不需要 Codeforces 密码，也不会代替你提交代码**。

如果只想在浏览器中查看前端界面：

```powershell
pnpm dev
```

然后访问终端显示的本地地址。

## 构建与验证

```powershell
# 运行前端生产构建
pnpm verify

# 生成 Windows 解包目录
pnpm desktop:pack

# 生成 Windows portable 程序
pnpm desktop:build
```

构建产物位于 `release/`，该目录不会提交到 Git。当前 GitHub Release 提供经过版本标记的源码包；如需 Windows 可执行文件，请在本机执行上述构建命令。

主分支和 Pull Request 会在 GitHub Actions 的 Windows 环境中自动安装依赖、运行重点回归测试并验证生产构建。

## 项目结构

```text
cf-compass/
├─ src/                 React 界面、训练逻辑与三套主题色
│  ├─ components/      页面与可复用组件
│  ├─ data/            演示数据及静态配置
│  └─ lib/             Codeforces、训练、复习与格式化逻辑
├─ electron/            Electron 主进程、本地存储与系统集成
├─ scripts/             回归测试与质量检查脚本
├─ docs/screenshots/    README 演示截图
├─ build/               原创应用图标
└─ .github/             CI、Issue、PR 与依赖更新配置
```

## 隐私与数据

- Codeforces 同步只读取公开 API 数据，不收集账号密码。
- 训练记录、笔记、模板摘要、设置和备份默认保存在本机。
- 应用支持 JSON 导入、导出与本地备份，便于迁移和恢复。
- 开源仓库不包含任何真实用户数据、访问令牌或本机绝对路径。

提交 Issue 或截图前，请移除不希望公开的 Handle、日志、本地路径与备份内容。安全问题请使用仓库的 **Security → Report a vulnerability** 私密入口，具体流程见 [SECURITY.md](./SECURITY.md)。

## 参与贡献

Issue、功能建议与 Pull Request 都很欢迎。开始前请阅读：

- [CONTRIBUTING.md](./CONTRIBUTING.md)：开发流程、验证要求和开源版边界。
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)：社区行为准则。
- [SECURITY.md](./SECURITY.md)：安全问题报告方式。
- [CHANGELOG.md](./CHANGELOG.md)：版本变化记录。
- [CREDITS.md](./CREDITS.md)：第三方依赖与项目声明。

涉及界面的 Pull Request 请附上不含个人信息的截图；涉及数据结构时，请说明兼容性和迁移方式。

## 常见问题

<details>
<summary><strong>这是 Codeforces 官方应用吗？</strong></summary>

不是。CF Compass 是独立的开源项目，与 Codeforces 没有官方隶属或合作关系。

</details>

<details>
<summary><strong>为什么开源版没有壁纸和角色素材？</strong></summary>

为了让许可证边界清晰、仓库可以安全再分发，公开版本只保留原创代码、图标和三套纯 CSS 主题色。

</details>

<details>
<summary><strong>会自动替我提交题目吗？</strong></summary>

不会。CF Compass 负责训练规划、记录与复盘，不接收 Codeforces 密码，也不执行代码提交。

</details>

## 许可证与声明

原创代码、应用图标与三套主题色使用 [MIT License](./LICENSE)。第三方依赖及算法归属见 [CREDITS.md](./CREDITS.md)。

Codeforces 名称及相关标识归其权利人所有。本项目与 Codeforces 无官方隶属、背书或合作关系。

## English summary

CF Compass is an open-source Windows desktop companion for Codeforces practice, spaced review, contest analysis, and local algorithm templates. The public edition ships with three original CSS accent themes and contains no third-party wallpapers, character artwork, credentials, or user data. See [Quick Start](#快速开始) to run it locally.
