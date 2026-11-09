const { createHash, randomUUID } = require("node:crypto");
const path = require("node:path");

const PLAN_FILE = "study-plan.json";

function normalizeProblemKey(value) {
  const compact = String(value || "").trim().toUpperCase().replace(/[\s_]+/g, "-");
  const match = compact.match(/^(\d+)-?([A-Z][A-Z0-9]*)$/);
  return match ? `${Number(match[1])}-${match[2]}` : "";
}

function normalizeTemplatePath(value) {
  return typeof value === "string" && path.isAbsolute(value) ? path.resolve(value) : "";
}

function templateKey(filePath) {
  const identity = process.platform === "win32" ? filePath.toLowerCase() : filePath;
  return `template:${createHash("sha256").update(identity).digest("hex")}`;
}

function sanitizeStudyPlan(source) {
  return {
    version: 1,
    items: (Array.isArray(source?.items) ? source.items : []).slice(0, 500).map((item) => {
      const isTemplate = item?.type === "template";
      const filePath = isTemplate ? normalizeTemplatePath(item.filePath) : "";
      const problemKey = isTemplate ? (filePath ? templateKey(filePath) : "") : normalizeProblemKey(item?.problemKey);
      if (!problemKey) return null;
      return {
        id: String(item?.id || randomUUID()).slice(0, 100),
        problemKey,
        contestId: Number(item?.contestId) || null,
        index: String(item?.index || "").slice(0, 12),
        name: String(item?.name || "").slice(0, 240),
        rating: Number(item?.rating) || null,
        tags: Array.isArray(item?.tags) ? item.tags.slice(0, 12).map((tag) => String(tag).slice(0, 80)) : [],
        reason: String(item?.reason || "手动加入计划题单").slice(0, 300),
        status: item?.status === "done" ? "done" : "pending",
        addedAt: typeof item?.addedAt === "string" ? item.addedAt : new Date().toISOString(),
        completedAt: typeof item?.completedAt === "string" ? item.completedAt : null,
        ...(isTemplate ? {
          type: "template", filePath,
          relativePath: String(item.relativePath || path.basename(filePath)).slice(0, 2000),
          language: String(item.language || "").slice(0, 40),
        } : {}),
      };
    }).filter(Boolean),
  };
}

function createStudyPlanService({ readJson, writeJson, getTemplate = null, onChanged = null }) {
  const notify = () => { if (typeof onChanged === "function") onChanged(); };
  let mutations = Promise.resolve();
  const enqueue = (operation) => {
    const pending = mutations.then(operation);
    mutations = pending.catch(() => {});
    return pending;
  };

  async function getQueue() {
    const source = await readJson(PLAN_FILE, null);
    if (source) return sanitizeStudyPlan(source);
    return sanitizeStudyPlan(await readJson("agent-todo.json", { version: 1, items: [] }));
  }

  async function save(items) {
    const queue = sanitizeStudyPlan({ version: 1, items });
    await writeJson(PLAN_FILE, queue);
    notify();
    return queue.items;
  }

  async function addProblem(problemKeyValue) {
    const problemKey = normalizeProblemKey(problemKeyValue);
    if (!problemKey) throw new Error("题目标识无效");
    const cache = await readJson("cache.json", null);
    const problem = (Array.isArray(cache?.problems) ? cache.problems : []).find((candidate) =>
      `${Number(candidate?.contestId)}-${String(candidate?.index || "").toUpperCase()}` === problemKey,
    );
    if (!problem) throw new Error("本地题库中找不到这道题，请先同步数据");
    return addItem({
      problemKey, contestId: Number(problem.contestId) || null,
      index: String(problem.index || ""), name: String(problem.name || ""),
      rating: Number(problem.rating) || null, tags: Array.isArray(problem.tags) ? problem.tags : [],
      reason: "手动加入计划题单",
    });
  }

  async function addTemplate(filePathValue) {
    const filePath = normalizeTemplatePath(filePathValue);
    if (!filePath) throw new Error("模板路径无效");
    const template = await getTemplate?.(filePath);
    if (!template) throw new Error("模板库中找不到这个文件，请刷新模板库");
    return addItem({
      type: "template", problemKey: templateKey(filePath), filePath,
      relativePath: template.relativePath, language: template.language,
      name: template.title, reason: "从模板库加入计划题单",
    });
  }

  async function addItem(snapshot) {
    const queue = await getQueue();
    const existing = queue.items.find((item) => item.problemKey === snapshot.problemKey);
    if (existing) {
      if (existing.status === "done") {
        const revived = { ...existing, ...snapshot, status: "pending", completedAt: null };
        const items = await save([revived, ...queue.items.filter((item) => item.id !== existing.id)]);
        return { added: false, revived: true, item: revived, items };
      }
      return { added: false, revived: false, item: existing, items: queue.items };
    }
    if (queue.items.length >= 500) throw new Error("计划题单已满，请先移除不再需要的题目");
    const item = sanitizeStudyPlan({ items: [{
      ...snapshot, id: randomUUID(), status: "pending", addedAt: new Date().toISOString(), completedAt: null,
    }] }).items[0];
    const items = await save([item, ...queue.items]);
    return { added: true, revived: false, item, items };
  }

  async function setStatus(itemId, statusValue) {
    const id = String(itemId || "").trim();
    const status = statusValue === "done" ? "done" : statusValue === "pending" ? "pending" : "";
    if (!id || !status) throw new Error("计划题单状态无效");
    const queue = await getQueue();
    const current = queue.items.find((item) => item.id === id);
    if (!current) throw new Error("这道计划题已经不存在");
    const item = { ...current, status, completedAt: status === "done" ? new Date().toISOString() : null };
    const items = await save(queue.items.map((entry) => entry.id === id ? item : entry));
    return { item, items };
  }

  async function remove(itemId) {
    const id = String(itemId || "").trim();
    if (!id) throw new Error("计划题目标识无效");
    const queue = await getQueue();
    const removed = queue.items.find((item) => item.id === id) || null;
    if (!removed) return { removed, items: queue.items };
    const items = await save(queue.items.filter((item) => item.id !== id));
    return { removed, items };
  }

  async function reorder(orderedIds) {
    const ids = [...new Set((Array.isArray(orderedIds) ? orderedIds : []).map((id) => String(id || "").trim()).filter(Boolean))];
    const queue = await getQueue();
    if (ids.length !== queue.items.length || queue.items.some((item) => !ids.includes(item.id))) {
      throw new Error("计划题单顺序已经变化，请重试");
    }
    const byId = new Map(queue.items.map((item) => [item.id, item]));
    const items = await save(ids.map((id) => byId.get(id)));
    return { items };
  }

  return {
    addProblem: (key) => enqueue(() => addProblem(key)),
    addTemplate: (filePath) => enqueue(() => addTemplate(filePath)),
    getQueue,
    remove: (id) => enqueue(() => remove(id)),
    reorder: (ids) => enqueue(() => reorder(ids)),
    setStatus: (id, status) => enqueue(() => setStatus(id, status)),
  };
}

module.exports = { createStudyPlanService, normalizeProblemKey, sanitizeStudyPlan };
