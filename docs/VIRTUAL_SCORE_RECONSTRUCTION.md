# Virtual score reconstruction — v4.1.1

The previous candidate hid estimates because public `contest.standings` returns
only official rows. This change restores an **on-demand**, unofficial estimate;
opening problems/upsolving never waits for it. No AI or paid API is involved.

## Data flow and boundaries

1. Fetch standings with exactly `contestId`, plus the original rating changes.
2. Fetch `contest.status` for the selected handle, with complete pagination.
   Reject overlapping pages and the 10,000-submission safety cap instead of
   silently estimating from a truncated timeline/cache.
3. Select the exact VIRTUAL session identity, contest, handle and time window.
   Exclude practice, other virtual attempts and post-contest submissions.
4. Validate supported scoring models against finished official problem results:
   ICPC 10/20-minute wrong-attempt penalties; CF original points, minute decay,
   standard/duration-normalized decay, 50-point penalties and 30% floor.
   A model mismatch or ambiguity affecting the target result refuses estimation.
5. Insert into the Rated cohort, excluding the handle's own original official
   participation, using existing Carrot tie handling and target-only performance
   calculation. The tie placement is Carrot's reference placement, not official rank.
   For reconstructed scores, the cohort is the intersection of currently visible
   official standings and historical Rating records. Missing historical rows are
   excluded, never assigned fabricated scores. The result and UI disclose matched
   and historical Rated counts when coverage is incomplete.

The estimate remains in `virtualReference`, never `performance`, `officialRank`
or `ratingDelta`. Overall statistics still use only Rated official sessions.
Account/submission-cache changes while computing reject stale persistence.
Successful estimates survive offline refresh errors; errors remain visible.

## Known limits

- Final verdicts cannot reliably recover pretest history after CF accepted-code
  resubmissions. Ambiguous sessions are explicitly unsupported, not silently
  scored from the earliest accepted submission.
- Pending, skipped, challenged or unknown verdicts are not guessed. IOI/custom
  scoring and nonstandard CF ranking penalties are unsupported.
- Practice before the session changes the meaning of performance; it is warned
  about, not corrected by an invented discount.
- Fresh submission results may be newer than cached replay details. Sync the
  account to update the problem/timeline view after a rejudge.
- These are hypothetical performances against the original Rated field. They
  do not reproduce historical competitive conditions or an official virtual rank.
- Source verification does not replace packaged release gates. Publish only after
  native platform checks and verify freshly downloaded release packages afterward.

## Verification

Synthetic cases cover CF/ICPC reconstruction, identity/time isolation, compilation
errors, scoring ambiguity, invalid data, offline failure, pagination, account
switches, direct-row vs reconstructed Carrot equality, and overall-stat invariance.
Electron tests exercise manual calculation, persistence/cold start, offline
retention and independent problem access. Titlebar tests cover three palettes and
three opacity levels, with maximize/restore and keyboard focus retained.

Live check on 2026-09-08: Round 1118 (contest 2258), 8,620 official rows and
19,793 positive problem results matched the supported CF scoring model. Rule
validation alone took about 10 ms in this run; this is not a prediction-accuracy
claim and does not include network or full Carrot computation.
The same round has 12,494 historical Rating records, so a full historical replay
cannot be reconstructed from the current public standings. Estimates against the
visible Rated intersection must not be presented as exact historical performances.
An actual locally indexed virtual session from this round completed reconstruction
and Carrot calculation in about 38 ms, excluding network time. The live check was
read-only and did not save an estimate into the user's profile.

Sources: [Codeforces API methods](https://codeforces.com/apiHelp/methods),
[API objects](https://codeforces.com/apiHelp/objects),
[official contest rules](https://codeforces.com/blog/entry/4088?locale=en).
Contest-specific modifications are why actual scoreboard validation is required.
