# Windows 安装版更新 / Windows installer updates

## 使用 / Use

Windows x64 安装版在 **数据中心 → 应用更新** 显示当前版本、检查结果和发布说明。点击检查后，有新版时再主动下载；下载完成后，点击安装并确认才退出应用、运行安装程序并重新启动。首次默认开启启动检查，可随时关闭；自动检查开关只控制是否在启动时检查，不会自动下载或安装。正在进行自定义训练赛时，安装会被阻止；先结束或取消训练，再安装更新。升级保留本地学习数据。

In the Windows x64 installer edition, open **Data Center → App Updates** to view the installed version, check results, and release notes. Check for a newer version, then choose to download it. Once downloaded, choose install and confirm to quit, run the installer, and restart. Startup checking is enabled initially and can be disabled. It never downloads or installs automatically. Installation is blocked while Custom Training is active. Finish or cancel the session first. Local study data is retained during upgrades.

检查或下载失败时，保留当前版本和本地数据，恢复网络后重试。下载可以取消；取消或关闭确认框不会安装更新。发布说明以纯文本展示。无法使用内置更新时，可点击发布页，手动下载官方 `Setup.exe` 覆盖安装。

Failed checks or downloads leave the current application and local data intact. Retry after reconnecting. Downloads can be cancelled; cancelling or dismissing the installation confirmation does not install anything. Release notes are displayed as plain text. When in-app updating is unavailable, open the release page and manually install the official `Setup.exe`.

便携版、解包目录、开发环境、浏览器及其他平台只提供手动下载入口。安装版判定同时检查 Windows x64、打包状态、便携环境变量、安装程序写入的专用标记及同目录卸载程序；不能只凭 `app.isPackaged` 判断。移动或复制安装目录可能使判定失效，此时重新运行安装程序。

Portable builds, unpacked directories, development, browsers, and other platforms provide a manual download link. Eligibility checks require Windows x64, a packaged app, no portable environment, the dedicated installer-written marker, and the expected uninstaller beside the executable. `app.isPackaged` alone is insufficient. Moving or copying an installation may invalidate detection; rerun the installer.

v4.3.1 首次提供 Windows 安装版内置更新。v4.2.2 及更早版本没有此入口，也没有 Windows 更新元数据；需要先从 [本仓库稳定发布页](https://github.com/Binah-Dev/cf-compass/releases/latest) 手动安装一次 v4.3.1 的 `Setup.exe`，之后才能通过此入口获取后续稳定版。

v4.3.1 introduces in-app updates for Windows installer editions. Windows v4.2.2 and older have no updater or Windows update metadata. First manually install the v4.3.1 `Setup.exe` from the [official stable release page](https://github.com/Binah-Dev/cf-compass/releases/latest); the in-app updater can then obtain later stable releases.

## 来源与校验 / Source and verification

更新源固定为 `Binah-Dev/cf-compass` 的公开 GitHub 稳定发布。界面不能设置任意下载服务器，不需要 GitHub 令牌，也不上传训练记录。只接受比当前版本新的正式 `x.y.z` 版本，以及对应的 Windows x64 `Setup.exe`；预发布、降级、便携包和 NSIS Web 安装包不用于本入口。

The source is fixed to public stable GitHub releases for `Binah-Dev/cf-compass`. The UI cannot configure another server. No GitHub token is required, and training records are not uploaded. Only newer stable `x.y.z` versions and their matching Windows x64 `Setup.exe` are accepted. Prereleases, downgrades, portable executables, and NSIS web installers are excluded.

`electron-updater` 按 `latest.yml` 中的 SHA-512 验证下载文件。它能发现传输损坏或文件与元数据不匹配，不能证明发布者身份：如果发布仓库或元数据同时被控制，攻击者也能替换摘要。当前没有商业 Authenticode 签名证书，未配置 `publisherName` 时不执行证书发布者校验；不会将其描述为“已认证发布者”，也不使用恒成功的自定义签名验证器。Windows SmartScreen 或管理员权限提示仍可能出现。依据是锁定版本的 [NSIS updater 源码](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.15.3/packages/electron-updater/src/NsisUpdater.ts) 与 [v26 更新说明](https://www.electron.build/v26/docs/features/auto-update/)。

`electron-updater` checks downloaded files against SHA-512 values in `latest.yml`. This detects corruption and mismatches with the metadata; it does not authenticate a publisher when the release account or metadata is compromised too. Without an Authenticode certificate and `publisherName`, certificate publisher verification is unavailable. The application does not claim a verified publisher or use an always-successful signature verifier. SmartScreen and administrator prompts may still appear. See the [version-matched updater source](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.15.3/packages/electron-updater/src/NsisUpdater.ts).

## 发布要求 / Release requirements

工程锁定 Electron `43.4.1`、electron-builder `26.15.3` 和运行时依赖 electron-updater `6.8.9`。未覆盖工具集配置时，builder 使用 NSIS `3.0.4.1` 与资源包 `3.4.1`。官方主站的 next / v27 文档含尚不适用于本锁定版本的配置和签名功能；本实现以 [v26 文档](https://www.electron.build/v26/docs/nsis/) 和安装的源码为准。

updater 的 `js-yaml` 子依赖通过 pnpm override 固定为 `4.3.2`，修复本次依赖审计发现的 `GHSA-2883-xcg3-v3hh`；后续重建应使用锁文件并重新执行生产依赖审计。

The project pins Electron `43.4.1`, electron-builder `26.15.3`, and runtime dependency electron-updater `6.8.9`. With no toolset override, builder uses NSIS `3.0.4.1` and resources `3.4.1`. Use [v26 documentation](https://www.electron.build/v26/docs/nsis/) and the installed source; the documentation site's next / v27 configuration and signing features do not automatically apply to this toolchain.

A pnpm override pins updater's `js-yaml` dependency to `4.3.2` to address `GHSA-2883-xcg3-v3hh` found during dependency auditing. Rebuild with the lockfile and rerun the production dependency audit.

稳定 Windows 更新需将以下三个匹配资产加入同一 Release：

Stable Windows updates require three matching assets in the same release:

- `CF-Compass-VERSION-Windows-x64-Setup.exe`
- `CF-Compass-VERSION-Windows-x64-Setup.exe.blockmap`
- `latest.yml`

`latest.yml` 的版本、文件名、大小和 SHA-512 必须与实际安装包一致，不能引用 portable。本轮启用完整安装包下载，暂不启用差分；仍发布 `.blockmap`，保持更新资产契约并为后续差分验证准备。`resources/app-update.yml` 是打包应用内部的来源配置，不作为公开下载附件。稳定 Release 现有七项平台资产加这两项 Windows sidecar 为九项；预发布保留安装包 blockmap，但不发布稳定 `latest.yml`。CI 需同时更新上传清单、严格资产校验、下载回验及私有 SHA-256 manifest，并在门禁通过后才公开草稿 Release。公开列表仍不增加 `.sha256` 或 `SHA256SUMS.txt` 附件。

`latest.yml` must match the installer version, filename, size, and SHA-512; it must not reference portable. This version downloads full installers and leaves differential downloads disabled. The blockmap is published to preserve the update asset contract and support later differential testing. `resources/app-update.yml` stays inside the packaged application. Stable releases contain the existing seven platform assets plus these two Windows sidecars. Prereleases retain the installer blockmap but do not publish stable `latest.yml`. CI must upload, validate, and redownload the exact inventory, then verify the private SHA-256 manifest before making the draft public. Separate checksum attachments remain excluded.

保持 `appId`、安装 GUID、产品名和用户数据位置稳定，以便原安装程序识别升级。不得为测试修改生产更新源或推送测试版本到正式仓库。

本功能首个正式版本为 `4.3.1`，Git tag 必须严格等于 `v` + `package.json.version`；CI 执行此一致性门禁。后续正式版本继续提升版本号，保留既有公开版本及其资产。

Keep the production app ID, installer GUID, product name, and user-data location stable so installers recognize upgrades. Do not change the production feed or publish test versions to the real repository for testing.

The first production version containing this feature is `4.3.1`. Its Git tag must exactly equal `v` plus `package.json.version`; CI enforces this match. Increment the version for subsequent production releases and retain existing public versions and their assets.

## 验收 / Validation

本地已通过两个隔离 NSIS fixture 版本（`0.0.1 → 0.0.2`）的实际升级测试，验证错误 SHA-512 拒绝、下载、明确安装、重启版本变化和数据保留。它使用独立身份与本机 loopback 源，不能证明生产 GitHub 渠道向未来公开版本的升级。本次正式发布仍需通过 CI 的各平台构建与发布门禁；详细边界见 [v4.3.1 发布说明](./releases/v4.3.1.md)。

The local two-version NSIS fixture test (`0.0.1 → 0.0.2`) passed incorrect SHA-512 rejection, downloading, explicit installation, restart/version changes, and data retention. Its separate identity and loopback feed do not establish an upgrade through the production GitHub channel to a future public release. This production release still requires the CI platform builds and publication gates described in the [v4.3.1 notes](./releases/v4.3.1.md).

`node scripts/qa-app-update.cjs` 使用虚构用户、独立 `CF_COMPASS_USER_DATA` 和主进程内 mock updater，操作真实 Electron 窗口。它验证双语入口、检查与下载状态、重复操作、取消、错误、纯文本发布说明、明确安装确认及训练保护；mock 的安装方法只记录调用，不执行安装。此类验收不能证明跨版本 NSIS 安装成功。

`node scripts/qa-app-update.cjs` drives a real Electron window with fictional data, isolated `CF_COMPASS_USER_DATA`, and a main-process mock updater. It checks bilingual controls, check/download states, duplicate actions, cancellation, failures, plain-text release notes, explicit installation confirmation, and training protection. The mock installer records calls only. These checks do not prove a real NSIS version-to-version upgrade.

`pnpm qa:app-update:main` 保留实际主进程 IPC、持久化训练服务和串行锁，只在测试启动器替换更新传输和安装器。它覆盖开始训练/安装的两个先后顺序、其它账号的训练、导入恢复运行中训练、安装后拒绝导入和双语提示，不执行真实安装。

`pnpm qa:app-update:main` keeps the real main-process IPC, persisted training service, and shared lock, while mocking updater transport and installation in a QA bootstrap. It covers both training/install action orders, another account's training, imports that restore active sessions, import rejection during installation, and bilingual messages. It does not execute an installer.

`pnpm qa:app-update:local` 构建并运行两个独立随机身份的 NSIS 测试版本，验证错误 SHA-512 被拒绝、正确安装包、明确安装、重启版本变更和数据保留，并卸载测试副本。已有 fixture 可使用 `node scripts/qa-app-update-local.cjs --context output/app-update-local/RUN/context.json --reuse-builds` 继续；脚本先核对两包的版本、身份、内置配置和测试入口内容，并重做注册表/缓存前置检查。每次结果在对应 `report.json`。

`pnpm qa:app-update:local` builds and runs two uniquely identified NSIS fixtures to test incorrect SHA-512 rejection, valid downloads, explicit installation, restart/version changes, and data retention, then uninstalls only the fixture. Existing builds can be reused with the `--context` and `--reuse-builds` arguments after their versions, identities, embedded configurations, entry code, registry, and cache preconditions are verified. Each run saves its own `report.json`.

真实跨版本验收需另建独立 fixture：使用测试专属 `appId`、产品名和安装 GUID，两个递增版本，临时安装目录和用户数据目录，以及仅监听 `127.0.0.1` 的本地服务器。测试专属 Electron 入口直接创建 `new NsisUpdater({provider:'generic',url:loopbackUrl})`；生产服务与固定 GitHub 源保持不变。先安装旧 fixture，再检查、下载、确认安装新 fixture，重新启动后核对新版本与旧数据哨兵。最后只卸载专属 fixture、停止本次启动的进程并保留报告；不得覆盖现有 CF Compass 安装或其注册表键。另测离线、错误 SHA-512、取消和重复点击，以及便携/解包禁用、安装权限被拒绝和自定义目录。

fixture 必须使用全新 `projectDir`，不能在生产工程只传 `extends:null`：builder 仍会合并生产 `package.json` 的 `build`。同时使用独立可执行文件名，避免 NSIS 按进程名关闭正式应用。重启只传 `--updated`，因此两版内置相同的测试配置文件以恢复临时目录及 loopback 源；不依赖启动参数或父进程环境。运行时下载缓存与 NSIS 在真实 `%LOCALAPPDATA%` 写入的独立 fixture 安装器缓存须分别记录和检查，预存在的目录不得清理。

For a real two-version NSIS test, build a separate fixture with a unique app ID, product name, installer GUID, increasing versions, temporary install/user-data directories, and a server bound only to `127.0.0.1`. The QA-only Electron entry constructs `new NsisUpdater({provider:'generic',url:loopbackUrl})`; the production service and GitHub feed remain unchanged. Install the old fixture, check and download the new one, confirm installation, then verify the new version and preserved data sentinel after restart. Uninstall only that fixture and stop only processes started by this run. Keep its report. Never overwrite an existing CF Compass installation or registry entry. Also cover offline operation, bad SHA-512, cancellation, duplicate clicks, unsupported portable/unpacked builds, denied permissions, and custom install paths.

Use a new `projectDir`: `extends:null` in the production directory still merges its `package.json` build configuration. Use a unique executable name because NSIS can close processes by name. Restart carries only `--updated`, so embed the same QA configuration in both fixtures instead of relying on CLI arguments or inherited environment variables. Track runtime download cache separately from NSIS's fixture-only installer cache in the real `%LOCALAPPDATA%`. Never delete a cache directory that existed before the test.
