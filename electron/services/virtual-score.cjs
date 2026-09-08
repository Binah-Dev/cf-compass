const { isSessionSubmission } = require('./contest-session.cjs');
const ignored = new Set(['COMPILATION_ERROR', 'DENIAL_OF_JUDGEMENT']);
const rejected = new Set(['WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'IDLENESS_LIMIT_EXCEEDED', 'PRESENTATION_ERROR', 'CRASHED']);
function unavailable(message) { const error = Error(message); error.code = 'VIRTUAL_SCORE_UNAVAILABLE'; throw error; }
const minute = seconds => Math.floor(seconds / 60);
function cfPoints(maximum, seconds, wrong, duration, normalized) {
  return Math.max(.3 * maximum, maximum - Math.floor(maximum * minute(seconds) / 250 * (normalized ? 7200 / duration : 1) + 1e-9) - 50 * wrong);
}

// Infer only supported scoring rules, and require them to reproduce the actual
// finished scoreboard. Contest names/divisions are not scoring specifications.
function scoringModels(standings) {
  const { contest, problems } = standings;
  let models = contest.type === 'ICPC' ? [10, 20] : ['standard', 'duration-normalized'];
  let evidence = 0;
  for (const row of standings.rows || []) {
    if (row.party?.participantType !== 'CONTESTANT') continue;
    if (!Array.isArray(row.problemResults) || row.problemResults.length !== problems.length ||
        row.problemResults.some(r => r.type !== 'FINAL')) unavailable('原比赛最终榜单不完整，请稍后重试');
    const solved = row.problemResults.filter(r => r.points > 0);
    for (const r of solved) {
      if (!Number.isInteger(r.bestSubmissionTimeSeconds) || r.bestSubmissionTimeSeconds < 0 ||
          !Number.isInteger(r.rejectedAttemptCount) || r.rejectedAttemptCount < 0) unavailable('榜单缺少计分规则校验数据');
    }
    if (contest.type === 'ICPC') {
      if (solved.some(r => r.points !== 1) || row.points !== solved.length) unavailable('该 ICPC 场次使用特殊分值，暂不估分');
      models = models.filter(p => row.penalty === solved.reduce((sum, r) => sum + minute(r.bestSubmissionTimeSeconds) + p * r.rejectedAttemptCount, 0));
      evidence += solved.length;
    } else {
      if (row.penalty !== 0) unavailable('该 CF 场次使用特殊排名罚时，暂不估分');
      row.problemResults.forEach((r, i) => {
        if (!(r.points > 0)) return;
        const maximum = problems[i].points;
        if (!Number.isFinite(maximum) || maximum <= 0) unavailable('题目缺少原始分值，无法重建 CF 成绩');
        models = models.filter(m => Math.abs(cfPoints(maximum, r.bestSubmissionTimeSeconds, r.rejectedAttemptCount, contest.durationSeconds, m === 'duration-normalized') - r.points) < 1e-7);
        evidence++;
      });
    }
    if (!models.length) unavailable('原比赛计分规则与支持的模型不一致，暂不估分');
  }
  if (evidence < 2) unavailable('榜单中可校验的成绩不足，暂不估分');
  return { models, evidence };
}

function reconstructVirtualScore({ entry, cache, standings }) {
  if (cache.virtualSubmissionsComplete !== true) unavailable('缺少完整的本场提交，请重新计算参考分');
  const { contest, problems } = standings;
  if (!Array.isArray(problems) || !problems.length || !['CF', 'ICPC'].includes(contest.type)) unavailable('该场次暂不支持本地计分');
  const session = { ...entry, durationSeconds: contest.durationSeconds };
  const handle = String(cache.handle || '').toLowerCase();
  const attempts = (cache.submissions || []).filter(s => isSessionSubmission(s, session));
  if (!attempts.length) unavailable('没有找到这次虚拟赛的场内提交');
  const indices = new Set(problems.map(p => p.index));
  const ids = new Set();
  for (const s of attempts) {
    if (s.author?.members?.length !== 1 || s.author.ghost || s.author.teamId ||
        String(s.author.members[0].handle).toLowerCase() !== handle || !indices.has(s.problem?.index) ||
        !Number.isSafeInteger(s.id) || ids.has(s.id)) unavailable('本场提交身份或题目数据不完整');
    ids.add(s.id);
    const seconds = s.relativeTimeSeconds ?? (s.creationTimeSeconds - entry.sessionStartTimeSeconds);
    if (!Number.isInteger(seconds) || seconds >= contest.durationSeconds ||
        s.creationTimeSeconds !== Number(entry.sessionStartTimeSeconds) + seconds) unavailable('提交时间处于场次边界或不一致，暂不估分');
    if (s.verdict !== 'OK' && !ignored.has(s.verdict) && !rejected.has(s.verdict)) unavailable('存在未完成判题或无法还原的提交，请同步后重试');
  }
  const { models, evidence } = scoringModels(standings);
  const results = models.map(model => {
    let points = 0, penalty = 0;
    const problemResults = problems.map(problem => {
      const list = attempts.filter(s => s.problem.index === problem.index).sort((a, b) => a.creationTimeSeconds - b.creationTimeSeconds || a.id - b.id);
      const accepted = list.findIndex(s => s.verdict === 'OK');
      if (accepted < 0) return { type: 'FINAL', points: 0 };
      // CF resubmissions can replace a pretest-passing solution. Final verdicts
      // alone cannot establish that history; do not silently choose earliest AC.
      if (contest.type === 'CF' && list.slice(accepted + 1).some(s => !ignored.has(s.verdict))) unavailable('CF 题目通过后有重复提交，无法可靠还原预评测历史');
      const seconds = list[accepted].creationTimeSeconds - entry.sessionStartTimeSeconds;
      const wrong = list.slice(0, accepted).filter(s => rejected.has(s.verdict)).length;
      if (contest.type === 'CF' && !(Number.isFinite(problem.points) && problem.points > 0)) unavailable('题目缺少原始分值，无法重建 CF 成绩');
      const value = contest.type === 'ICPC' ? 1 : cfPoints(problem.points, seconds, wrong, contest.durationSeconds, model === 'duration-normalized');
      points += value;
      penalty += contest.type === 'ICPC' ? minute(seconds) + model * wrong : 0;
      return { type: 'FINAL', points: value, bestSubmissionTimeSeconds: seconds, rejectedAttemptCount: wrong };
    });
    return { points, penalty, problemResults, model };
  });
  if (results.some(r => r.points !== results[0].points || r.penalty !== results[0].penalty)) unavailable('计分规则有多种解释且会影响本场成绩，暂不估分');
  return { ...results[0], scoreSource: 'reconstructed-submissions', scoringModel: `${contest.type}:${models.join('/')}`,
    scoringEvidence: evidence, submissionCount: attempts.length };
}

async function loadVirtualSubmissions(fetchCodeforces, contestId, handle) {
  const submissions = [], ids = new Set();
  const pageSize = 1000;
  for (let from = 1; from <= 10000; from += pageSize) {
    const page = await fetchCodeforces(`contest.status?contestId=${contestId}&handle=${encodeURIComponent(handle)}&from=${from}&count=${pageSize}`);
    if (!Array.isArray(page)) unavailable('本场提交接口返回了无效数据');
    for (const s of page) {
      if (!Number.isSafeInteger(s.id) || ids.has(s.id)) unavailable('提交分页发生变化，请稍后重试');
      ids.add(s.id); submissions.push(s);
    }
    if (page.length < pageSize) return submissions;
  }
  unavailable('本场提交数量超出安全读取范围，未使用截断数据估分');
}
module.exports = { reconstructVirtualScore, scoringModels, cfPoints, loadVirtualSubmissions };
