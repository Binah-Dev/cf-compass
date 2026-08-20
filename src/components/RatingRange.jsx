import { useEffect, useState } from "react";
import { ratingTone } from "../lib/stats";

export const RATING_MIN = 800;
export const RATING_MAX = 3500;
const RATING_GAP = 100;

export default function RatingRange({ value, onChange }) {
  const [minimum, maximum] = value;
  const [minimumDraft, setMinimumDraft] = useState(String(minimum));
  const [maximumDraft, setMaximumDraft] = useState(String(maximum));
  const start = ((minimum - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100;
  const end = ((maximum - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100;

  useEffect(() => {
    setMinimumDraft(String(minimum));
    setMaximumDraft(String(maximum));
  }, [minimum, maximum]);

  function updateMinimum(rawValue) {
    const next = Number(rawValue);
    if (!Number.isFinite(next)) return;
    onChange([Math.min(Math.max(RATING_MIN, next), maximum - RATING_GAP), maximum]);
  }

  function updateMaximum(rawValue) {
    const next = Number(rawValue);
    if (!Number.isFinite(next)) return;
    onChange([minimum, Math.max(Math.min(RATING_MAX, next), minimum + RATING_GAP)]);
  }

  function commitMinimum() {
    const next = Number(minimumDraft);
    if (!Number.isFinite(next)) {
      setMinimumDraft(String(minimum));
      return;
    }
    updateMinimum(next);
  }

  function commitMaximum() {
    const next = Number(maximumDraft);
    if (!Number.isFinite(next)) {
      setMaximumDraft(String(maximum));
      return;
    }
    updateMaximum(next);
  }

  return (
    <div className="rating-range-control" aria-label="Rating 范围">
      <span className="rating-range-control__label">Rating</span>
      <label className={`rating-value rating-value--${ratingTone(minimum)}`}>
        <span className="sr-only">最低 Rating</span>
        <input
          type="number"
          min={RATING_MIN}
          max={maximum - RATING_GAP}
          step="100"
          value={minimumDraft}
          onChange={(event) => setMinimumDraft(event.target.value)}
          onBlur={commitMinimum}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
      <div className="rating-slider">
        <div className="rating-slider__track">
          <span
            className="rating-slider__fill"
            style={{ left: `${start}%`, right: `${100 - end}%` }}
          />
        </div>
        <input
          className="rating-slider__input rating-slider__input--minimum"
          type="range"
          min={RATING_MIN}
          max={RATING_MAX}
          step="100"
          value={minimum}
          aria-label="最低 Rating 滑块"
          onChange={(event) => updateMinimum(event.target.value)}
        />
        <input
          className="rating-slider__input rating-slider__input--maximum"
          type="range"
          min={RATING_MIN}
          max={RATING_MAX}
          step="100"
          value={maximum}
          aria-label="最高 Rating 滑块"
          onChange={(event) => updateMaximum(event.target.value)}
        />
      </div>
      <label className={`rating-value rating-value--${ratingTone(maximum)}`}>
        <span className="sr-only">最高 Rating</span>
        <input
          type="number"
          min={minimum + RATING_GAP}
          max={RATING_MAX}
          step="100"
          value={maximumDraft}
          onChange={(event) => setMaximumDraft(event.target.value)}
          onBlur={commitMaximum}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
      <button
        className="rating-reset"
        type="button"
        disabled={minimum === RATING_MIN && maximum === RATING_MAX}
        onClick={() => onChange([RATING_MIN, RATING_MAX])}
      >
        重置
      </button>
    </div>
  );
}
