const start = 1700000000;
const virtualOne = start + 100000;
const virtualTwo = start + 200000;
const makeProblem = (contestId, index, name = `Fixture ${contestId}${index}`) => ({
  contestId, index, name, rating: index === "A" ? 1000 : 1400, tags: ["implementation"], type: "PROGRAMMING",
});
const problems = ["A", "B", "C", "D"].map((index) => makeProblem(1900, index));
const unseen = [makeProblem(1901, "A", "Queue survives without a rating record"), makeProblem(1901, "B", "Persistent local snapshot")];
function submission(id, type, sessionStart, relative, verdict, index = "A", contestId = 1900) {
  return {
    id, contestId, creationTimeSeconds: sessionStart + relative, relativeTimeSeconds: relative,
    author: { participantType: type, startTimeSeconds: sessionStart, members: [{ handle: "issue25_fixture" }] },
    verdict, problem: makeProblem(contestId, index), programmingLanguage: "GNU C++20",
  };
}
function makeFixture() {
  const submissions = [
    submission(1, "CONTESTANT", start, 300, "OK"),
    submission(2, "VIRTUAL", virtualOne, 0, "WRONG_ANSWER"),
    submission(3, "VIRTUAL", virtualOne, 120, "OK"),
    submission(4, "VIRTUAL", virtualOne, 900, "OK"),
    submission(5, "VIRTUAL", virtualOne, 2000, "WRONG_ANSWER", "B"),
    submission(6, "PRACTICE", virtualOne, 400, "OK", "B"),
    submission(7, "VIRTUAL", virtualTwo, 300, "WRONG_ANSWER", "C"),
    submission(8, "VIRTUAL", virtualTwo, 400, "TESTING", "C"),
    submission(9, "VIRTUAL", virtualOne, 8000, "OK", "D"),
  ].reverse();
  const contests = [1900, 1901].map((id) => ({
    id, name: id === 1900 ? "Session isolation (Div. 2)" : "Never participated (Div. 3)",
    startTimeSeconds: start - (id === 1901 ? 86400 : 0), durationSeconds: 7200,
    phase: "FINISHED", phaseGroup: "finished", type: "CF", isRated: true,
    category: { primary: "div2", divisions: [2], special: null, label: "Div.2" },
  }));
  return {
    cache: { version: 2, handle: "issue25_fixture", user: { handle: "issue25_fixture", rating: 1500, maxRating: 1500, rank: "specialist" },
      problems, submissions, ratingHistory: [], isDemo: false,
      syncedAt: new Date().toISOString(), problemsetSyncedAt: new Date().toISOString() },
    center: { version: 1, syncedAt: new Date().toISOString(), contests,
      details: { 1900: { contestId: 1900, problems, participantCount: 1234 }, 1901: { contestId: 1901, problems: unseen, participantCount: 2345 } } },
    study: { version: 1, notes: {}, reviews: {}, aiReviews: {}, contestQueue: [], contestQueueProblems: {},
      settings: { language: "zh-CN", themeVersion: 7, wallpaperEnabled: false, reduceMotion: true, autoSync: false, autoBackup: false } },
  };
}
module.exports = { start, virtualOne, virtualTwo, makeFixture, submission, makeProblem };

