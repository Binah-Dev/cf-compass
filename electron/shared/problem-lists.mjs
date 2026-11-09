const MAX_LISTS = 100;
const MAX_PROBLEMS = 5000;
const normalizeKey = (value) => {
  const match = String(value || "").trim().toUpperCase().match(/^(\d+)-?([A-Z][A-Z0-9]*)$/);
  return match ? `${Number(match[1])}-${match[2]}` : "";
};

export function normalizeProblemLists(value) {
  const ids = new Set();
  return (Array.isArray(value) ? value : []).slice(0, MAX_LISTS).flatMap((item) => {
    const id = typeof item?.id === "string" ? item.id.slice(0, 100) : "";
    const name = typeof item?.name === "string" ? item.name.trim().slice(0, 60) : "";
    if (!id || !name || ids.has(id)) return [];
    ids.add(id);
    return [{
      id, name,
      problemKeys: [...new Set((Array.isArray(item.problemKeys) ? item.problemKeys : []).map(normalizeKey).filter(Boolean))].slice(0, MAX_PROBLEMS),
    }];
  });
}

export function saveProblemList(value, { id, name, problemKey }) {
  const lists = normalizeProblemLists(value);
  const title = String(name || "").trim();
  if (!title || title.length > 60) throw new Error("题单名称请填写 1–60 个字符");
  if (lists.some((item) => item.id !== id && item.name.toLocaleLowerCase() === title.toLocaleLowerCase())) {
    throw new Error("已经有同名题单，请换一个名称");
  }
  const existing = lists.find((item) => item.id === id);
  if (id && !existing) throw new Error("这份题单已经不存在");
  if (!existing && lists.length >= MAX_LISTS) throw new Error("最多创建 100 份题单");
  const key = normalizeKey(problemKey);
  if (problemKey && !key) throw new Error("题目标识无效");
  const item = existing
    ? { ...existing, name: title }
    : { id: globalThis.crypto.randomUUID(), name: title, problemKeys: key ? [key] : [] };
  return { item, lists: existing ? lists.map((entry) => entry.id === id ? item : entry) : [...lists, item] };
}

export function setProblemListMembership(value, listId, problemKey, included) {
  const lists = normalizeProblemLists(value);
  const list = lists.find((item) => item.id === listId);
  const key = normalizeKey(problemKey);
  if (!list) throw new Error("这份题单已经不存在");
  if (!key) throw new Error("题目标识无效");
  if (included && !list.problemKeys.includes(key) && list.problemKeys.length >= MAX_PROBLEMS) {
    throw new Error("每份题单最多收录 5000 道题");
  }
  return lists.map((item) => item.id === listId ? {
    ...item,
    problemKeys: included ? [...new Set([...item.problemKeys, key])] : item.problemKeys.filter((entry) => entry !== key),
  } : item);
}
