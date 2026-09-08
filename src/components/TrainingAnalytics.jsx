import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  Send,
  TrendingUp,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildTrainingAnalytics,
  resolveAnalyticsRange,
  zoomRatingWindow,
} from "../lib/analytics";
import { getCurrentLocale } from "../i18n";
import { formatNumber } from "../lib/stats";
import { createFrameQueue } from "../lib/frame-queue";

const presets = [
  ["career", "生涯"],
  ["year", "1 年"],
  ["quarter", "3 个月"],
  ["month", "1 个月"],
  ["fortnight", "2 周"],
  ["custom", "自定义"],
];

const ratingBands = [
  [0, 1200, "灰名", "gray"],
  [1200, 1400, "绿名", "green"],
  [1400, 1600, "青名", "cyan"],
  [1600, 1900, "蓝名", "blue"],
  [1900, 2100, "紫名", "violet"],
  [2100, 2400, "橙名", "orange"],
  [2400, 4000, "红名", "red"],
];

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(timestamp) {
  return new Date(Number(timestamp) * 1000).toLocaleDateString(getCurrentLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function MetricCard({ Icon, label, value, hint, tone }) {
  return (
    <article className={`analytics-metric analytics-metric--${tone}`}>
      <span className="analytics-metric__icon"><Icon size={19} /></span>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function RatingChart({ history }) {
  const [activePoint, setActivePoint] = useState(null);
  const [viewWindow, setViewWindow] = useState([0, Math.max(0, history.length - 1)]);
  const [draggingHandle, setDraggingHandle] = useState(null);
  const chartSurfaceRef = useRef(null);
  const navigatorRef = useRef(null);
  const dragRef = useRef(null);
  const frameQueue = useRef(null);
  if (!frameQueue.current) frameQueue.current = createFrameQueue(({ type, index }) => {
    setViewWindow((current) => {
      const [start, end] = current;
      const next = type === "start" ? [Math.min(index, end - 1), end] : [start, Math.max(index, start + 1)];
      return next[0] === start && next[1] === end ? current : next;
    });
  });
  useEffect(() => {
    const cancelDrag = () => { frameQueue.current.cancel(); dragRef.current = null; setDraggingHandle(null); };
    window.addEventListener("resize", cancelDrag);
    return () => { window.removeEventListener("resize", cancelDrag); frameQueue.current.cancel(); };
  }, []);

  useEffect(() => {
    frameQueue.current.cancel(); dragRef.current = null; setDraggingHandle(null);
    setViewWindow([0, Math.max(0, history.length - 1)]);
    setActivePoint(null);
  }, [history.length, history[0]?.ratingUpdateTimeSeconds, history.at(-1)?.ratingUpdateTimeSeconds]);

  useEffect(() => {
    const chartSurface = chartSurfaceRef.current;
    if (!chartSurface || history.length <= 2) return undefined;
    const handleWheel = (event) => {
      event.preventDefault();
      const bounds = chartSurface.getBoundingClientRect();
      const anchor = bounds.width
        ? Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
        : 0.5;
      setViewWindow((current) => zoomRatingWindow(
        current,
        history.length,
        event.deltaY < 0 ? "in" : "out",
        anchor,
      ));
      setActivePoint(null);
    };
    chartSurface.addEventListener("wheel", handleWheel, { passive: false });
    return () => chartSurface.removeEventListener("wheel", handleWheel);
  }, [history.length]);

  if (!history.length) {
    return (
      <div className="analytics-empty-chart">
        <TrendingUp size={27} />
        <strong>所选时间内没有 Rated 比赛</strong>
        <span>切换到更长时间范围即可查看 Rating 轨迹。</span>
      </div>
    );
  }

  const lastIndex = history.length - 1;
  const viewStart = Math.min(viewWindow[0], lastIndex);
  const viewEnd = Math.max(viewStart, Math.min(viewWindow[1], lastIndex));
  const visibleHistory = history.slice(viewStart, viewEnd + 1);
  const width = 860;
  const height = 300;
  const plot = { left: 54, right: 46, top: 18, bottom: 48 };
  const values = visibleHistory.flatMap((item) => [Number(item.oldRating), Number(item.newRating)]).filter((value) => value > 0);
  const minimum = Math.max(0, Math.floor((Math.min(...values) - 220) / 200) * 200);
  const maximum = Math.min(4000, Math.max(minimum + 600, Math.ceil((Math.max(...values) + 260) / 200) * 200));
  const timestamps = visibleHistory.map((item) => Number(item.ratingUpdateTimeSeconds));
  const firstTimestamp = Math.min(...timestamps);
  const lastTimestamp = Math.max(...timestamps);
  const timeSpan = Math.max(1, lastTimestamp - firstTimestamp);
  const plotWidth = width - plot.left - plot.right;
  const x = (timestamp) => firstTimestamp === lastTimestamp
    ? plot.left + plotWidth / 2
    : plot.left + ((timestamp - firstTimestamp) / timeSpan) * plotWidth;
  const y = (rating) => plot.top + ((maximum - rating) / (maximum - minimum)) * (height - plot.top - plot.bottom);
  const points = visibleHistory.map((item) => ({ ...item, x: x(item.ratingUpdateTimeSeconds), y: y(item.newRating) }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const yTicks = [];
  for (let value = minimum; value <= maximum; value += 200) yTicks.push(value);

  const allValues = history.map((item) => Number(item.newRating)).filter((value) => value > 0);
  const navigatorMinimum = Math.min(...allValues);
  const navigatorMaximum = Math.max(navigatorMinimum + 1, ...allValues);
  const navigatorX = (index) => history.length === 1 ? width / 2 : 8 + index / lastIndex * (width - 16);
  const navigatorY = (rating) => 34 - (rating - navigatorMinimum) / (navigatorMaximum - navigatorMinimum) * 28;
  const navigatorPath = history
    .map((item, index) => `${index ? "L" : "M"}${navigatorX(index).toFixed(1)},${navigatorY(Number(item.newRating)).toFixed(1)}`)
    .join(" ");
  const selectionLeft = lastIndex ? viewStart / lastIndex * 100 : 0;
  const selectionRight = lastIndex ? 100 - viewEnd / lastIndex * 100 : 0;
  const showingAll = viewStart === 0 && viewEnd === lastIndex;

  function updateHandle(type, clientX) {
    const bounds = dragRef.current?.bounds;
    if (!bounds?.width || !lastIndex) return;
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    const index = Math.round(ratio * lastIndex);
    frameQueue.current.push({ type, index });
  }

  function beginHandleDrag(type, event) {
    if (!lastIndex || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { type, pointerId: event.pointerId, bounds: navigatorRef.current.getBoundingClientRect(), initial: viewWindow };
    setDraggingHandle(type);
    setActivePoint(null);
    updateHandle(type, event.clientX);
  }

  function moveHandle(type, event) {
    if (dragRef.current?.type !== type || dragRef.current.pointerId !== event.pointerId) return;
    updateHandle(type, event.clientX);
  }

  function endHandleDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.type === "pointercancel" || event.type === "lostpointercapture") {
      frameQueue.current.cancel(); setViewWindow(drag.initial);
    } else frameQueue.current.flush();
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingHandle(null);
  }

  function nudgeHandle(type, direction) {
    if (!lastIndex) return;
    setViewWindow(([start, end]) => type === "start"
      ? [Math.max(0, Math.min(end - 1, start + direction)), end]
      : [start, Math.min(lastIndex, Math.max(start + 1, end + direction))]);
    setActivePoint(null);
  }

  function zoomView(direction) {
    setViewWindow((current) => zoomRatingWindow(current, history.length, direction));
    setActivePoint(null);
  }

  return (
    <div className="rating-chart-wrap" onMouseLeave={() => setActivePoint(null)}>
      <div className="rating-zoom-toolbar">
        <span>主图滚轮缩放 · 底部手柄精确选取</span>
        <div>
          <button type="button" aria-label="缩小 Rating 时间范围" disabled={viewEnd - viewStart + 1 <= 2} onClick={() => zoomView("in")}><ZoomIn size={14} /></button>
          <button type="button" aria-label="扩大 Rating 时间范围" disabled={showingAll} onClick={() => zoomView("out")}><ZoomOut size={14} /></button>
          <button type="button" disabled={showingAll} onClick={() => setViewWindow([0, lastIndex])}>重置</button>
        </div>
      </div>
      <svg ref={chartSurfaceRef} className="analytics-rating-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Codeforces Rating 曲线，可使用鼠标滚轮缩放">
        <defs>
          <linearGradient id="ratingLine" x1="0" x2="1">
            <stop offset="0" stopColor="#e8a52e" />
            <stop offset="1" stopColor="#ffd35b" />
          </linearGradient>
        </defs>
        {ratingBands.map(([from, to, label, tone]) => {
          const clippedFrom = Math.max(from, minimum);
          const clippedTo = Math.min(to, maximum);
          if (clippedFrom >= clippedTo) return null;
          return (
            <g key={tone} className={`rating-band rating-band--${tone}`}>
              <rect x={plot.left} y={y(clippedTo)} width={width - plot.left - plot.right} height={y(clippedFrom) - y(clippedTo)} />
              <text x={width - plot.right + 8} y={(y(clippedFrom) + y(clippedTo)) / 2 + 4}>{label}</text>
            </g>
          );
        })}
        {yTicks.map((value) => (
          <g className="rating-grid-line" key={value}>
            <line x1={plot.left} x2={width - plot.right} y1={y(value)} y2={y(value)} />
            <text x={plot.left - 10} y={y(value) + 4}>{value}</text>
          </g>
        ))}
        <path className="rating-chart-line" d={path} />
        {points.map((point) => (
          <circle
            key={`${point.contestId}-${point.ratingUpdateTimeSeconds}`}
            className="rating-chart-point"
            cx={point.x}
            cy={point.y}
            r={activePoint === point ? 6 : 4.5}
            tabIndex="0"
            onFocus={() => setActivePoint(point)}
            onMouseEnter={() => setActivePoint(point)}
          />
        ))}
        {points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.max(1, Math.ceil(points.length / 5)) === 0).map((point) => (
          <text className="rating-date-label" key={`date-${point.contestId}`} x={point.x} y={height - 24}>{formatDate(point.ratingUpdateTimeSeconds)}</text>
        ))}
      </svg>
      {activePoint ? (
        <div className="analytics-chart-tooltip">
          <strong>{activePoint.contestName}</strong>
          <span>{formatDate(activePoint.ratingUpdateTimeSeconds)}</span>
          <b>{activePoint.oldRating} → {activePoint.newRating}</b>
          <em className={activePoint.newRating >= activePoint.oldRating ? "is-positive" : "is-negative"}>
            {activePoint.newRating >= activePoint.oldRating ? "+" : ""}{activePoint.newRating - activePoint.oldRating}
          </em>
          <small>官方排名 {formatNumber(activePoint.rank)}</small>
        </div>
      ) : null}
      <div
        className={`rating-navigator ${draggingHandle ? "is-dragging" : ""}`}
        ref={navigatorRef}
        data-visible-points={visibleHistory.length}
        aria-label={`Rating 时间范围：第 ${viewStart + 1} 至 ${viewEnd + 1} 场`}
      >
        <svg viewBox={`0 0 ${width} 40`} preserveAspectRatio="none">
          <path d={navigatorPath} />
        </svg>
        <span className="rating-navigator__shade rating-navigator__shade--left" style={{ width: `${selectionLeft}%` }} />
        <span className="rating-navigator__shade rating-navigator__shade--right" style={{ width: `${selectionRight}%` }} />
        <span className="rating-navigator__selection" style={{ left: `${selectionLeft}%`, right: `${selectionRight}%` }} />
        <button
          type="button"
          className="rating-navigator__handle rating-navigator__handle--start"
          aria-label="调整 Rating 图开始时间"
          style={{ left: `${selectionLeft}%` }}
          onPointerDown={(event) => beginHandleDrag("start", event)}
          onPointerMove={(event) => moveHandle("start", event)}
          onPointerUp={endHandleDrag}
          onPointerCancel={endHandleDrag}
          onLostPointerCapture={endHandleDrag}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              nudgeHandle("start", event.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        />
        <button
          type="button"
          className="rating-navigator__handle rating-navigator__handle--end"
          aria-label="调整 Rating 图结束时间"
          style={{ left: `${100 - selectionRight}%` }}
          onPointerDown={(event) => beginHandleDrag("end", event)}
          onPointerMove={(event) => moveHandle("end", event)}
          onPointerUp={endHandleDrag}
          onPointerCancel={endHandleDrag}
          onLostPointerCapture={endHandleDrag}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              nudgeHandle("end", event.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        />
      </div>
    </div>
  );
}

function ActivityBars({ activity }) {
  const entries = [...activity.entries()].sort(([a], [b]) => a.localeCompare(b));
  const grouped = [];
  if (entries.length) {
    const bucketSize = Math.max(1, Math.ceil(entries.length / 18));
    for (let index = 0; index < entries.length; index += bucketSize) {
      const bucket = entries.slice(index, index + bucketSize);
      grouped.push({ label: bucket.at(-1)[0].slice(5), count: bucket.reduce((sum, [, count]) => sum + count, 0) });
    }
  }
  const maximum = Math.max(1, ...grouped.map((item) => item.count));
  return (
    <div className="analytics-activity-bars">
      {grouped.length ? grouped.map((item, index) => (
        <span key={`${item.label}-${index}`} title={`${item.label} · ${item.count} 次 AC`}>
          <i style={{ height: `${Math.max(8, item.count / maximum * 100)}%` }} />
        </span>
      )) : <div className="analytics-inline-empty">所选时间内暂无 AC 记录</div>}
    </div>
  );
}

export default function TrainingAnalytics({ data }) {
  const today = new Date();
  const [preset, setPreset] = useState("quarter");
  const [customStart, setCustomStart] = useState(dateInputValue(new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())));
  const [customEnd, setCustomEnd] = useState(dateInputValue(today));
  const range = useMemo(
    () => resolveAnalyticsRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );
  const analytics = useMemo(() => buildTrainingAnalytics(data, range), [data, range.startSeconds, range.endSeconds]);
  const rankedTags = analytics.tagPerformance;

  return (
    <section className="feature-page training-analytics">
      <header className="analytics-toolbar">
        <div>
          <span className="workspace-kicker">PERSONAL ANALYTICS</span>
          <strong>统一时间口径</strong>
          <small>卡片、Rating 与算法统计都会随范围一起更新</small>
        </div>
        <div className="analytics-range-tabs" role="tablist">
          {presets.map(([id, label]) => (
            <button type="button" role="tab" aria-selected={preset === id} className={preset === id ? "is-active" : ""} key={id} onClick={() => setPreset(id)}>{label}</button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="analytics-custom-range">
            <input type="date" aria-label="开始日期" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} />
            <span>—</span>
            <input type="date" aria-label="结束日期" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} />
          </div>
        ) : <ChevronDown size={15} className="analytics-range-hint" />}
      </header>

      <div className="analytics-metrics">
        <MetricCard Icon={CheckCircle2} label="首次通过" value={formatNumber(analytics.firstSolved)} hint="不同题目的第一次 AC" tone="green" />
        <MetricCard Icon={Send} label="总提交" value={formatNumber(analytics.submissions)} hint={`${formatNumber(analytics.accepted)} 次 Accepted`} tone="blue" />
        <MetricCard Icon={Crosshair} label="通过率" value={`${analytics.acceptanceRate.toFixed(1)}%`} hint="Accepted / 全部提交" tone="violet" />
        <MetricCard Icon={CalendarDays} label="活跃天数" value={formatNumber(analytics.activeDays)} hint="至少完成一次提交" tone="amber" />
      </div>

      <div className="analytics-main-grid">
        <section className="analytics-panel analytics-rating-panel">
          <header><div><span>RATING HISTORY</span><h2>Codeforces Rating</h2></div><small>{analytics.ratingHistory.length} 场 Rated 比赛</small></header>
          <RatingChart history={analytics.ratingHistory} />
        </section>

        <section className="analytics-panel analytics-tags-panel">
          <header>
            <div><span>ALGORITHM PROFILE</span><h2>算法通过率排行</h2></div>
            <small>{rankedTags.length} 项 · 从高到低</small>
          </header>
          <div className="analytics-tag-header"><span>排名</span><span>算法</span><span>解题</span><span>提交</span><span>通过率</span></div>
          <div className="analytics-tag-list">
            {rankedTags.length ? rankedTags.map((item, index) => (
              <article key={item.tag}>
                <b className={`analytics-tag-rank ${index < 3 ? `is-top-${index + 1}` : ""}`}>#{index + 1}</b>
                <strong>{item.label}</strong>
                <span>{item.solved}</span>
                <span>{item.submissions}</span>
                <div><span><i style={{ width: `${item.rate}%` }} /></span><b>{item.rate.toFixed(1)}%</b>{item.sampleLow ? <em>样本不足</em> : null}</div>
              </article>
            )) : <div className="analytics-inline-empty">所选时间内暂无已通过算法数据</div>}
          </div>
        </section>
      </div>

      <div className="analytics-bottom-grid">
        <section className="analytics-panel analytics-rhythm-panel">
          <header><div><span>TRAINING RHYTHM</span><h2>训练节奏</h2></div><Activity size={17} /></header>
          <ActivityBars activity={analytics.activity} />
          <footer><span>每天 Accepted 次数</span><strong>{formatNumber(analytics.accepted)} 次 AC</strong></footer>
        </section>
        <section className="analytics-panel analytics-method-panel">
          <header><div><span>READING GUIDE</span><h2>如何理解这些数据</h2></div></header>
          <ul>
            <li><i />首次通过只计算一道题第一次 Accepted，重复 AC 不会抬高解题量。</li>
            <li><i />算法通过率使用真实提交记录；低于 5 次提交会标记“样本不足”。</li>
            <li><i />Rating 曲线仅统计官方 Rated 比赛，悬停节点可查看变化与排名。</li>
          </ul>
        </section>
      </div>
    </section>
  );
}
