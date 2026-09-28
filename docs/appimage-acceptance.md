# AppImage catalog acceptance

The intended first screen is the problem workbench: category navigation, problem search/list, and the personal-progress panel. A fresh installation uses the existing built-in demonstration dataset and identifies it as demonstration data. No personal account or screenshot-specific fixtures are added to the product.

## Acceptance inventory

| Claim | Functional check | Visual evidence |
| --- | --- | --- |
| Fresh users can reach the workbench offline | Empty isolated user directory; no login or synchronization; window visible and rows ready within 30 seconds | `first-launch.png` at the native launch size |
| Demonstration data is clearly identified | Demo sync state and a demo-specific statistics source label | English and Chinese first screens |
| Local exploration works without a connection | Search, favorite/unfavorite, Data Center and return | Workbench after interaction |
| Empty-result state is recoverable | Search for a missing title, then clear it | Visible empty state and restored rows |
| Saved language preferences remain honored | Start with only a saved language preference on a different system locale | Saved-language first screen |
| Small windows retain essential controls | Resize to the declared 1040 x 700 minimum | `minimum-window.png`; inspect control bounds and clipping |
| Final AppImage runs normally | Linux launch in FUSE mount mode, checking the actual mounted application path | First-run report and screenshot from the packaged application |
| Extraction fallback also works | Separate clean run using `APPIMAGE_EXTRACT_AND_RUN=1` | Independent report and screenshot |
| Standard update support is usable | Check embedded update target and zsync length, digest and URL against the final AppImage | Artifact validation report; a real updater transfer is a separate check |

`scripts/qa-first-launch.cjs` never uses the owner's application data. Windows/source verification uses a denied proxy and renderer offline mode. The Linux CI tests additionally run inside a network namespace with no external network interfaces; their report records that distinction. Playwright's automatic sandbox bypass is explicitly disabled; launch arguments and the application's command line must not contain `--no-sandbox` or `--disable-setuid-sandbox`.

Local code/configuration checks do not establish Linux package compatibility. A new Release and a rerun of the AppImage catalog test are separate from local acceptance.

## Local evidence (2026-09-28)

The production renderer was rebuilt and launched from source using Electron 43.4.1 on Windows. Each automated case used its own fresh temporary data directory. These are source-app checks, not tests of a published Windows installer or of the Linux AppImage.

| Case | Result | Workbench ready | Evidence directory |
| --- | --- | --- | --- |
| Fresh English first launch | All 19 checks passed | 841 ms | `.qa-output/catalog-first-launch/english/` |
| Fresh Chinese first launch | All 19 checks passed | 805 ms | `.qa-output/catalog-first-launch/chinese/` |
| Saved English preference with Chinese launch locale | All 19 checks passed | 777 ms | `.qa-output/catalog-first-launch/saved-language-recheck/` |

The native 1500 x 940 first screen and 1040 x 700 minimum window were visually inspected. Search, favorite/unfavorite, empty-search recovery and Data Center navigation passed. The normal workbench keeps the requested three-panel layout; the minimum-width layout reflows with internal panel scrolling. Demo identity/source labels remain visible, and the English sync button no longer wraps. An additional interactive search/favorite round trip was captured in `.qa-output/catalog-first-launch/interactive-final.png`. These startup times describe this machine and test setup, not a performance guarantee.

Related avatar/frame/layout tests passed (9 tests), as did training-profile regression checks (12 tests). The production build passed with the existing nonblocking mixed static/dynamic-import warning for `ProblemNoteDrawer`.

At this local-only checkpoint, actual Linux build/launch and zsync reconstruction were still pending because WSL was unavailable on the Windows host. The dated cloud results below supersede that status. No release was created and no catalog comment was sent as part of these local checks.

## Selected catalog screenshot

`docs/screenshots/appimage-workbench.png` is an unedited capture of the real workbench with the built-in `compass_demo` dataset. The owner chose an equivalent demo-account view instead of publishing the personal account in the supplied reference. The public-facing screenshot uses English and preserves the category/problem/progress layout. It was captured from the Windows source application and is a product illustration, not evidence of Linux compatibility.

The screenshot is committed separately at `ef58752557dde0e4cb041d835a98f19bedf50c64` so AppStream metadata can reference an existing immutable public image URL. Catalog-page screenshot selection and the catalog bot's automatically captured test screenshot are separate. Changing the test branch does not update the public catalog or the existing PR comment; a future release and catalog regeneration are still required.

## First cloud run

[Run 36419730247](https://github.com/Binah-Dev/cf-compass/actions/runs/36419730247), source `ae59484a237fed22a3fda48fba1bdd338fa7f658`: verification, Windows packaging/UI regression, and both macOS targets passed. Linux repacking failed because the pinned appimagetool bundled a zstd-only mksquashfs while the script requested gzip. FUSE/extraction tests and Ubuntu 22.04 validation were not reached. Release jobs were skipped. This failure does not constitute a Linux startup result.

## Second cloud run

[Run 36420982294](https://github.com/Binah-Dev/cf-compass/actions/runs/36420982294), source `c3f1a163cca5010275d9e0f6d316cd485fef6d4f`: AppStream validation, zstd repacking, static-runtime/update metadata checks and zsync reconstruction passed. The final AppImage mounted through FUSE in the network-isolated test and displayed the workbench in 1362 ms. Acceptance then failed because the internal application command line contained a sandbox-disable switch, despite the external test launcher preserving the sandbox. The builder-generated AppRun and desktop-entry defaults require correction before accepting the package. Extraction and Ubuntu 22.04 tests were not reached. Windows/macOS targets passed; release jobs were skipped.

Subsequent Linux reports record the same test user's namespace probe and relevant kernel policy values as diagnostics. These observations do not change host security policy, disable Chromium sandboxing, or excuse a failed startup.

## Third cloud run

[Run 36422543310](https://github.com/Binah-Dev/cf-compass/actions/runs/36422543310), source `7694ee1380c27fa78370b18127876b6a8925e200`: launcher/desktop preparation, metadata and zsync validation passed. The FUSE startup test then failed with Playwright's `Process failed to launch!`; an early rejected internal promise terminated the test before its report was written. Without native process stderr, this run does not establish the cause. Other platform jobs passed and no release ran.

The follow-up harness persists diagnostics before launching, captures browser startup logs, and records early promise failures with a failing exit status. Both Linux launch modes run independently and the job remains failed if either fails. A successfully repacked but startup-failing Linux artifact may be uploaded for the separate Ubuntu 22.04 diagnosis; it is not a release-qualified package and cannot bypass the failed package job's publication gate.

## Fourth cloud run: verified results and remaining limitation

[Run 36423559190](https://github.com/Binah-Dev/cf-compass/actions/runs/36423559190), tested source `c9b5ceab2939e4c38cd7d10e57b19862c85feed0`:

| Environment | FUSE launch | Extracted launch | Result |
| --- | --- | --- | --- |
| Ubuntu 22.04 runner | 21 checks passed; ready in 3088 ms | 21 checks passed; ready in 1704 ms | Final package runs offline; no sandbox-disable switches detected |
| Ubuntu 24.04.5 runner (`ubuntu24/20260920.314`) | Startup failed | Startup failed | Restricted user namespaces; SUID sandbox helper fallback unavailable |
| Windows x64 / macOS x64 and arm64 | Not applicable | Not applicable | Existing packaging and platform acceptance jobs passed |

Both Ubuntu 22.04 reports confirm isolated networking, the expected mount/extraction path, demonstration identity, search/favorite/navigation flows, and the minimum-size layout. Native and minimum-window screenshots were also visually inspected. Evidence is in the `AppImage-first-launch-ubuntu-22.04` workflow artifact. AppStream metadata, zstd/static runtime, stable update information and local zsync reconstruction passed before startup testing.

On the Ubuntu 24.04.5 runner, `kernel.apparmor_restrict_unprivileged_userns=1`, `unshare -Ur true` failed to write its UID map, and Chromium reported a fatal SUID sandbox helper ownership/mode error in both launch modes. The Ubuntu 22.04 control reported restriction value `0` and a successful namespace probe. This is consistent with [Ubuntu's documented user-namespace restrictions](https://documentation.ubuntu.com/release-notes/24.04/#unprivileged-user-namespace-restrictions); it is not a claim that every Ubuntu 24.04 installation has identical policy. Host policy was not disabled to make tests pass.

**That historical run failed and was not release-qualified.** It did not establish restricted-host compatibility. The catalog's Ubuntu 22.04 Firejail command is also a distinct environment from these network-namespace tests and needs its own catalog rerun. The designated catalog screenshot is configured, but the live catalog and its bot comment have not been replaced.

## v4.2.2 candidate: documented restricted-host installation

[Run 36431338208](https://github.com/Binah-Dev/cf-compass/actions/runs/36431338208), source `b1522cdd2bbbca370733ed3565471685b2530ef6`, tests actual version 4.2.2 packages. The Ubuntu 24.04 job keeps its global AppArmor user-namespace restriction enabled. The Debian installer loads its existing application-specific profile. The AppImage is installed root-owned at the documented fixed path and receives a separate exact-path profile. Neither path disables the Chromium sandbox; this explicitly requires administrator-approved installation on restricted hosts.

| Ubuntu 24.04 package / mode | Checks | Workbench ready | Profile |
| --- | --- | --- | --- |
| Installed Debian package | 26 passed | 4462 ms | `cf-compass (unconfined)` |
| AppImage FUSE | 28 passed | 1044 ms | `cf-compass-appimage (unconfined)` |
| AppImage extraction | 28 passed | 1315 ms | `cf-compass-appimage (unconfined)` |

All three reports record `NoNewPrivs: 1`, `Seccomp: 2`, enabled renderer sandbox preferences, a distinct renderer user namespace, the expected application-specific AppArmor label, and the global restriction still set to `1`. The unrelated `unshare -Ur true` probe still fails with `Operation not permitted`. The two AppImage tests have complete external-network isolation. The installed Debian test instead uses the existing denied proxy and renderer-offline setup; it is not a network-namespace test. Native and minimum-window AppImage screenshots were visually inspected. Startup timings describe this runner only.

The complete candidate run passed, including runtime/update/sidecar validation, policy cleanup, Windows packaging and UI regressions, and both native macOS targets. The dedicated Ubuntu 22.04 job passed 24 checks in each AppImage mode without the extra AppArmor profile: FUSE ready in 3781 ms and extraction ready in 1404 ms, both with external-network isolation and seccomp/no-new-privileges checks. Branch-preview release jobs were intentionally skipped; a tagged run must rebuild and pass draft-download and Windows installer/portable verification before publishing.

An AppArmor `unconfined` profile with `userns` is a scoped authorization exception, not full AppArmor confinement; instructions and its removal are in [Linux installation](linux-appimage.md). These checks do not establish a cross-version update against a future public release, nor do they replace the catalog's independent Firejail test.
