import { ChevronRight, Layers3 } from "lucide-react";
import { displayTag, formatNumber } from "../lib/stats";

const tagColors = ["#86a8ff", "#b28cff", "#f2b66d", "#a8c96f", "#69d7a5", "#f1848f"];

export default function Taxonomy({
  tagCounts,
  selectedTag,
  onSelectTag,
  problemCount,
}) {
  const visibleTags = tagCounts;
  return (
    <aside className="taxonomy-panel">
      <div className="section-label">
        <span>算法分类</span>
        <Layers3 size={15} />
      </div>
      <button
        type="button"
        className={`taxonomy-item ${selectedTag === "all" ? "is-active" : ""}`}
        style={{ "--tag-color": tagColors[0] }}
        onClick={() => onSelectTag("all")}
      >
        <span className="taxonomy-item__marker" />
        <span className="taxonomy-item__name">所有题目</span>
        <span className="taxonomy-item__count">{formatNumber(problemCount)}</span>
        <ChevronRight size={14} />
      </button>
      <div className="taxonomy-list">
        {visibleTags.map(({ tag, count }, index) => (
          <button
            type="button"
            key={tag}
            className={`taxonomy-item ${selectedTag === tag ? "is-active" : ""}`}
            style={{ "--tag-color": tagColors[(index + 1) % tagColors.length] }}
            onClick={() => onSelectTag(tag)}
          >
            <span className="taxonomy-item__marker" />
            <span className="taxonomy-item__name">{displayTag(tag)}</span>
            <span className="taxonomy-item__count">{formatNumber(count)}</span>
            <ChevronRight size={14} />
          </button>
        ))}
      </div>
      <div className="taxonomy-footer">
        <span>共 {tagCounts.length} 个官方算法标签</span>
        <div className="taxonomy-footer__line" />
      </div>
    </aside>
  );
}
