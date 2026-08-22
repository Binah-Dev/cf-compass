import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { exactMessages, patternMessages } from "./en-US";

export const LANGUAGE_STORAGE_KEY = "cf-compass-language";
export const SUPPORTED_LANGUAGES = ["zh-CN", "en-US"];

const I18nContext = createContext(null);
const textState = new WeakMap();
const attributeState = new WeakMap();
const LOCALIZED_ATTRIBUTES = ["aria-label", "placeholder", "title", "data-tooltip"];

export function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.includes(value) ? value : "zh-CN";
}

export function getCurrentLocale() {
  try {
    return normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return "zh-CN";
  }
}

function preserveWhitespace(source, translated) {
  const leading = source.match(/^\s*/)?.[0] || "";
  const trailing = source.match(/\s*$/)?.[0] || "";
  return `${leading}${translated}${trailing}`;
}

export function translateText(source, locale = getCurrentLocale()) {
  if (locale !== "en-US" || typeof source !== "string") return source;
  const trimmed = source.trim();
  if (!trimmed) return source;
  if (Object.prototype.hasOwnProperty.call(exactMessages, trimmed)) {
    return preserveWhitespace(source, exactMessages[trimmed]);
  }
  for (const [pattern, replacement] of patternMessages) {
    if (pattern.test(trimmed)) {
      pattern.lastIndex = 0;
      return preserveWhitespace(source, trimmed.replace(pattern, replacement));
    }
  }
  return source;
}

function localizeTextNode(node, locale) {
  if (node.parentElement?.closest("[data-i18n-preserve]")) return;
  const current = node.nodeValue || "";
  const existing = textState.get(node);
  const source = !existing || current !== existing.rendered ? current : existing.source;
  const rendered = translateText(source, locale);
  textState.set(node, { source, rendered });
  if (current !== rendered) node.nodeValue = rendered;
}

function localizeAttributes(element, locale) {
  if (element.closest?.("[data-i18n-preserve]")) return;
  let states = attributeState.get(element);
  if (!states) {
    states = new Map();
    attributeState.set(element, states);
  }
  for (const name of LOCALIZED_ATTRIBUTES) {
    if (!element.hasAttribute(name)) continue;
    const current = element.getAttribute(name) || "";
    const existing = states.get(name);
    const source = !existing || current !== existing.rendered ? current : existing.source;
    const rendered = translateText(source, locale);
    states.set(name, { source, rendered });
    if (current !== rendered) element.setAttribute(name, rendered);
  }
}

function localizeTree(root, locale) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    localizeTextNode(root, locale);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) {
    const tag = root.tagName?.toLowerCase();
    if (tag === "script" || tag === "style") return;
    localizeAttributes(root, locale);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) localizeTextNode(node, locale);
    else localizeAttributes(node, locale);
    node = walker.nextNode();
  }
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(getCurrentLocale);

  const setLocale = (nextLocale) => {
    const safe = normalizeLanguage(nextLocale);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, safe);
    } catch {
      // The desktop app always provides storage; keep the in-memory value as a fallback.
    }
    setLocaleState(safe);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    localizeTree(document.body, locale);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") localizeTextNode(mutation.target, locale);
        if (mutation.type === "attributes") localizeAttributes(mutation.target, locale);
        for (const node of mutation.addedNodes || []) localizeTree(node, locale);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: LOCALIZED_ATTRIBUTES,
    });
    return () => observer.disconnect();
  }, [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t: (source) => translateText(source, locale) }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
