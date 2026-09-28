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

**Pending:** actual Linux build, FUSE-mounted launch, extracted launch, network-isolated screenshots, stable update metadata and local zsync reconstruction in CI. WSL was unavailable on the Windows host; no Linux compatibility result is claimed. No release was created and no catalog comment was sent as part of these local checks.

## Selected catalog screenshot

`docs/screenshots/appimage-workbench.png` is an unedited capture of the real workbench with the built-in `compass_demo` dataset. The owner chose an equivalent demo-account view instead of publishing the personal account in the supplied reference. The public-facing screenshot uses English and preserves the category/problem/progress layout. It was captured from the Windows source application and is a product illustration, not evidence of Linux compatibility.

The screenshot is committed separately at `ef58752557dde0e4cb041d835a98f19bedf50c64` so AppStream metadata can reference an existing immutable public image URL. Catalog-page screenshot selection and the catalog bot's automatically captured test screenshot are separate. Changing the test branch does not update the public catalog or the existing PR comment; a future release and catalog regeneration are still required.

## First cloud run

[Run 36419730247](https://github.com/Binah-Dev/cf-compass/actions/runs/36419730247), source `ae59484a237fed22a3fda48fba1bdd338fa7f658`: verification, Windows packaging/UI regression, and both macOS targets passed. Linux repacking failed because the pinned appimagetool bundled a zstd-only mksquashfs while the script requested gzip. FUSE/extraction tests and Ubuntu 22.04 validation were not reached. Release jobs were skipped. This failure does not constitute a Linux startup result.
