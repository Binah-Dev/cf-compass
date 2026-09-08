const { makeReferenceFixture } = require('./virtual-reference.cjs');
const { submission } = require('./contest-sessions.cjs');
function makeScoreFixture(type = 'ICPC') {
  const f = makeReferenceFixture();
  f.standings.contest.type = type;
  f.standings.problems = f.standings.problems.slice(0, 2).map((p, i) => ({ ...p, points: 500 * (i + 1) }));
  f.standings.rows = f.standings.rows.slice(0, 3);
  f.standings.rows.forEach((row, i) => {
    row.problemResults = f.standings.problems.map((p, j) => ({ type: 'FINAL', points: type === 'ICPC' ? 1 : p.points - p.points / 250 * (i + 1) * 10,
      rejectedAttemptCount: 0, bestSubmissionTimeSeconds: (i + 1) * 600 }));
    row.points = row.problemResults.reduce((sum, p) => sum + p.points, 0);
    row.penalty = type === 'ICPC' ? 20 * (i + 1) : 0;
  });
  // An incorrect attempt disambiguates ICPC's 10/20-minute penalty.
  if (type === 'ICPC') {
    f.standings.rows[2].problemResults[0].rejectedAttemptCount = 1;
    f.standings.rows[2].penalty += 10;
  }
  f.cache.virtualSubmissionsComplete = true;
  const start = f.entry.sessionStartTimeSeconds;
  f.cache.submissions = [submission(20, 'VIRTUAL', start, 60, 'COMPILATION_ERROR'),
    submission(21, 'VIRTUAL', start, 120, 'WRONG_ANSWER'), submission(22, 'VIRTUAL', start, 600, 'OK'),
    submission(23, 'VIRTUAL', start, 1200, 'OK', 'B'), submission(24, 'PRACTICE', start, 10, 'OK', 'B')];
  return f;
}
module.exports = { makeScoreFixture };
