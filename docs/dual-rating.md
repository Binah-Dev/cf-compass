# Dual Rating: local implementation and acceptance

## Rules

- `cache.json` remains the official source of user Rating and rating history. Never persist the derived view into it (including export).
- A virtual session qualifies only with valid official historical Rated comparison data. Gym, mashup, unrated and unsupported events without this evidence cannot contribute. Network failures are unavailable/retryable, not proof that a contest was unrated.
- Every distinct qualifying virtual session contributes, ordered by actual session start and stable replay ID. Repeated contests contribute separately. Prior exposure is disclosed, not silently filtered. Negative changes and extreme performances are not cherry-picked away.
- Session discovery uses synchronized submissions. A virtual participation with no visible submissions cannot be discovered through this pipeline; the ledger reports discovered sessions, not a guaranteed inventory of registrations.
- Baseline is the last official rating before the first calculable qualifying session, or a documented simulation default of 1400. Later official contests do not reset this separate virtual-only trajectory. This is NOT a reconstructed combined official-plus-virtual career.
- Each session uses Carrot-style deltas against historical rated opponents, using the previous simulated score as the participant's prior rating. New-account bonuses are not simulated. Opponent historical rating handling follows the existing estimator and is approximate for provisional accounts.
- The stored anonymized comparison field and submission fingerprint allow deterministic recalculation after missing evidence arrives. Missing sessions stay visible, and partial totals are labeled provisional. Supported numeric range is -500..5999; boundary clipping is recorded. Local cached outputs are not proof of real-world skill.
- `NO_RATED_FIELD` is explicitly excluded; unavailable data is not included until calculation succeeds. The ledger records both. No manual session selection is used for the cumulative score.

## Switching and data boundaries

Per-account `trainingProfiles[handle].displayRatingMode` selects official or estimated. The effective view switches user rating, rank name, color, peak, active-distribution comparison and history. Consumers include the top bar, progress panel, training/review targeting, contest recommendation context and analytics chart. Official contest results and problem ratings remain historical facts.

Training uses the effective estimate while estimated mode is active, with the existing 800..3500 training difficulty bounds. Manual training overrides apply only in official mode. Legacy selected-session averaging is retired. The official raw cache remains the source for synchronization and backups.

Estimated standing uses a timestamped anonymous active-user rating distribution, excluding the actual account before inserting the simulated value. It is labeled estimated/non-official. Without a distribution, show unavailable rather than reuse an official rank. Real AC counts and problemset coverage do not change.

## Verification commands

```text
node --test scripts/test-virtual-rating.cjs scripts/test-virtual-reference.cjs scripts/test-contest-sessions.cjs
node scripts/test-training-profile.mjs
node scripts/qa-dual-rating.cjs
node scripts/qa-issue-31-training.cjs
node node_modules/vite/bin/vite.js build
```

Electron QA uses an isolated profile and synthetic historical opponents. It checks cumulative sessions, mode propagation, restart persistence and byte-for-byte preservation of the official cache. This is implementation validation, not empirical calibration against real CF rating changes. Tests do not call paid APIs or migrate the installed personal profile. The release workflow runs both new QA scripts against the packaged Windows executable.

## Performance / architecture review

- One shared rating-view selector supplies both the renderer and AI context; raw official cache is never changed by the selector.
- A bounded one-result cache avoids recomputing unchanged chains; identical concurrent calculations share a promise. Evidence changes invalidate the complete chain. Sessions yield to the Electron event loop between calculations.
- Closed ledgers do not render session rows; open ledgers page in 50 entries at a time. Unchanged polling results do not replace React state.
- `node scripts/benchmark-virtual-rating.cjs`: 50 synthetic sessions with 10,000 opponents each. Initial measured cold aggregate 367.84 ms, uncached recomputation 316.02 ms, warm p50 18.49 ms / p95 28.59 ms. Outputs match exactly. These are local aggregation measurements, not network latency or prediction-accuracy evidence.
- One combined run observed a transient failure in the existing Windows atomic-write stress test; the isolated 29-test session suite passed on rerun. No truncation fallback or weakening of the persistence assertions was introduced.
