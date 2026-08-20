import { formatNumber, ratingTone } from "../lib/stats";

function joinClasses(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function RatingScore({
  value,
  children,
  className,
  fallback = "—",
  tone,
}) {
  const numericValue = Number(value);
  const resolvedTone =
    tone || (value === "Infinity" ? "tourist" : ratingTone(numericValue));
  const content =
    children ??
    (Number.isFinite(numericValue) && numericValue > 0
      ? formatNumber(numericValue)
      : fallback);

  return (
    <span
      className={joinClasses(
        "rating-score",
        `rating-score--${resolvedTone}`,
        className,
      )}
      style={{ color: `var(--cf-rating-${resolvedTone})` }}
    >
      {content}
    </span>
  );
}

export function RatedName({ name, rating, className }) {
  const label = String(name || "未同步");
  const tone = ratingTone(rating);
  const isBlackRed = Number(rating) >= 3000;

  if (isBlackRed) {
    return (
      <span
        className={joinClasses(
          "rated-name",
          `rated-name--${tone}`,
          "rated-name--black-red",
          className,
        )}
        style={{ color: `var(--cf-rating-${tone})` }}
        aria-label={label}
      >
        <span className="rated-name__first" aria-hidden="true">
          {label.slice(0, 1)}
        </span>
        <span className="rated-name__rest" aria-hidden="true">
          {label.slice(1)}
        </span>
      </span>
    );
  }

  return (
    <span
      className={joinClasses("rated-name", `rated-name--${tone}`, className)}
      style={{ color: `var(--cf-rating-${tone})` }}
    >
      {label}
    </span>
  );
}
