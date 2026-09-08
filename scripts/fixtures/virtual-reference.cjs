const { makeFixture, virtualTwo } = require("./contest-sessions.cjs");
function makeReferenceFixture() {
  const fixture = makeFixture();
  const handle = fixture.cache.handle;
  const row = (handle, points, penalty, type = "CONTESTANT", start = fixture.center.contests[0].startTimeSeconds) => ({
    party: { participantType: type, members: [{ handle }], startTimeSeconds: start },
    points, penalty, problemResults: fixture.cache.problems.map(() => ({ type: "FINAL", points: 0 })),
  });
  return {
    ...fixture,
    entry: { contestId: 1900, replayId: `1900:virtual:${virtualTwo}`, participationType: "VIRTUAL",
      rated: false, sessionStartTimeSeconds: virtualTwo, submissionFingerprint: "fixture-fingerprint", problems: [] },
    standings: { contest: fixture.center.contests[0], problems: fixture.cache.problems, rows: [
      row("top", 2000, 0), row("middle", 1000, 0), row("lower", 400, 0),
      row(handle, 1100, 0, "VIRTUAL", virtualTwo),
    ] },
    ratingChanges: [
      { contestId: 1900, handle: "top", oldRating: 2200 },
      { contestId: 1900, handle: "middle", oldRating: 1600 },
      { contestId: 1900, handle: "lower", oldRating: 1000 },
    ],
  };
}
module.exports = { makeReferenceFixture };

