const PUBLIC_STANDINGS_ONLY = 'PUBLIC_STANDINGS_ONLY';
const PUBLIC_STANDINGS_MESSAGE = 'Codeforces 当前公开接口仅提供正式榜单，无法取得这次虚拟赛的官方成绩。复盘与补题仍可正常使用，参考分暂不可用。';
function publicStandingsEndpoint(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw Error('比赛编号无效');
  // Regular contests now accept exactly one parameter and anonymous GET only.
  return `contest.standings?contestId=${id}`;
}
function recoverStandingsFailure(entry) {
  if (entry.standingsCompatibilityVersion === 1) return;
  const obsolete = message => String(message || '').includes('Non-gym contest standings');
  if (entry.status === 'error' && obsolete(entry.error)) {
    entry.status = 'pending'; entry.error = null; entry.retryCount = 0;
    entry.standingsCompatibilityVersion = 1;
  }
  if (entry.virtualReference?.status === 'unavailable' && obsolete(entry.virtualReference.error)) {
    entry.virtualReference = null;
    entry.standingsCompatibilityVersion = 1;
  }
}
module.exports = { publicStandingsEndpoint, recoverStandingsFailure, PUBLIC_STANDINGS_ONLY, PUBLIC_STANDINGS_MESSAGE };
