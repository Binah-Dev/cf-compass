const HEADING_ALIASES = new Map([
  ["题意", "题目大意"],
  ["题目", "题目大意"],
  ["题目描述", "题目大意"],
  ["问题描述", "题目大意"],
  ["题目大意", "题目大意"],
  ["描述", "题目大意"],
  ["输入", "输入"],
  ["输入格式", "输入"],
  ["输出", "输出"],
  ["输出格式", "输出"],
  ["约束", "关键约束"],
  ["限制", "关键约束"],
  ["数据范围", "关键约束"],
  ["关键约束", "关键约束"],
  ["样例", "样例"],
  ["示例", "样例"],
  ["输入样例", "样例输入"],
  ["样例输入", "样例输入"],
  ["输出样例", "样例输出"],
  ["样例输出", "样例输出"],
  ["思路", "核心思路"],
  ["题解", "核心思路"],
  ["解法", "核心思路"],
  ["核心思路", "核心思路"],
  ["适用场景", "适用场景"],
  ["应用场景", "适用场景"],
  ["复杂度", "复杂度"],
  ["时间复杂度", "复杂度"],
  ["空间复杂度", "复杂度"],
  ["注意", "注意事项"],
  ["注意事项", "注意事项"],
  ["易错点", "注意事项"],
  ["备注", "注意事项"],
]);

const STANDARD_ORDER = [
  "题目大意",
  "输入",
  "输出",
  "关键约束",
  "样例",
  "样例输入",
  "样例输出",
  "核心思路",
  "适用场景",
  "复杂度",
  "注意事项",
];

function cleanHeadingCandidate(value) {
  return String(value || "")
    .replace(/^#{1,4}\s*/, "")
    .replace(/^\*\*|\*\*$/g, "")
    .replace(/^[【\[]|[】\]]$/g, "")
    .replace(/[：:]$/, "")
    .trim();
}

function matchHeading(line) {
  const trimmed = String(line || "").trim();
  const bracket = trimmed.match(/^[【\[]([^】\]]+)[】\]]\s*[：:]?\s*(.*)$/);
  if (bracket) {
    const heading = HEADING_ALIASES.get(cleanHeadingCandidate(bracket[1]));
    return heading ? { heading, content: bracket[2].trim() } : null;
  }
  const labeled = trimmed.match(/^(?:#{1,4}\s*)?(?:\*\*)?([^：:]{1,12})(?:\*\*)?\s*[：:]\s*(.*)$/);
  if (labeled) {
    const heading = HEADING_ALIASES.get(cleanHeadingCandidate(labeled[1]));
    return heading ? { heading, content: labeled[2].trim() } : null;
  }
  const heading = HEADING_ALIASES.get(cleanHeadingCandidate(trimmed));
  return heading ? { heading, content: "" } : null;
}

const CJK_CHARACTER = /[\u3400-\u9fff\uf900-\ufaff]/;
const STRUCTURED_LINE = /^(?:•\s+|\d+\.\s+|(?:操作|步骤)\s*\d+\s*[：:]|第(?:[一二三四五六七八九十百]+|\d+)行\s*[：:]?|接下来\s+|[+-]?\d+\s*(?:≤|≥|<|>))/;

const SUPERSCRIPT_CHARACTERS = {
  0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", n: "ⁿ", i: "ⁱ",
};

const SUBSCRIPT_CHARACTERS = {
  0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉",
  "+": "₊", "-": "₋", "=": "₌", a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ",
  l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};

function convertScriptToken(token, characters) {
  const converted = [...String(token || "")].map((character) => characters[character]);
  return converted.every(Boolean) ? converted.join("") : null;
}

const SUPERSCRIPT_VALUES = Object.fromEntries(
  Object.entries(SUPERSCRIPT_CHARACTERS).map(([plain, script]) => [script, plain]),
);
const SUBSCRIPT_VALUES = Object.fromEntries(
  Object.entries(SUBSCRIPT_CHARACTERS).map(([plain, script]) => [script, plain]),
);
const SUPERSCRIPT_RUN = "[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼ⁿⁱ]+";
const SUBSCRIPT_RUN = "[₀₁₂₃₄₅₆₇₈₉₊₋₌ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+";

function decodeScriptToken(token, values) {
  return [...String(token || "")].map((character) => values[character] || character).join("");
}

function formatReadableInteger(value) {
  return BigInt(value).toLocaleString("en-US");
}

function calculateIntegerPower(baseText, exponentText, coefficientText = "1", adjustmentSign, adjustmentText) {
  if (!/^\+?\d+$/.test(exponentText)) return null;
  const exponent = Number(exponentText.replace(/^\+/, ""));
  if (!Number.isSafeInteger(exponent) || exponent > 36) return null;
  let value = BigInt(coefficientText) * (BigInt(baseText) ** BigInt(exponent));
  if (adjustmentText) {
    value += adjustmentSign === "-" ? -BigInt(adjustmentText) : BigInt(adjustmentText);
  }
  return formatReadableInteger(value);
}

function expandLikelyCollapsedDecimalPowers(value) {
  const exponentPattern = "(18|1[0-7]|[3-9])";
  const comparisonPrefix = "((?:≤|≥|<|>|不超过|不小于|最多|至多)\\s*)";
  let result = String(value || "").replace(/∗/g, "×");

  result = result.replace(
    new RegExp(`${comparisonPrefix}(\\d+)\\s*×\\s*10${exponentPattern}\\b`, "g"),
    (match, prefix, coefficient, exponent) => {
      const expanded = calculateIntegerPower("10", exponent, coefficient);
      return expanded ? `${prefix}${expanded}` : match;
    },
  );
  result = result.replace(
    new RegExp(`${comparisonPrefix}10${exponentPattern}\\b`, "g"),
    (match, prefix, exponent) => {
      const expanded = calculateIntegerPower("10", exponent);
      return expanded ? `${prefix}${expanded}` : match;
    },
  );
  result = result.replace(
    new RegExp(`\\b10${exponentPattern}(?=\\s*(?:≤|≥|<|>))`, "g"),
    (match, exponent) => calculateIntegerPower("10", exponent) || match,
  );
  return result;
}

function canonicalizeReadableScripts(value) {
  let result = String(value || "")
    .replace(/([[(][^,\n]+),(?=[^,\n]+[\])])/g, "$1, ");
  const coefficientPower = new RegExp(`(\\d+)\\s*×\\s*(\\d+)(${SUPERSCRIPT_RUN})(?:\\s*([+-])\\s*(\\d+))?`, "g");
  const numericPower = new RegExp(`(\\d+)(${SUPERSCRIPT_RUN})(?:\\s*([+-])\\s*(\\d+))?`, "g");
  const symbolicPower = new RegExp(`([A-Za-z0-9])(${SUPERSCRIPT_RUN})`, "g");
  const indexedVariable = new RegExp(`([A-Za-z])(${SUBSCRIPT_RUN})`, "g");

  result = result
    .replace(coefficientPower, (match, coefficient, base, script, sign, adjustment) => {
      const expanded = calculateIntegerPower(
        base,
        decodeScriptToken(script, SUPERSCRIPT_VALUES),
        coefficient,
        sign,
        adjustment,
      );
      return expanded || match;
    })
    .replace(numericPower, (match, base, script, sign, adjustment) => {
      const expanded = calculateIntegerPower(
        base,
        decodeScriptToken(script, SUPERSCRIPT_VALUES),
        "1",
        sign,
        adjustment,
      );
      return expanded || match;
    })
    .replace(symbolicPower, (match, base, script) => {
      const exponent = decodeScriptToken(script, SUPERSCRIPT_VALUES);
      if (exponent === "2") return `${base} 的平方`;
      if (exponent === "3") return `${base} 的立方`;
      return `${base} 的 ${exponent} 次方`;
    })
    .replace(indexedVariable, (match, base, script) => {
      const index = decodeScriptToken(script, SUBSCRIPT_VALUES);
      return /^\d+$/.test(index) ? `${base}${index}` : `${base}[${index}]`;
    })
    .replace(/(?<![\d,])\d{4,}(?![\d,])/g, (digits) => formatReadableInteger(digits));

  return result;
}

export function normalizeTemplateMathNotation(value) {
  let result = String(value || "")
    .replace(/<=/g, "≤")
    .replace(/>=/g, "≥")
    .replace(/!=/g, "≠")
    .replace(/\\(?:left|right)\b/g, "")
    .replace(/\\(?:leftarrow|gets)\b/g, "←")
    .replace(/\\(?:rightarrow|to)\b/g, "→")
    .replace(/\\leftrightarrow\b/g, "↔")
    .replace(/\\(?:leq|le)\b/g, "≤")
    .replace(/\\(?:geq|ge)\b/g, "≥")
    .replace(/\\(?:neq|ne)\b/g, "≠")
    .replace(/\\equiv(?![A-Za-z])/g, "≡")
    .replace(/\\notin\b/g, "∉")
    .replace(/\\in\b/g, "∈")
    .replace(/\\times\b/g, "×")
    .replace(/\\cdot\b/g, "·")
    .replace(/\\pm\b/g, "±")
    .replace(/\\infty\b/g, "∞")
    .replace(/\\gcd\b/g, "gcd")
    .replace(/\\lcm\b/g, "lcm")
    .replace(/\\sim\b/g, "～")
    .replace(/\\sum_\{([^{}]+)\}\^\{([^{}]+)\}/g, "∑($1…$2)")
    .replace(/\\sum\b/g, "∑")
    .replace(/\\(?:ldots|cdots|dots)\b/g, "…")
    .replace(/\\pmod\s*\{([^{}]+)\}/g, "(mod $1)")
    .replace(/\\(?:bmod|mod)\b/g, "mod")
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, "√($1)")
    .replace(/\\(?:text|mathrm|operatorname)\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\[\[\]()]/g, "")
    .replace(/\$([^$\n]+)\$/g, "$1")
    // Unknown commands degrade to readable text instead of leaking raw LaTeX.
    .replace(/\\([A-Za-z]+)\b/g, "$1");

  result = result
    .replace(/([A-Za-z])_\{([A-Za-z0-9+\-=]{1,8})\}/g, (match, base, token) => {
      const converted = convertScriptToken(token, SUBSCRIPT_CHARACTERS);
      return converted ? `${base}${converted}` : match;
    })
    .replace(/([A-Za-z])_([A-Za-z0-9])\b/g, (match, base, token) => {
      const converted = convertScriptToken(token, SUBSCRIPT_CHARACTERS);
      return converted ? `${base}${converted}` : match;
    })
    .replace(/([A-Za-z0-9)\]])\^\{([A-Za-z0-9+\-=]{1,8})\}/g, (match, base, token) => {
      const converted = convertScriptToken(token, SUPERSCRIPT_CHARACTERS);
      return converted ? `${base}${converted}` : match;
    })
    .replace(/([A-Za-z0-9)\]])\^([+\-]?[0-9]+|[ni])\b/g, (match, base, token) => {
      const converted = convertScriptToken(token, SUPERSCRIPT_CHARACTERS);
      return converted ? `${base}${converted}` : match;
    })
    .replace(/([A-Za-z0-9])\^\(([^()\n]+)\)/g, "$1 的 $2 次幂")
    .replace(/\b(\d+)\s*[eE]\s*\+?(\d+)(?:\s*\+\s*(\d+))?\b/g, (match, coefficient, exponent, addition) => {
      if (Number(exponent) > 36) return match;
      const expanded = BigInt(coefficient) * (10n ** BigInt(exponent)) + BigInt(addition || 0);
      return formatReadableInteger(expanded);
    })
    .replace(/(?<=[0-9)\]])\s*\*\s*(?=[0-9A-Za-z([])/g, " × ")
    .replace(/[{}]/g, "")
    .replace(/\s*([←→↔≤≥≠≡∈∉=×±<>])\s*/g, " $1 ")
    .replace(/\s*～\s*/g, "～")
    .replace(/(?<=\d)\s*~\s*(?=[A-Za-z0-9])/g, "～")
    .replace(/([A-Za-z0-9)\]₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ⁰¹²³⁴⁵⁶⁷⁸⁹ⁿⁱ])\s*\+\s*(?=[A-Za-z0-9([₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ⁰¹²³⁴⁵⁶⁷⁸⁹ⁿⁱ])/g, "$1 + ")
    .replace(/ {2,}/g, " ")
    .trim();

  return canonicalizeReadableScripts(expandLikelyCollapsedDecimalPowers(result))
    .replace(/(^|[\s[(,，])-(?=\d)/g, "$1−")
    .replace(/ {2,}/g, " ")
    .trim();
}

function normalizeConstraintBlock(value) {
  return String(value || "")
    .split("\n")
    .flatMap((line) => line
      .replace(/^•\s*/, "")
      .replace(/\s+(?=(?:[−-]?\d[\d,]*(?:\.\d+)?)\s*[≤<])/g, "\n")
      .replace(/\s+(?=注意(?:事项)?[：:]?)/g, "\n")
      .split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `• ${line}`)
    .join("\n");
}

function expandInlineStructure(value) {
  return String(value || "")
    .replace(/\s*(?=(?:操作|步骤)\s*\d+\s*[：:])/g, "\n")
    .replace(/\s*(?=第(?:[一二三四五六七八九十百]+|\d+)行\s*[：:])/g, "\n")
    .replace(/\s*(?=接下来\s+(?:\d+|[A-Za-z_]\w*|[一二三四五六七八九十百]+)\s*行(?:[，,：:]|\s))/g, "\n")
    .replace(/(\^\s*\d{1,3})\s+(?=[+-]?\d+\s*(?:≤|≥|<|>|\\(?:leq|le|geq|ge)))/g, "$1\n");
}

function smartJoin(leftValue, rightValue) {
  const left = String(leftValue || "").trimEnd();
  const right = String(rightValue || "").trimStart();
  if (!left) return right;
  if (!right) return left;
  const last = left.at(-1);
  const first = right[0];
  if (/[（(【\[]/.test(last) || /[，。！？；：、,.!?;:）)】\]]/.test(first)) {
    return `${left}${right}`;
  }
  if (CJK_CHARACTER.test(last) && CJK_CHARACTER.test(first)) return `${left}${right}`;
  if (
    (CJK_CHARACTER.test(last) && /[A-Za-z0-9_]/.test(first)) ||
    (/[A-Za-z0-9_]/.test(last) && CJK_CHARACTER.test(first))
  ) {
    return `${left} ${right}`;
  }
  if (/[A-Za-z0-9_）)]/.test(last) && /[A-Za-z0-9_（(]/.test(first)) {
    return `${left} ${right}`;
  }
  return `${left}${right}`;
}

function polishPunctuation(value) {
  return String(value || "")
    .replace(/\s+（/g, "（")
    .replace(/([)\]])(?=[\u3400-\u9fff\uf900-\ufaff])/g, "$1 ")
    .replace(/\s+([，。！？；：、,.!?;:])/g, "$1")
    .replace(/;(?=[A-Za-z0-9])/g, "; ")
    .replace(/(?<!\d),(?=[A-Za-z0-9])/g, ", ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function normalizeContent(lines, preserveWhitespace = false) {
  const normalized = [];
  for (const sourceLine of lines) {
    const trimmedSource = String(sourceLine || "").trim();
    const expandedSource = /^(?:•\s+|\d+\.\s+)/.test(trimmedSource)
      ? sourceLine
      : expandInlineStructure(sourceLine);
    for (const expandedLine of expandedSource.split("\n")) {
      let line = String(expandedLine || "")
        .replace(/[\u00a0\u3000]/g, " ")
        .replace(/\t/g, preserveWhitespace ? "    " : " ");
      line = preserveWhitespace ? line.trimEnd() : line.trim();
      if (!line.trim()) {
        if (preserveWhitespace && normalized.at(-1) !== "" && normalized.length) normalized.push("");
        continue;
      }
      if (!preserveWhitespace) {
        line = normalizeTemplateMathNotation(line)
          .replace(/^-\s+(?=\d)/, "−")
          .replace(/^[*•·]\s+/, "• ")
          .replace(/^-\s+(?=\D)/, "• ")
          .replace(/^(\d+)[)）]\s*/, "$1. ")
          .replace(/ {2,}/g, " ");
      }
      if (
        !preserveWhitespace &&
        normalized.length &&
        !STRUCTURED_LINE.test(line)
      ) {
        normalized[normalized.length - 1] = smartJoin(normalized.at(-1), line);
      } else {
        normalized.push(line);
      }
    }
  }
  while (normalized.at(-1) === "") normalized.pop();
  return preserveWhitespace
    ? normalized.join("\n")
    : normalized.map(polishPunctuation).join("\n");
}

export function optimizeTemplateSummaryFormat(value) {
  const source = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!source) return "";

  const sections = new Map();
  const preamble = [];
  let currentHeading = null;
  for (const line of source.split("\n")) {
    const matched = matchHeading(line);
    if (matched) {
      currentHeading = matched.heading;
      if (!sections.has(currentHeading)) sections.set(currentHeading, []);
      if (matched.content) sections.get(currentHeading).push(matched.content);
      continue;
    }
    if (currentHeading) sections.get(currentHeading).push(line);
    else preamble.push(line);
  }

  const normalizedPreamble = normalizeContent(preamble);
  if (normalizedPreamble) {
    sections.set("题目大意", [normalizedPreamble, ...(sections.get("题目大意") || [])]);
  }
  if (!sections.size) sections.set("题目大意", source.split("\n"));

  const blocks = [];
  for (const heading of STANDARD_ORDER) {
    let content = normalizeContent(
      sections.get(heading) || [],
      heading === "样例" || heading === "样例输入" || heading === "样例输出",
    );
    if (heading === "关键约束") content = normalizeConstraintBlock(content);
    if (content) blocks.push(`【${heading}】\n${content}`);
  }
  return blocks.join("\n\n").slice(0, 1200).trim();
}

export function parseTemplateSummary(value) {
  const source = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!source) return [];
  const sections = [];
  let active = null;
  for (const line of source.split("\n")) {
    const matched = line.trim().match(/^【([^】]+)】\s*$/);
    if (matched) {
      active = { heading: matched[1], lines: [] };
      sections.push(active);
    } else {
      if (!active) {
        active = { heading: "题目大意", lines: [] };
        sections.push(active);
      }
      active.lines.push(line);
    }
  }
  return sections
    .map((section) => ({
      ...section,
      content: normalizeContent(
        section.lines,
        section.heading === "样例" || section.heading === "样例输入" || section.heading === "样例输出",
      ),
    }))
    .filter((section) => section.content);
}
