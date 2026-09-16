import { useState } from 'react';
import { useI18n } from '../i18n';
import { RatingScore } from './RatingDisplay';
export default function RatingModeControl({mode,officialRating,estimate,onChange,onRetry,error}) {
 const {locale}=useI18n(); const en=locale==='en-US'; const t=(zh,enText)=>en?enText:zh;
 const [busy,setBusy]=useState(false);
 const [ledgerOpen,setLedgerOpen]=useState(false);
 const [visibleCount,setVisibleCount]=useState(50);
 async function change(value){setBusy(true);try{await onChange(value);}finally{setBusy(false);}}
 return <section className="rating-mode-control" data-i18n-preserve>
  <label>Rating <select aria-label={t('个人评分模式','Personal Rating mode')} value={mode} disabled={busy} onChange={event=>change(event.target.value)}>
   <option value="official">{t('官方 Rating','Official Rating')}</option><option value="estimated">{t('估算 Rating','Estimated Rating')}</option>
  </select></label>
  {mode==='estimated' && !Number.isFinite(estimate?.rating) && <small>{t('暂无可用估分，暂时显示官方数据。','No estimate yet; showing official data temporarily.')}</small>}
  {error && <small role="alert">{error}</small>}
  <details onToggle={event=>setLedgerOpen(event.currentTarget.open)}><summary>{t('估分详情','Estimate details')} · {estimate?.counted || 0} {t('场','sessions')}{mode==='estimated' && estimate?.status!=='ready' ? t(' · 暂定',' · provisional') : ''}</summary>
   <small>{t('官方','Official')}: <RatingScore value={officialRating}/> · {t('估算','Estimated')}: {Number.isFinite(estimate?.rating)?<RatingScore value={estimate.rating}/>:t('待计算','Pending')}</small>
   <small>{t('计入','Counted')} {estimate?.counted || 0}/{(estimate?.total || 0)-(estimate?.excluded || 0)} · {t('无 Rated 对照','No Rated field')} {estimate?.excluded || 0}</small>
   <button type="button" onClick={onRetry}>{t('重新估分','Recalculate')}</button>
   <p>{t('仅累计原比赛有官方 Rated 结算对照的虚拟赛；Gym、Mashup、Unrated 或无对照场次不计入。按首次有效场次之前的官方分起步，无历史则以 1400 起步。逐场累计涨跌，重复参赛也计入；不冒充官方分，不套用新账号奖励。','Only virtual sessions backed by official Rated results contribute; Gym, mashup, unrated or unsupported fields do not. Starts from the official Rating before the first eligible session, or 1400. Includes repeat sessions chronologically. Not official; no new-account bonuses.')}</p>
   {(ledgerOpen ? (estimate?.entries||[]).slice(0,visibleCount) : []).map(entry=><div className="rating-ledger-entry" key={entry.id}><strong>{entry.contestName || entry.contestId}</strong><small>{new Date(entry.ratingUpdateTimeSeconds*1000).toLocaleString(locale)}</small>
    <span>{entry.status==='counted'?`${entry.oldRating} → ${entry.newRating} (${entry.delta>=0?'+':''}${entry.delta})`:entry.error || t('等待计算／参赛尚未结束','Pending / session unfinished')}</span>
    {entry.practicedBefore && <small>{t('包含提前做过的题，仍计入，非盲打表现','Previously solved problems; included, not a blind attempt')}</small>}
    {entry.missingRatedCount>0 && <small>{t('历史对照不完整，结果仅供参考','Incomplete historical field; approximate')}</small>}
   </div>)}
   {ledgerOpen && visibleCount < (estimate?.entries?.length || 0) && <button type="button" onClick={()=>setVisibleCount(count=>count+50)}>{t('显示更多场次','Show more sessions')}</button>}
  </details>
 </section>;
}
