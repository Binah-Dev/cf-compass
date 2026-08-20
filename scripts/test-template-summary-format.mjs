import assert from "node:assert/strict";
import {
  normalizeTemplateMathNotation,
  optimizeTemplateSummaryFormat,
  parseTemplateSummary,
} from "../src/lib/template-summary-format.js";

assert.equal(
  normalizeTemplateMathNotation(String.raw`\[a_x\leftarrow a_x+d\]`),
  "a[x] ← a[x] + d",
);
assert.equal(
  normalizeTemplateMathNotation(String.raw`1 \le n \le 2 \times 10^5`),
  "1 ≤ n ≤ 200,000",
);
assert.equal(
  normalizeTemplateMathNotation("-10^9 ≤ d ≤ 10^9"),
  "−1,000,000,000 ≤ d ≤ 1,000,000,000",
);
assert.equal(
  normalizeTemplateMathNotation("-2^31 ≤ k < 2^31"),
  "−2,147,483,648 ≤ k < 2,147,483,648",
);
assert.equal(
  normalizeTemplateMathNotation(String.raw`\[\sum_{i=x_1}^{x_2}\sum_{j=y_1}^{y_2}a[i][j]\]`),
  "∑(i = x1…x2)∑(j = y1…y2)a[i][j]",
);
assert.equal(
  normalizeTemplateMathNotation(String.raw`\(\gcd(a,b)\), \(\operatorname{lcm}(a,b)\), 1\sim n`),
  "gcd(a, b), lcm(a, b), 1～n",
);
assert.equal(
  normalizeTemplateMathNotation(String.raw`a_i\times x_i\equiv1\pmod {MOD}`),
  "a[i] × x[i] ≡ 1(mod MOD)",
);
assert.equal(normalizeTemplateMathNotation("x^(MOD − 2) mod MOD"), "x 的 MOD − 2 次幂 mod MOD");
assert.equal(normalizeTemplateMathNotation("MOD=1e9+7"), "MOD = 1,000,000,007");
assert.equal(normalizeTemplateMathNotation("O(n³ + 2ⁿ)"), "O(n 的立方 + 2 的 n 次方)");
assert.equal(
  normalizeTemplateMathNotation("[−2³¹,2³¹)；每次取 1~m 个"),
  "[−2,147,483,648, 2,147,483,648)；每次取 1～m 个",
);
assert.equal(
  normalizeTemplateMathNotation("1 ≤ n,m ≤ 105；总长度不超过 105；−109 ≤ a ≤ 109"),
  "1 ≤ n,m ≤ 100,000；总长度不超过 100,000；−1,000,000,000 ≤ a ≤ 1,000,000,000",
);
assert.equal(normalizeTemplateMathNotation("1 ≤ N ≤ 2∗104"), "1 ≤ N ≤ 20,000");
assert.equal(normalizeTemplateMathNotation("tree[105][105]"), "tree[105][105]");
assert.equal(normalizeTemplateMathNotation("1 ≤ n ≤ 1000"), "1 ≤ n ≤ 1,000");
assert.match(
  optimizeTemplateSummaryFormat("【题目大意】\n判断 [l1,r1]和 [l2,r2]这两个区间；执行 xor （异或）。"),
  /判断 \[l1, r1\] 和 \[l2, r2\] 这两个区间；执行 xor（异或）。/,
);
assert.match(optimizeTemplateSummaryFormat("【输出】\n- 1"), /【输出】\n−1/);
assert.equal(
  optimizeTemplateSummaryFormat("【关键约束】\n1 ≤ n ≤ 10^5 1 ≤ m ≤ 2*10^5"),
  "【关键约束】\n• 1 ≤ n ≤ 100,000\n• 1 ≤ m ≤ 200,000",
);

const [description, input] = parseTemplateSummary(`【题目大意】
共有 2 种操作。操作 1：合并集合。操作 2：查询集合。

【输入】
第一行：n q 第二行：a1…an 接下来 q 行，每行一个操作。1 ≤ n,q ≤ 2 × 10^5 1 ≤ a[i] ≤ 10^9
-10^9 ≤ d ≤ 10^9`);

assert.match(description.content, /操作 1：合并集合。\n操作 2：查询集合。/);
assert.match(input.content, /第一行：n q\n第二行：a1…an\n接下来 q 行/);
assert.match(input.content, /200,000\n1 ≤ a\[i\] ≤ 1,000,000,000/);
assert.match(input.content, /−1,000,000,000 ≤ d ≤ 1,000,000,000/);
assert.doesNotMatch(input.content, /• 1,000,000,000 ≤ d/);

console.log("template summary format regression checks passed");
