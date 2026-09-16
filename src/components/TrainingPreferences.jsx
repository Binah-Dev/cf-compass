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
      <p data-testid="rating-source">{text("当前来源：", "Current source: ")}{({ estimated: text("累计虚拟赛估算", "Cumulative virtual estimate"), manual: text("手动设定", "Manual"), official: text("官方 Rating", "Official Rating"), fallback: text("暂无官方分，默认 1200", "No official Rating; default 1200") })[rating.source]}</p>
      {user.ratingMode === "estimated" && <p>{text("当前跟随主页估算 Rating；手动训练分在官方模式下生效。", "Following the estimated Rating; manual training overrides apply only in official mode.")}</p>}
      <fieldset disabled={busy || loading || user.ratingMode === "estimated"}>
        <legend>{text("训练难度", "Training difficulty")}</legend>
        <label>{text("参考分模式", "Rating mode")}
          <select aria-label={text("参考分模式", "Rating mode")} value={draft.ratingMode} onChange={(event) => patch({ ratingMode: event.target.value })}>
            <option value="auto">{text("自动计算", "Automatic")}</option><option value="manual">{text("手动设定", "Manual")}</option>
          </select>
        </label>
        {draft.ratingMode === "manual" ? <label>{text("手动训练 Rating（800–3500）", "Manual training Rating (800–3500)")}
          <input aria-label="Manual training Rating" type="number" min="800" max="3500" step="1" value={draft.manualRating}
            style={{ color: `var(--cf-rating-${invalidRating ? "muted" : ratingTone(draft.manualRating)})` }}
            onChange={(event) => patch({ manualRating: event.target.value })} />
        </label> : <p>{text("自动使用主页当前评分模式；虚拟赛估算会累计全部有官方 Rating 对照的场次，不再手动挑选取均值。", "Uses the home page Rating mode. Virtual estimates accumulate all sessions with official rated comparison data, not a selected average.")}</p>}
      </fieldset>
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
