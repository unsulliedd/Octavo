// Long generated documents, about 3000 lines each: plain prose, heavy math, many `$` prices, and tables, code and Mermaid.
import guide from "../../fidelity/fixtures/field-guide.md?raw";

/** Repeats `block` until the document has about `lines` lines. */
const toLines = (block: (i: number) => string, lines = 3000) => {
  const parts: string[] = [];
  for (let i = 0, n = 0; n < lines; i++) {
    parts.push(block(i));
    n += parts[i].split("\n").length + 1;
  }
  return parts.join("\n\n") + "\n";
};

export const longDocs: Record<string, string> = {
  plain: toLines(() => guide),
  math: toLines(
    (i) =>
      `## Section ${i}\n\nThe energy $E = mc^2$ and the sum $\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$ for $n \\ge ${i}$.\n\n` +
      `$$\n\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2} + ${i}\n$$\n\n` +
      `With $\\alpha_${i}$, $\\beta$ and $\\gamma$ we have $\\alpha + \\beta = \\gamma$.`,
  ),
  prices: toLines(
    (i) =>
      `## Order ${i}\n\nThe basic plan is $4.99 a month, the plus plan $9.99, the team plan $19 and the business plan $49, ` +
      `against $5, $10, $20 and $50 last year: a saving of $0.01 to $1 each.\n\n` +
      `| Item | Price | Was |\n|---|---|---|\n| Tea | $3.50 | $4 |\n| Cake | $6 | $7.25 |`,
  ),
  mixed: toLines(
    (i) =>
      `## Part ${i}\n\n| Name | Kind | Size | Notes |\n|---|---|---|---|\n` +
      Array.from({ length: 6 }, (_, r) => `| row ${r} | \`kind-${r}\` | ${r * 10} | **note** ${i} |`).join("\n") +
      `\n\n\`\`\`ts\nexport function f${i}(x: number) {\n  return x * ${i} + 1;\n}\n\`\`\`\n\n` +
      (i % 12 === 0 ? `\`\`\`mermaid\ngraph TD\n  A${i} --> B${i}\n  B${i} --> C${i}\n\`\`\`\n\n` : "") +
      `Some text about part ${i}, with a [link](https://example.com/${i}).`,
  ),
};
