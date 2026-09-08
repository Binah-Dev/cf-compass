// Persist only display evidence, never credentials or raw provider responses.
function sanitizeReviewEvidence(value = {}) {
  const strings = ['id', 'problemKey', 'problemIndex', 'problemName', 'verdict', 'fromVerdict', 'toVerdict', 'programmingLanguage', 'kind'];
  const numbers = ['index', 'submissionId', 'relativeTimeSeconds', 'creationTimeSeconds', 'timeConsumedMillis', 'memoryConsumedBytes', 'versionIndex', 'fromSubmissionId', 'toSubmissionId', 'fromRelativeTimeSeconds', 'toRelativeTimeSeconds', 'addedLines', 'removedLines', 'changedLines'];
  let remaining = 60000;
  const clean = (item, diff) => {
    const result = {};
    for (const key of strings) if (typeof item[key] === 'string') result[key] = item[key].slice(0, 240);
    for (const key of numbers) if (item[key] === null || Number.isFinite(item[key])) result[key] = item[key];
    for (const key of ['sourceAvailable', 'sourceTruncated', 'patchTruncated', 'coarse']) if (typeof item[key] === 'boolean') result[key] = item[key];
    if (diff) {
      const patch = typeof item.patch === 'string' ? item.patch : '';
      result.patch = patch.slice(0, remaining);
      remaining -= result.patch.length;
      result.patchTruncated = Boolean(item.patchTruncated || result.patch.length < patch.length);
    }
    return result;
  };
  const list = (input, diff) => (Array.isArray(input) ? input : []).filter(x => x && typeof x === 'object').slice(0, 300).map(x => clean(x, diff));
  const sourceTimeline = list(value.sourceTimeline, false);
  const sourceDiffs = list(value.sourceDiffs, true);
  return { sourceTimeline, sourceDiffs, sourceTimelineCount: sourceTimeline.length, sourceDiffCount: sourceDiffs.length };
}
module.exports = { sanitizeReviewEvidence };
