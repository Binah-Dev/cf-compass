import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CodeXml,
  ExternalLink,
  FileText,
  Files,
  FolderKanban,
  FolderOpen,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Tags,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  changeTemplateCategory,
  chooseTemplateLibraryFolder,
  formatTemplateSize,
  loadTemplateLibrary,
  openTemplateFile,
  refreshTemplateLibrary,
  saveTemplateSummary,
} from "../lib/templates";
import {
  optimizeTemplateSummaryFormat,
  parseTemplateSummary,
} from "../lib/template-summary-format";

const CATEGORY_DESCRIPTIONS = {
  "dynamic-programming": "状态转移、背包、数位与区间 DP",
  graph: "最短路、连通性与图上遍历",
  tree: "树形 DP、直径、重心与树上结构",
  "data-structures": "线段树、树状数组与常用维护结构",
  "number-theory": "质数、约数、同余与数论工具",
  strings: "匹配、哈希、回文与字符串结构",
  search: "DFS、BFS、二分、回溯与递归",
  sorting: "排序、归并、逆序对与分治思想",
  greedy: "区间选择、局部最优与构造策略",
  basic: "枚举、模拟、前缀和、差分与双指针",
  geometry: "向量、叉积、凸包与平面计算",
  combinatorics: "排列组合、容斥与计数方法",
  "network-flow": "最大流、最小割、费用流与二分图匹配",
  polynomial: "FFT、NTT、卷积与形式幂级数",
  "linear-algebra": "矩阵、高斯消元、行列式与线性基",
  probability: "概率模型、期望 DP 与随机过程",
  "game-theory": "Nim、SG 函数与组合博弈",
  bitwise: "异或、位掩码、子集与按位技巧",
  constructive: "构造方案、规律组织与特殊输出",
  randomized: "随机增量、模拟退火与概率算法",
  offline: "莫队、CDQ、整体二分与离线询问",
  misc: "专题技巧与尚未单独成库的模板",
  unclassified: "等待你确认归属的源码模板",
};

function TemplateSkeleton() {
  return (
    <div className="template-skeleton" role="status" aria-label="正在扫描模板库">
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function sourceLabel(source) {
  if (source === "manual") return "手动整理";
  if (source === "filename") return "文件名识别";
  if (source === "content") return "源码识别";
  return "等待整理";
}

const SUPERSCRIPT_TO_TEXT = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "−", "⁼": "=", "ⁿ": "n", "ⁱ": "i",
};

function SummaryContent({ value }) {
  const parts = String(value || "").split(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼ⁿⁱ]+)/g);
  return parts.map((part, index) => {
    if (!part) return null;
    if (/^[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼ⁿⁱ]+$/.test(part)) {
      const exponent = [...part].map((character) => SUPERSCRIPT_TO_TEXT[character]).join("");
      return (
        <sup className="template-summary-dialog__exponent" key={`${part}-${index}`}>
          {exponent}
        </sup>
      );
    }
    return part;
  });
}

function SummaryReader({ value }) {
  const sections = useMemo(() => parseTemplateSummary(value), [value]);
  return (
    <article className="template-summary-dialog__reader">
      {sections.map((section, index) => (
        <section key={`${section.heading}-${index}`}>
          <h3>{section.heading}</h3>
          <p><SummaryContent value={section.content} /></p>
        </section>
      ))}
    </article>
  );
}

export default function TemplateLibrary({ onToast }) {
  const [library, setLibrary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [language, setLanguage] = useState("all");
  const [changingId, setChangingId] = useState(null);
  const [summaryDialogId, setSummaryDialogId] = useState(null);
  const [summaryEditing, setSummaryEditing] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [savingSummaryId, setSavingSummaryId] = useState(null);
  const [summaryOptimized, setSummaryOptimized] = useState(false);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("zh-CN"));

  useEffect(() => {
    let alive = true;
    loadTemplateLibrary()
      .then((result) => {
        if (alive) setLibrary(result);
      })
      .catch((error) => onToast("error", error.message || "模板库扫描失败"))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [onToast]);

  const categoryMap = useMemo(
    () => new Map((library?.categories || []).map((item) => [item.id, item])),
    [library?.categories],
  );
  const languages = useMemo(
    () => [...new Set((library?.items || []).map((item) => item.language))].sort(),
    [library?.items],
  );
  const categoryLibraries = useMemo(() => {
    const sourceItems = library?.items || [];
    return (library?.categories || []).map((category) => {
      const items = sourceItems.filter(
        (item) =>
          item.categoryId === category.id &&
          (language === "all" || item.language === language),
      );
      return { ...category, items };
    });
  }, [library?.categories, library?.items, language]);
  const visibleItems = useMemo(() => {
    const result = [];
    for (const item of library?.items || []) {
      if (categoryId !== "all" && item.categoryId !== categoryId) continue;
      if (language !== "all" && item.language !== language) continue;
      if (deferredSearch) {
        const haystack = `${item.title} ${item.filename} ${item.relativePath} ${
          categoryMap.get(item.categoryId)?.label || ""
        } ${item.language} ${item.summary || ""}`.toLocaleLowerCase("zh-CN");
        if (!haystack.includes(deferredSearch)) continue;
      }
      result.push(item);
    }
    return result;
  }, [library?.items, categoryId, language, deferredSearch, categoryMap]);
  const activeCategory = categoryId === "all" ? null : categoryMap.get(categoryId);
  const showCategoryLibraries = categoryId === "all" && !deferredSearch;
  const selectedSummaryItem = useMemo(
    () => (library?.items || []).find((item) => item.id === summaryDialogId) || null,
    [library?.items, summaryDialogId],
  );

  useEffect(() => {
    if (!summaryDialogId) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setSummaryDialogId(null);
        setSummaryEditing(false);
        setSummaryDraft("");
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [summaryDialogId]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const result = await refreshTemplateLibrary();
      setLibrary(result);
      onToast("success", `模板库已刷新，共发现 ${result.summary.total} 个源码模板`);
    } catch (error) {
      onToast("error", error.message || "模板库刷新失败");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleChooseFolder() {
    try {
      const result = await chooseTemplateLibraryFolder();
      if (result?.canceled) return;
      setLibrary(result.library);
      setCategoryId("all");
      setLanguage("all");
      onToast("success", `已连接模板库：${result.library.root}`);
    } catch (error) {
      onToast("error", error.message || "无法连接该模板文件夹");
    }
  }

  async function handleCategoryChange(item, nextCategoryId) {
    setChangingId(item.id);
    try {
      const result = await changeTemplateCategory(item.relativePath, nextCategoryId);
      setLibrary(result);
      onToast("success", `“${item.title}”已归入${categoryMap.get(nextCategoryId)?.label || "新分类"}`);
    } catch (error) {
      onToast("error", error.message || "分类保存失败");
    } finally {
      setChangingId(null);
    }
  }

  async function handleOpen(item) {
    try {
      await openTemplateFile(item.filePath);
      onToast("success", `已在 VS Code 中打开“${item.title}”`);
    } catch (error) {
      onToast("error", error.message || "无法打开模板文件");
    }
  }

  function openSummaryDialog(item) {
    setSummaryDialogId(item.id);
    setSummaryDraft(item.summary || "");
    setSummaryEditing(!item.summary);
    setSummaryOptimized(false);
  }

  function closeSummaryDialog() {
    setSummaryDialogId(null);
    setSummaryEditing(false);
    setSummaryDraft("");
    setSummaryOptimized(false);
  }

  function cancelSummaryEdit() {
    if (!selectedSummaryItem?.summary) {
      closeSummaryDialog();
      return;
    }
    setSummaryDraft(selectedSummaryItem.summary);
    setSummaryEditing(false);
    setSummaryOptimized(false);
  }

  function handleSummaryOptimize() {
    const optimized = optimizeTemplateSummaryFormat(summaryDraft || selectedSummaryItem?.summary);
    if (!optimized) {
      onToast("info", "先填写题目大意，再使用自动整理");
      setSummaryEditing(true);
      return;
    }
    setSummaryDraft(optimized);
    setSummaryEditing(true);
    setSummaryOptimized(true);
    onToast("success", "格式已整理，请确认内容后保存");
  }

  async function handleSummarySave(item) {
    setSavingSummaryId(item.id);
    try {
      const normalizedDraft = summaryDraft.trim()
        ? optimizeTemplateSummaryFormat(summaryDraft)
        : "";
      const result = await saveTemplateSummary(item.relativePath, normalizedDraft);
      setLibrary(result);
      const savedItem = result.items.find((candidate) => candidate.id === item.id);
      setSummaryDraft(savedItem?.summary || "");
      setSummaryEditing(false);
      setSummaryOptimized(false);
      onToast(
        "success",
        normalizedDraft
          ? `“${item.title}”的题目大意已保存`
          : `“${item.title}”的题目大意已清空`,
      );
    } catch (error) {
      onToast("error", error.message || "题目大意保存失败");
    } finally {
      setSavingSummaryId(null);
    }
  }

  return (
    <main className="feature-page template-library-page">
      <section className="template-overview" aria-label="模板库概览">
        <div className="template-overview__intro">
          <span className="template-overview__mark"><CodeXml size={22} /></span>
          <div>
            <h2>我的算法工具箱</h2>
            <p>只建立本地索引，不复制源码；点击卡片即可回到 VS Code。</p>
          </div>
        </div>
        <div className="template-overview__stats">
          <div><Files size={16} /><span>模板总数<strong>{library?.summary.total || 0}</strong></span></div>
          <div><Tags size={16} /><span>已分类<strong>{library?.summary.classified || 0}</strong></span></div>
          <div><FileText size={16} /><span>已写大意<strong>{library?.summary.summarized || 0}</strong></span></div>
        </div>
        <div className="template-overview__actions">
          <button type="button" className="ghost-button" onClick={handleChooseFolder}>
            <FolderOpen size={16} /> 更换目录
          </button>
          <button
            type="button"
            className="primary-button template-refresh-button"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? "is-spinning" : ""} />
            {refreshing ? "正在扫描" : "刷新模板"}
          </button>
        </div>
      </section>

      <section className="template-browser feature-card">
        <div className="template-browser__toolbar">
          <label className="template-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索名称、题目大意、路径或算法分类"
              data-template-search
            />
            <kbd>Ctrl K</kbd>
          </label>
          <label className="template-language-filter">
            <span>语言</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="all">全部</option>
              {languages.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <span className="template-root" title={library?.root || ""}>
            <FolderOpen size={15} /> {library?.root || "未连接模板目录"}
          </span>
        </div>

        <div className="template-browser__resultbar">
          <span>
            <strong>{showCategoryLibraries ? categoryLibraries.length : visibleItems.length}</strong>
            {showCategoryLibraries ? " 个算法模板库" : " 个匹配模板"}
          </span>
          <span>{library?.scannedAt ? `最近扫描 ${new Date(library.scannedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "尚未扫描"}</span>
        </div>

        {loading ? (
          <TemplateSkeleton />
        ) : !library?.exists ? (
          <div className="template-empty">
            <CircleAlert size={34} />
            <h3>还没有连接模板库</h3>
            <p>默认寻找桌面 OJ / Template Library，你也可以选择任意源码文件夹。</p>
            <button type="button" className="primary-button" onClick={handleChooseFolder}>
              <FolderOpen size={16} /> 选择模板文件夹
            </button>
          </div>
        ) : showCategoryLibraries && categoryLibraries.length ? (
          <div className="template-category-grid" aria-label="算法模板库">
            {categoryLibraries.map((category) => (
              <button
                type="button"
                className={`template-category-card template-category-card--${category.tone} ${category.items.length ? "" : "is-empty"}`}
                key={category.id}
                onClick={() => setCategoryId(category.id)}
                data-template-category
              >
                <span className="template-category-card__icon"><FolderKanban size={21} /></span>
                <span className="template-category-card__body">
                  <strong>{category.label}</strong>
                  <small>{CATEGORY_DESCRIPTIONS[category.id] || "本地算法源码模板"}</small>
                  <span>
                    {category.items.length
                      ? category.items.slice(0, 3).map((item) => item.title).join(" · ")
                      : "暂无模板，等待收录"}
                  </span>
                </span>
                <span className="template-category-card__count">
                  <strong>{category.items.length}</strong>
                  <small>个模板</small>
                </span>
                <ChevronRight size={18} className="template-category-card__arrow" />
              </button>
            ))}
          </div>
        ) : activeCategory || visibleItems.length ? (
          <div className="template-level-two">
            <div className="template-level-two__header">
              <button type="button" onClick={() => setCategoryId("all")}>
                <ArrowLeft size={15} /> 返回算法库
              </button>
              <div>
                <strong>{activeCategory?.label || (deferredSearch ? `搜索“${search.trim()}”` : "模板题目")}</strong>
                <span>{activeCategory ? CATEGORY_DESCRIPTIONS[activeCategory.id] : "跨算法库搜索结果"}</span>
              </div>
              <span>{visibleItems.length} 个模板</span>
            </div>
            {visibleItems.length ? (
              <div className="template-grid">
            {visibleItems.map((item) => {
              const category = categoryMap.get(item.categoryId) || { label: "待整理", tone: "muted" };
              return (
                <article
                  className={`template-card template-card--${category.tone}`}
                  key={item.id}
                  data-template-card
                >
                  <div className="template-card__topline">
                    <span className="template-card__category">{category.label}</span>
                    <span className="template-card__language">{item.language}</span>
                  </div>
                  <button type="button" className="template-card__title" onClick={() => handleOpen(item)}>
                    <span>{item.title}</span>
                    <ExternalLink size={16} />
                  </button>
                  <p className="template-card__path" title={item.relativePath}>{item.relativePath}</p>
                  <button
                    type="button"
                    className={`template-card__summary-button ${item.summary ? "has-content" : ""}`}
                    onClick={() => openSummaryDialog(item)}
                    aria-label={`${item.summary ? "查看" : "添加"} ${item.title} 的题目大意`}
                    data-template-summary-open
                  >
                    <span className="template-card__summary-button-icon"><FileText size={17} /></span>
                    <span>
                      <strong>{item.summary ? "查看题目大意" : "添加题目大意"}</strong>
                      <small>{item.summary ? "已记录，点击展开清晰阅读" : "补充题意、输入输出与适用场景"}</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <div className="template-card__meta">
                    <span className={item.source === "manual" ? "is-manual" : ""}>
                      {item.source === "manual" ? <CheckCircle2 size={14} /> : <Sparkles size={14} />}
                      {sourceLabel(item.source)}
                      {item.source !== "manual" && item.confidence ? ` ${item.confidence}%` : ""}
                    </span>
                    <span>{formatTemplateSize(item.size)}</span>
                  </div>
                  <div className="template-card__actions">
                    <label>
                      <span>归类</span>
                      <select
                        value={item.categoryId}
                        disabled={changingId === item.id}
                        onChange={(event) => handleCategoryChange(item, event.target.value)}
                        aria-label={`修改 ${item.title} 的分类`}
                      >
                        {(library?.categories || []).map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" onClick={() => handleOpen(item)}>
                      <CodeXml size={16} /> 打开
                    </button>
                  </div>
                </article>
              );
            })}
              </div>
            ) : (
              <div className="template-empty template-empty--compact">
                <FolderKanban size={30} />
                <h3>这个算法库还没有模板</h3>
                <p>把对应源码放进模板目录并点击“刷新模板”，它会自动出现在这里。</p>
              </div>
            )}
          </div>
        ) : (
          <div className="template-empty template-empty--compact">
            <Search size={30} />
            <h3>没有匹配的模板</h3>
            <p>换一个关键词、语言或算法分类试试。</p>
          </div>
        )}
      </section>
      {selectedSummaryItem ? (
        <div className="template-summary-backdrop" role="presentation" onMouseDown={closeSummaryDialog}>
          <section
            className="template-summary-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-summary-title"
            onMouseDown={(event) => event.stopPropagation()}
            data-template-summary-dialog
          >
            <header className="template-summary-dialog__header">
              <span className="template-summary-dialog__icon"><FileText size={23} /></span>
              <div>
                <span>题目大意</span>
                <h2 id="template-summary-title">{selectedSummaryItem.title}</h2>
                <p>{selectedSummaryItem.relativePath}</p>
              </div>
              <button type="button" onClick={closeSummaryDialog} aria-label="关闭题目大意">
                <X size={20} />
              </button>
            </header>

            <div className="template-summary-dialog__meta">
              <span>{categoryMap.get(selectedSummaryItem.categoryId)?.label || "待整理"}</span>
              <span>{selectedSummaryItem.language}</span>
              <span>{formatTemplateSize(selectedSummaryItem.size)}</span>
            </div>

            <div className="template-summary-dialog__body">
              {summaryEditing ? (
                <div className="template-summary-editor">
                  {summaryOptimized ? (
                    <div className="template-summary-editor__notice">
                      <Sparkles size={15} />格式已自动整理，确认无误后再保存
                    </div>
                  ) : null}
                  <textarea
                    value={summaryDraft}
                    maxLength={1200}
                    autoFocus
                    placeholder="清楚记录题目要求、输入输出、关键约束，以及这份模板适合解决什么问题……"
                    onChange={(event) => {
                      setSummaryDraft(event.target.value);
                      setSummaryOptimized(false);
                    }}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                        event.preventDefault();
                        handleSummarySave(selectedSummaryItem);
                      }
                    }}
                    data-template-summary-input
                  />
                </div>
              ) : (
                <SummaryReader value={selectedSummaryItem.summary} />
              )}
            </div>

            <footer className="template-summary-dialog__footer">
              <span>{summaryEditing ? `${summaryDraft.length}/1200 · Ctrl + Enter 保存` : "大字号阅读模式"}</span>
              <div>
                {summaryEditing ? (
                  <>
                    <button type="button" className="ghost-button template-summary-optimize" onClick={handleSummaryOptimize}>
                      <Sparkles size={15} /> 自动整理
                    </button>
                    <button type="button" className="ghost-button" onClick={cancelSummaryEdit}>
                      <X size={15} /> 取消
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => handleSummarySave(selectedSummaryItem)}
                      disabled={savingSummaryId === selectedSummaryItem.id}
                      data-template-summary-save
                    >
                      <Save size={15} /> {savingSummaryId === selectedSummaryItem.id ? "保存中" : "保存题意"}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="ghost-button" onClick={() => handleOpen(selectedSummaryItem)}>
                      <CodeXml size={15} /> 打开代码
                    </button>
                    <button type="button" className="ghost-button template-summary-optimize" onClick={handleSummaryOptimize}>
                      <Sparkles size={15} /> 自动整理
                    </button>
                    <button type="button" className="primary-button" onClick={() => setSummaryEditing(true)}>
                      <Pencil size={15} /> 编辑题意
                    </button>
                  </>
                )}
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
