import { useEffect, useMemo, useState } from "react";
import { useI18n, translateText } from "../i18n";
import { displayTag, normalizeTag, ratingTone } from "../lib/stats";
import { RatingScore } from "./RatingDisplay";
import { getTrainingProfile, normalizeTrainingProfile, resolveTrainingRating } from "../../electron/shared/training-profile.mjs";
import "./training-preferences.css";

export default function TrainingPreferences({ user, studyData, problems, sessions, loading, loadError, onReload, onSave }) {
  const { locale } = useI18n();
  const en = locale === "en-US";
  const text = (zh, english) => en ? english : zh;
  const saved = getTrainingProfile(user, studyData);
  const savedKey = JSON.stringify(saved);
  const [draft, setDraft] = useState(saved);
  const settingsKey = JSON.stringify({ reviewLimit: studyData.settings?.reviewLimit ?? 8, reviewRatingGap: studyData.settings?.reviewRatingGap ?? 0, recommendationTierCounts: studyData.settings?.recommendationTierCounts ?? { consolidate: 2, steady: 3, challenge: 2 } });
  const [settingsDraft, setSettingsDraft] = useState(JSON.parse(settingsKey));
  useEffect(() => { setSettingsDraft(JSON.parse(settingsKey)); }, [settingsKey, user.handle]);
  const patchSettings = (values) => { setSettingsDraft(current => ({ ...current, ...values })); setMessage(""); };
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerLimit, setLedgerLimit] = useState(50);
  useEffect(() => { setDraft(JSON.parse(savedKey)); }, [savedKey, user.handle]);
  const tags = useMemo(() => [...new Set([...problems.flatMap((problem) => (problem.tags || []).map(normalizeTag)), ...saved.weakTags])].sort(), [problems, savedKey]);
  const patch = (values) => { setDraft((current) => ({ ...current, ...values })); setMessage(""); };
  const toggle = (key, value) => patch({ [key]: draft[key].includes(value) ? draft[key].filter((item) => item !== value) : [...draft[key], value] });
  const rating = resolveTrainingRating(user, studyData);
  const invalidRating = draft.ratingMode === "manual" && (!Number.isInteger(Number(draft.manualRating)) || Number(draft.manualRating) < 800 || Number(draft.manualRating) > 3500);
  async function save(reset = false) {
    setBusy(true);
    setMessage("");
    try {
      const result = await onSave(reset ? null : normalizeTrainingProfile(draft), reset ? null : settingsDraft);
      setMessage(result ? text("已保存，推荐已更新", "Saved. Recommendations updated.") : text("保存失败，请重试", "Save failed. Please retry."));
      if (result) setDraft(getTrainingProfile(user, result));
    } catch {
      setMessage(text("保存失败，请重试", "Save failed. Please retry."));
    } finally { setBusy(false); }
  }
  return <details className="training-preferences feature-card" data-i18n-preserve>
    <summary>{text("训练偏好", "Training preferences")} · {text("训练参考 Rating", "Training Rating")} <strong data-testid="training-rating"><RatingScore value={rating.rating}>{rating.rating}</RatingScore></strong>
      <span>{text("仅影响训练推荐，官方 Rating 不变", "Training only; official Rating is unchanged")}</span>
    </summary>
    <div className="training-preferences__body">
      <p data-testid="rating-source">{text("当前来源：", "Current source: ")}{({ combined: text("正式赛与虚拟赛累计估计", "Combined official and virtual estimate"), 'combined-pending': text("估计待计算，暂用基础分", "Estimate pending; temporary baseline"), estimated: text("正式赛与虚拟赛累计估计", "Combined official and virtual estimate"), manual: text("手动设定", "Manual"), official: text("官方 Rating", "Official Rating"), fallback: text("暂无官方分，默认 1200", "No official Rating; default 1200") })[rating.source]}</p>
      {user.ratingMode === "estimated" && <p>{text("自动模式跟随主页估算 Rating；选择手动后，训练始终使用手动分，不改变主页评分。", "Automatic mode follows the home estimate. Manual training always uses your chosen rating without changing the home display.")}</p>}
      <fieldset disabled={busy || loading}>
        <legend>{text("训练难度", "Training difficulty")}</legend>
        <label>{text("参考分模式", "Rating mode")}
          <select aria-label={text("参考分模式", "Rating mode")} value={draft.ratingMode} onChange={(event) => patch({ ratingMode: event.target.value })}>
            <option value="auto">{text("自动计算", "Automatic")}</option><option value="manual">{text("手动设定", "Manual")}</option>
            <option value="combined">{text("正式赛 + 虚拟赛（Carrot 估计）", "Official + virtual (Carrot estimate)")}</option>
          </select>
        </label>
        {draft.ratingMode === "manual" ? <label>{text("手动训练 Rating（800–3500）", "Manual training Rating (800–3500)")}
          <input aria-label="Manual training Rating" type="number" min="800" max="3500" step="1" value={draft.manualRating}
            style={{ color: `var(--cf-rating-${invalidRating ? "muted" : ratingTone(draft.manualRating)})` }}
            onChange={(event) => patch({ manualRating: event.target.value })} />
        </label> : draft.ratingMode === 'auto' ? <p>{text("自动跟随主页：官方 Rating，或正式赛与虚拟赛共同累计的估计分。", "Follows the home mode: official Rating or the combined official and virtual estimate.")}</p> : null}
      </fieldset>
      {draft.ratingMode === 'combined' && <section data-testid="combined-estimate">
        <p>{text("按实际参赛时间累计正式赛与虚拟赛，每场使用上一场估计分计算涨跌。无需题目难度；未结算时采用选手当前评分快照，属于临时估计，不是官方分。", "Official and virtual sessions share one chronological Carrot trajectory. No problem ratings required. Before settlement, current opponent profiles are a provisional proxy, not official ratings.")}</p>
        <p>{text("起点为首场之前的已知官方分；无历史则以 1400 模拟，不套用新账号奖励。开启后自动发现最近提交并在赛后触发；网络、最终榜单或完整提交不足时明确等待。", "Starts from a known official rating before the first session, otherwise 1400; no new-account bonuses. Recent submissions are checked automatically. Missing final standings, submissions or network access remain pending.")}</p>
        <p data-testid="combined-status">{text("已计入", "Counted")}: {user.trainingEstimate?.counted || 0}/{user.trainingEstimate?.total || 0} · {user.trainingEstimate?.status === 'ready' ? text('已计算', 'Calculated') : text('暂定／等待数据', 'Provisional / awaiting data')}</p>
        {user.trainingEstimate?.pending > 0 && <p role="status">{text(`还有 ${user.trainingEstimate.pending} 场未计入。当前分数仅基于已有证据，不是完整累计结果；补齐后会重算后续场次并更新推荐。`, `${user.trainingEstimate.pending} sessions are missing. This is a partial trajectory; later results and recommendations will be recalculated when evidence arrives.`)}</p>}
        {user.trainingEstimate?.provisionalCount > 0 && <p>{text(`其中 ${user.trainingEstimate.provisionalCount} 场使用暂估数据；对手赛前分、计分资格和新人内部计算分未全部核实。`, `${user.trainingEstimate.provisionalCount} sessions use provisional evidence; pre-contest ratings, eligibility and newcomer effective ratings are not fully verified.`)}</p>}
        {rating.source === 'combined-pending' && <p>{text('暂无可用估计，当前推荐暂用官方分；无官方分才使用 1200。不是已完成的估算。', 'No estimate yet: recommendations temporarily use official Rating, or 1200 if unavailable. This is not a completed estimate.')}</p>}
        {user.trainingEstimate?.discoveryError && <p role="alert">{user.trainingEstimate.discoveryError}</p>}
        <button className="ghost-button" type="button" disabled={busy || saved.ratingMode !== 'combined'} onClick={async () => {
          setBusy(true);
          try { await window.cfBridge?.getCombinedRating?.(true); setMessage(text('已请求重算，账本会自动刷新。', 'Recalculation requested; the ledger refreshes automatically.')); }
          catch (error) { setMessage(error.message); }
          finally { setBusy(false); }
        }}>{text('重新估算全部场次', 'Recalculate all sessions')}</button>
        <details onToggle={event => setLedgerOpen(event.currentTarget.open)}><summary>{text('统一估分账本', 'Combined rating ledger')}</summary>
          {(ledgerOpen ? (user.trainingEstimate?.entries || []).slice(0, ledgerLimit) : []).map(entry => <p key={entry.id}>
            {entry.contestName || entry.contestId} · {entry.participationType === 'VIRTUAL' ? text('虚拟', 'Virtual') : text('正式', 'Official')} · {entry.startTimeSeconds ? new Date(entry.startTimeSeconds * 1000).toLocaleString(locale) : text('时间待确认', 'Time pending')} · {entry.status === 'counted' ? `${entry.oldRating} → ${entry.newRating} (${entry.delta >= 0 ? '+' : ''}${entry.delta})` : entry.error || text('等待', 'Pending')} {Number.isFinite(entry.performance) ? ` · Carrot ${entry.performance >= 6000 ? '≥6000' : entry.performance}` : ''} {entry.provisional ? text('（临时估计）', '(provisional)') : ''}
            {entry.practicedBefore && <small>{text('含提前做过的题，非盲打表现。', 'Includes previously practiced problems; not a blind attempt.')}</small>}
            {entry.missingRatedCount > 0 && <small>{text(`对照榜单仅匹配 ${entry.matchedRatedCount} 人，缺少 ${entry.missingRatedCount} 人；排名与估分可能偏差。`, `Comparison field matches ${entry.matchedRatedCount} participants; ${entry.missingRatedCount} are missing. Rank and estimate may be biased.`)}</small>}
            {entry.refreshError && <small>{text('刷新失败，保留上次结果：', 'Refresh failed; retaining previous result: ')}{entry.refreshError}</small>}
          </p>)}
          {ledgerOpen && ledgerLimit < (user.trainingEstimate?.entries?.length || 0) && <button type="button" onClick={() => setLedgerLimit(limit => limit + 50)}>{text('显示更多场次', 'Show more sessions')}</button>}
        </details>
      </section>}
      <fieldset disabled={busy || loading}>
        <legend>{text("弱项标签", "Weak tags")}</legend>
        <label>{text("弱项模式", "Weak-tag mode")}<select aria-label={text("弱项模式", "Weak-tag mode")} value={draft.weakTagsMode} onChange={(event) => patch({ weakTagsMode: event.target.value })}>
          <option value="auto">{text("自动分析", "Automatic")}</option><option value="manual">{text("手动选择", "Manual selection")}</option>
        </select></label>
        {draft.weakTagsMode === "manual" && <>
          <p>{text("所选标签替代自动弱项画像，应用于专项筛选与综合推荐的弱项加分；不修改实际掌握度。未选标签时不生成专项题单。", "Selected tags replace automatic weak-tag targeting for focused practice and the weak-tag bonus in mixed recommendations. Measured mastery is unchanged. An empty selection disables focused recommendations.")}</p>
          <div className="training-preferences__tags">{tags.map((tag) => <label className="training-preferences__check" key={tag}>
            <input type="checkbox" aria-label={`tag:${tag}`} checked={draft.weakTags.includes(tag)} onChange={() => toggle("weakTags", tag)} />{translateText(displayTag(tag), locale)}
          </label>)}</div>
        </>}
      </fieldset>
      {loading && <p>{text("正在读取本地虚拟赛记录…", "Loading local virtual sessions…")}</p>}
      {loadError && <p role="alert">{text("虚拟赛记录读取失败，当前按官方分或手动分生成；可重试读取。", "Virtual sessions could not be loaded. Using official or manual Rating; retry to load sessions.")} <button type="button" onClick={onReload}>{text("重试读取", "Retry loading")}</button></p>}
      {invalidRating && <p role="alert">{text("请输入 800–3500 之间的整数", "Enter an integer from 800 to 3500")}</p>}
      <fieldset disabled={busy || loading}>
        <legend>{text("题量与复习范围", "Workload and review range")}</legend>
        <p>{text("以下设置由本机各账号共用，点击保存后生效。", "These settings are shared across local accounts and apply after saving.")}</p>
        <label>{text("每日复习上限", "Daily review limit")}<select aria-label={text("每日复习上限", "Daily review limit")} value={settingsDraft.reviewLimit} onChange={event => patchSettings({ reviewLimit: Number(event.target.value) })}>
          {[5, 8, 12, 16, 20].map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label>{text("复习 Rating 范围", "Review Rating range")}<select aria-label={text("复习 Rating 范围", "Review Rating range")} value={settingsDraft.reviewRatingGap} onChange={event => patchSettings({ reviewRatingGap: Number(event.target.value) })}>
          <option value="0">{text("智能调整（推荐）", "Automatic (recommended)")}</option>
          {[300, 400, 500, 600].map(value => <option key={value} value={value}>{text("训练参考 Rating", "Training Rating")} - {value}</option>)}
        </select></label>
        <small>{text("控制复习题的难度下限，不是上下对称的波动范围。", "Sets the minimum review difficulty, not a symmetric Rating interval.")}</small>
        {[["consolidate", "巩固", "Consolidation"], ["steady", "同段", "At-level"], ["challenge", "挑战", "Challenge"]].map(([id, zh, english]) => <label key={id}>{text(zh + "题量", english + " count")}<select aria-label={text(zh + "题量", english + " count")} value={settingsDraft.recommendationTierCounts[id]} onChange={event => patchSettings({ recommendationTierCounts: { ...settingsDraft.recommendationTierCounts, [id]: Number(event.target.value) } })}>
          {[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>)}
      </fieldset>
      <div className="training-preferences__actions">
        <button className="primary-button" type="button" disabled={busy || loading || invalidRating || !user.handle} onClick={() => save()}>{text("保存训练偏好", "Save training preferences")}</button>
        <button className="ghost-button" type="button" disabled={busy || loading || !user.handle} onClick={() => save(true)}>{text("恢复默认计算", "Restore automatic defaults")}</button>
        <span role="status">{message}</span>
      </div>
      <small>{text("偏好按账号保存在本机。恢复默认仅清除此账号的训练偏好，保留笔记、复习记录和官方数据。", "Preferences are stored locally per account. Restore clears only this account's training preferences, preserving notes, reviews and official data.")}</small>
    </div>
  </details>;
}
