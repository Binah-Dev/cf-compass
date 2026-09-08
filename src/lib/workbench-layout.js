export const PANEL_IDS = ["taxonomy", "problems", "progress"];
export const WORKBENCH_LAYOUT_KEY = "cf-compass-workbench-layout-v2";
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function clampFrame(frame, size, id) {
  const minWidth = Math.min(size.width, id === "problems" ? 520 : 190);
  const minHeight = Math.min(size.height, id === "problems" ? 280 : 180);
  const width = clamp(frame.width, minWidth, size.width), height = clamp(frame.height, minHeight, size.height);
  return { x: clamp(frame.x, 0, size.width - width), y: clamp(frame.y, 0, size.height - height), width, height };
}
export function defaultFrames(size, order = PANEL_IDS) {
  const { width, height } = size, gap = 12;
  if (width < 1150) {
    const side = Math.min(230, width * .26), half = (height - gap) / 2;
    return {
      taxonomy: { x: 0, y: 0, width: side, height: half },
      progress: { x: 0, y: half + gap, width: side, height: half },
      problems: { x: side + gap, y: 0, width: width - side - gap, height },
    };
  }
  const widths = { taxonomy: Math.max(190, width * .16), progress: Math.max(260, width * .22) };
  widths.problems = width - widths.taxonomy - widths.progress - gap * 2;
  let x = 0;
  return Object.fromEntries(order.map((id) => {
    const frame = { x, y: 0, width: widths[id], height }; x += widths[id] + gap; return [id, frame];
  }));
}
export function validLayout(value) {
  if (value?.version !== 2) return null;
  const frames = {};
  for (const id of PANEL_IDS) {
    const f = value.frames?.[id];
    if (!f || !["x", "y", "width", "height"].every((key) => Number.isFinite(f[key]) && f[key] >= 0 && f[key] <= 1) || !f.width || !f.height) return null;
    frames[id] = { x: f.x, y: f.y, width: f.width, height: f.height };
  }
  return { version: 2, frames };
}
export function normalizeFrames(frames, size) {
  return { version: 2, frames: Object.fromEntries(PANEL_IDS.map((id) => {
    const f = clampFrame(frames[id], size, id);
    return [id, { x: f.x / size.width, y: f.y / size.height, width: f.width / size.width, height: f.height / size.height }];
  })) };
}
export function resolveFrames(layout, size, order) {
  if (!layout) return defaultFrames(size, order);
  return Object.fromEntries(PANEL_IDS.map((id) => {
    const f = layout.frames[id];
    return [id, clampFrame({ x: f.x * size.width, y: f.y * size.height, width: f.width * size.width, height: f.height * size.height }, size, id)];
  }));
}
export function changeFrame(frame, size, id, mode, dx, dy) {
  if (mode === "move") return clampFrame({ ...frame, x: frame.x + dx, y: frame.y + dy }, size, id);
  const minimum = clampFrame({ x: 0, y: 0, width: 0, height: 0 }, size, id);
  let left = frame.x, right = frame.x + frame.width, top = frame.y, bottom = frame.y + frame.height;
  if (mode.includes("w")) left = clamp(left + dx, 0, right - minimum.width);
  if (mode.includes("e")) right = clamp(right + dx, left + minimum.width, size.width);
  if (mode.includes("n")) top = clamp(top + dy, 0, bottom - minimum.height);
  if (mode.includes("s")) bottom = clamp(bottom + dy, top + minimum.height, size.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
