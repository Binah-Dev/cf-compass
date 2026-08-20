# CF Compass

[![Build](https://github.com/qeffg/cf-compass/actions/workflows/build.yml/badge.svg)](https://github.com/qeffg/cf-compass/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2ea44f.svg)](./LICENSE)

CF Compass 是一款面向 Windows 的 Codeforces 训练、复习与赛事复盘桌面应用。它把题库、提交记录、每日训练、间隔复习、算法弱点和本地模板库装进同一座清晰的“训练驾驶舱”。

## 开源版界面

本仓库只保留三套原创、纯 CSS 主题色：

- 天空蓝 `sky`：清澈、专注。
- 薄荷绿 `mint`：柔和、舒缓。
- 珊瑚粉 `coral`：明快、醒目。

开源版不包含角色图片、游戏素材、壁纸图库、用户自定义背景或任何本地训练数据。默认使用深色渐变背景，外观抽屉只提供上述三套主题色。

## 主要功能

- 同步 Codeforces 用户资料、题库、提交记录与 Rating 历史。
- 按标签、Rating、完成状态、收藏与关键词筛选题目。
- 生成分档每日题单，并维护错题、笔记与间隔复习队列。
- 复盘 Rated 比赛，筛选赛事并计算表现分。
- 浏览本地算法模板，保存和规范化题目摘要。
- 数据默认保存在本机，支持 JSON 导入导出与本地备份。

## 本地开发

需要 Node.js 20+ 与 pnpm。

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm desktop
```

仅验证前端构建：

```powershell
pnpm verify
```

生成 Windows 解包版或 portable 版本：

```powershell
pnpm desktop:pack
pnpm desktop:build
```

构建产物位于 `release/`，不会提交到 Git。

## 项目结构

- `src/`：React 界面、训练逻辑与三套主题色。
- `electron/`：Electron 主进程、本地数据与系统集成。
- `build/`：原创应用图标。
- `.github/`：持续集成、Issue 与依赖更新配置。

## 隐私与安全

CF Compass 不要求 Codeforces 密码，也不会代替用户提交代码。训练记录、笔记、模板摘要和备份默认保存在本地用户数据目录。提交 Issue 前请移除 Handle 之外不希望公开的个人数据与本地路径。

安全问题请使用 GitHub 的私密安全报告功能，详见 [SECURITY.md](./SECURITY.md)。

## 参与贡献

欢迎提交 Issue 与 Pull Request。开始前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 和 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

## 许可证与声明

原创代码与三套主题色使用 [MIT License](./LICENSE)。第三方依赖与算法归属见 [CREDITS.md](./CREDITS.md)。

Codeforces 名称及相关标识归其权利人所有；本项目与 Codeforces 无官方隶属或合作关系。
