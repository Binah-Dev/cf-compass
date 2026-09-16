# Unified official + virtual Rating (local 4.2.0 prototype)

Base: `v4.2.0` (peeled commit `e1e2726`), branch `codex/v420-performance-training`.
This change is local only: no push, release, personal-profile migration or installation.

## User-facing model

- Opt in from Today's Training > Training preferences > Rating mode > Official + virtual (Carrot estimate). The home Personal Rating mode also offers a combined view; automatic training follows that view.
- Official and virtual participations enter one ledger, ordered by actual start time and stable session ID. A repeat virtual session is a distinct entry; duplicate records are not.
- Begin with known official Rating preceding the earliest discovered session, otherwise an explicitly simulated 1400. Every event recalculates Carrot's delta using the previous simulated Rating. Never add an official delta on top, average performances, reset to today's official Rating between sessions, or alter official history.
- Personal Rating has exactly two choices: official and combined official + virtual. Legacy `displayRatingMode: estimated` settings normalize to combined; their old virtual-only score is not reused as a combined result. Automatic/manual training controls remain available. Training difficulty keeps its existing 800–3500 bounds; the simulated career supports -500–5999 and marks clipping.
- Previously practiced problems and losses are included, with prior exposure disclosed. No new-account bonuses are simulated.

## Evidence and prompt estimation

- Settled official entries use `contest.ratingChanges` historical prior ratings and ranks. Settled virtual entries reuse the guarded virtual-score insertion path.
- An ended recent standard CF round without published rating changes can use its final public scoreboard and timestamped current user profiles as a **provisional proxy**, not falsely claimed historical ratings. Confirmed users with no rating use Carrot's 1400 default; missing users are errors, not invented zero ratings.
- Provisional scope is deliberately conservative: recognizable Codeforces/Educational/Global rounds, CF/ICPC scoring, regular contest IDs, unfrozen FINISHED scoreboards, contest start within seven days, complete final results and complete participant profiles. Contest-name eligibility is heuristic; the provisional roster is not certified as the official rated field. Old contests without historical evidence, unsupported special formats and incomplete data remain unavailable/excluded explicitly.
- No problem difficulty Rating is required. Virtual score reconstruction still needs valid score-model evidence and complete in-session submissions. During system tests or frozen boards the estimator waits rather than presenting a final-looking score.
- While opted in and the app is open, the renderer renews a 45-second service lease every 15 seconds; recent submissions are discovered every 30 seconds. The backend drains eligible work without waiting for the next renderer poll, prioritizing recent sessions for three turns and older evidence on every fourth turn. Known session end times schedule an earlier wake-up and bypass pre-end failure backoff. Completion pushes a native event to update training immediately. Only one background calculation is active, using shared rate-limited CF requests: **not a guaranteed instant answer**. Opponent snapshot reuse (10 minutes) and a bounded 60-second public contest cache reduce repeat downloads.
- Recent discovery reads the latest 1000 submissions; older history comes from the synchronized cache. Complete per-contest virtual submissions are fetched before reconstructing a score. Undiscovered registrations with no submissions cannot be reconstructed.
- Provisional records are retried after 60 seconds; failures back off up to 15 minutes. Recalculate bypasses that delay and marks all records for gradual refresh. Unsupported provisional scope remains retryable, including legacy heuristic exclusions. Only an official settled field proving that a formal participation was not rated is permanently excluded. Once official evidence arrives, it replaces the same record and the entire subsequent chain is recalculated.
- Missing events remain visible, explicitly counted and labelled as an incomplete trajectory; known events can still contribute. Missing comparison participants also mark the entry provisional and expose matched/missing counts in the ledger. These warnings are not calibrated uncertainty intervals. Offline failures preserve a matching cached result with a refresh warning. Account/fingerprint changes prevent evidence reuse.

## Data boundary / rollback

`cache.json` is read-only to this feature. `combined-rating.json` is a separate derived, handle-labelled cache of bounded display/reference records. It contains opponent rating/rank pairs, not API credentials. It may be discarded and rebuilt. Current opponent profile maps are memory-only. Switching back to automatic/manual/official mode stops new combined polling; background scheduling expires within 45 seconds. An already-running request may finish; it cannot overwrite a different account's raw cache.

## Verification and limits

Tests include mixed chronology, exact reuse of the shipped Carrot delta engine, zero double-counting, negative changes, new contests with no rating changes/problem ratings, settlement correction, stale/foreign/invalid evidence, missing profiles, unsupported/frozen/unfinished events, account-bound training selection, and defaults preserved.

Initial native Electron QA: synthetic official + two virtual sessions produced 1685; opt-in changed training, restart retained the choice, switching back restored 1200, and official cache bytes were unchanged. This is a fixture, not a real-user skill or accuracy claim.

Synthetic performance snapshot: 50 mixed sessions × 10,000 opponents; cold 358.44 ms, uncached recomputation 320.04 ms, cached p50 18.01 ms / p95 22.55 ms. Existing 12,000-problem recommendation suite p50 18.27 ms / p95 22.15 ms; five default personas retain identical recommended/review keys against the unchanged baseline planning code. The optional baseline test's legacy output label says v4.1.2; the actual comparison checkout was the 4.2.0-era `cf-compass-issue-31-training` tree.

These are local reproducibility/performance tests, not calibration against real unsettled Codeforces contests. No paid AI calls are needed. A formal release still needs native package gates and a real newly-finished contest check.

Final local evidence (2026-09-16): 21 unit groups passed in `output/v41-verification-1789556299949`; the expanded training suite subsequently passed 11 tests. The 17-group UI run `output/v41-verification-1789556285498` passed 16 groups and retained an appearance screenshot timeout. The unchanged appearance test passed standalone in `output/playwright/appearance-1789556583411`. Final rebuilt renderer passed the new combined-mode QA (`combined-1789556621799`, including home-mode propagation) and legacy dual-rating QA (`dual-rating-1789556627267`). No page errors and no official-cache modifications were observed. This is aggregate passing coverage, not a claim that the original full UI run was green.

Final focused suite: all 13 combined-rating tests passed, including exact session-end cache expiry, account switching during discovery, and public-only CF/ICPC score reconstruction with neither problem difficulty nor official rating changes. Reconstructed and direct virtual-row estimates agree on rank and performance in these fixtures.

Commands: `node --test scripts/test-combined-*.cjs`, `node scripts/benchmark-combined-rating.cjs`, `node scripts/qa-combined-rating.cjs`, `node scripts/verify-v41.cjs`, `node scripts/verify-v41.cjs --ui`, renderer build.

API semantics: [Codeforces objects](https://codeforces.com/apiHelp/objects), [Codeforces methods](https://codeforces.com/apiHelp/methods).

## Gap-closure verification (2026-09-16)

- Reproduced an old backlog entry winning over a newly ended VP, then added priority/fairness regression coverage. Added native completion notification, known-end/backoff and legacy exclusion recovery tests. Found and fixed an empty-history exception during this work.
- Production renderer build passed. The 21-group unit run passed at `output/v41-verification-1789557521524`. Expanded focused suite passed 17 tests. Native Electron QA at `output/playwright/combined-1789557626612` verifies an injected completion event changes the training reference within its 3-second test deadline, missing-session messaging, restart/mode rollback, and byte-identical official cache. This is not a network-latency measurement. Legacy dual-mode QA passed at `output/playwright/dual-rating-1789557517095`.
- Read-only live API validation on an existing VP of contest 2258 successfully reconstructed CF scores and produced a reference in approximately 71 ms local calculation. Public/historical intersection was 8620 matched and 3874 missing participants. Consequently its score is a partial-field estimate, not validated official-equivalent performance. No personal application data was written by this check.
- Still not claimed: newly ended real VP latency, calibrated score accuracy, or official-exact newcomer/eligibility handling. The public data inspected contains historical VPs, not a newly ended unsettled session. System-testing/frozen results still wait for reliable final data; zero-submission registrations cannot be inferred. These are explicit release/accuracy limits, not silently treated as successful estimates.
- Final rerun after coverage messaging: all 21 unit groups passed at `output/v41-verification-1789557737834`, including 19 focused tests (5 chain, 5 reference, 9 service). The real timer test woke at the known end in about 508 ms without a second renderer call. Production build and native UI QA passed at `output/playwright/combined-1789557751422`; the screenshot was visually inspected. The pre-existing mixed static/dynamic ProblemNoteDrawer import warning remains non-fatal. `git diff --check` passed. No push, issue closure, release, or installed-app update was performed.

## Acceptance bug fixes (2026-09-16)

- Manual training reference now takes precedence over every home display mode. Automatic mode still follows the home display; explicit combined mode uses the combined estimate. The old opposite-priority tests and UI explanation were updated intentionally to match this corrected contract.
- Ready references with missing Rated opponents are now eligible for automatic refresh. They retain the normal retry interval/failure backoff, preserve a matching cached result during outages, replace the same ledger entry after recovery, and stop retrying after coverage becomes complete.
- Both regression cases failed before the fix and passed afterwards. Additional planning coverage verifies manual difficulty bands, review floor and cached plan stability when the displayed estimate changes.
- Final 21-group unit suite passed: `output/v41-verification-1789558129046`. Combined suites now contain 21 tests and the training suite contains 12. Production build passed with the existing non-fatal chunk warning. Native UI QA: `output/playwright/combined-1789558106250`, including manual 1500 under combined display, estimate push/restart persistence, automatic-mode restoration, and byte-identical official cache.
- These fixes do not remove the documented live-new-contest timing and estimation-accuracy limitations. No installation, release or remote write is included.

## Retired virtual-only display mode (2026-09-16)

- Removed the third selector option and the renderer's old virtual-only polling. The AI context also uses the combined view without computing the retired trajectory. Internal legacy calculation modules remain for historical compatibility/tests, not as a selectable mode.
- Updated training source descriptions and added native selector assertions (exactly `official`, `combined`) plus a restart fixture with the old persisted `estimated` value. The migrated selection activates combined calculation; lack of a new result falls back to official, not to the retired estimate.
- Unit gate: all 21 groups passed at `output/v41-verification-1789558913907`. Build passed. Native QA passed at `output/playwright/combined-1789558957663` and migration QA at `output/playwright/dual-rating-1789558966492`. Official fixture cache unchanged; no page errors.
