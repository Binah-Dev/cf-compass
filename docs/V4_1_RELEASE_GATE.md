# v4.1 Release Gate

Scope: Issue #25, virtual-reference isolation, free panels, readable text, measured interaction improvements, and material categories reduced to All. No third-party assets or personal profiles may be committed.

## Local evidence

- Production dependency audit: no known vulnerabilities reported on 2026-09-08.
- Baseline: `output/playwright/interaction-baseline-1788834142186/report.json`; candidate: `output/playwright/interaction-candidate-1788834228965/report.json`.
- Same fixture: 600 rating records, 600 templates, 240 synthetic pointer events. Layout reads 241 → 1; initially mounted cards 600 → 60. Candidate can load another batch and find/open the final template. Synthetic bursts prove coalescing, not device-independent FPS.
- Wall-clock observations: template result appearance ~402ms → ~238ms; burst duration ~50ms in both cases; these are single-run observations, not statistically significant timing claims.
- Per-frame queue tests cover latest-value semantics, release flush, cancellation and reuse.
- Final local suite: 13/13 unit/service groups passed (`output/v41-verification-1788834440183/report.json`); 8/8 UI groups passed (`output/v41-verification-1788834301092/report.json`), including 64 readable-interface scenarios.
- Ordinary text, free layout and Issue #25 regressions use isolated profiles. Original installed profile and OJ remain untouched.
- A legacy performance-test filesystem watcher reached the running preview's locked Cookies file. Disabled file watching in that SSR-only unit-test harness; application functionality and safety checks unchanged. Failed evidence retained under output.

## Focused security check

- Electron windows retain contextIsolation=true, nodeIntegration=false and sandbox=true.
- New virtual-reference IPC uses the existing trusted-renderer wrapper. No renderer credentials or AI API calls are introduced by performance changes.
- CSP script-src remains self-only; new UI renders text through React, without raw HTML or dynamic code execution.
- Layout persistence validates finite geometry; atomic JSON writes retain the previous document on replacement failure.
- This is a focused change review, not a comprehensive penetration test. macOS is ad-hoc signed, not notarized.

## Remote release sequence

1. Push candidate branch; independently dispatch four native packaging targets before publishing.
2. Require source verification, Windows packaged UI regressions, Linux packaged launch, and native macOS x64/arm64 signature/launch checks.
3. Only after that gate passes, advance main and tag v4.1.0 without force-pushing.
4. Tagged pipeline builds and publishes packages, downloads all assets to verify SHA256SUMS, then independently downloads Windows installer/portable for installation and cold-start tests.
5. Only the successful final job posts the version-specific reply and closes Issue #25. Dependency PRs stay out of scope.

Final native run IDs and published evidence must be checked from GitHub, not inferred from this plan.

## First candidate audit

Run `34180151538` on `566d959` built all four targets, but is **not accepted** as a release gate. Windows job logs exposed two masked timeouts: a legacy template test relied on host language and ignored the packaged executable; a replay test still searched for the renamed “加入复习” button. PowerShell continued after failed native commands. The harness now pins its fixture language, tests the packaged executable, uses current queue controls, checks renderer errors, and explicitly throws on any failed command. A fresh independent run is required.
