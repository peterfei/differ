import { createHighlighter, type Highlighter } from "shiki";

let highlighter: Highlighter | null = null;
let initPromise: Promise<Highlighter> | null = null;

const extToLang: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  rs: "rust",
  py: "python",
  go: "go",
  java: "java",
  rb: "ruby",
  php: "php",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  swift: "swift",
  kt: "kotlin",
  vue: "vue",
  html: "html",
  css: "css",
  scss: "scss",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  sql: "sql",
  sh: "shellscript",
  bash: "shellscript",
  md: "markdown",
  graphql: "graphql",
};

export function detectLanguage(filePath: string): string {
  const name = filePath.toLowerCase();
  // Dockerfile special case
  if (name.endsWith("dockerfile")) return "dockerfile";
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return extToLang[ext] || "text";
}

export async function getHighlighter(): Promise<Highlighter> {
  if (highlighter) return highlighter;
  if (initPromise) return initPromise;

  initPromise = createHighlighter({
    themes: ["github-dark"],
    langs: [
      "typescript", "tsx", "javascript", "jsx", "rust", "python", "go",
      "java", "ruby", "php", "c", "cpp", "csharp", "swift", "kotlin",
      "vue", "html", "css", "scss", "json", "yaml", "toml", "sql",
      "shellscript", "markdown",
    ],
  }).then((hl) => {
    highlighter = hl;
    return hl;
  });

  return initPromise;
}

/**
 * Lines of a file content, each as its HTML highlighted representation
 * Index is 1-based line number.
 */
export type HighlightedLines = Record<number, string>;

/**
 * Highlight a full file and return a map of 1-based line number → HTML.
 * The HTML is the inner content of a <span class="line"> element.
 */
export async function highlightFile(
  code: string,
  lang: string,
): Promise<HighlightedLines> {
  try {
    const hl = await getHighlighter();
    const html = hl.codeToHtml(code, { lang, theme: "github-dark" });

    const result: HighlightedLines = {};
    let lineNo = 1;

    // Shiki v3 wraps each line in <span class="line">
    const lineRegex = /<span class="line">(.*?)<\/span>/gs;
    let match;
    while ((match = lineRegex.exec(html)) !== null) {
      result[lineNo] = match[1].replace(/<br>/g, "");
      lineNo++;
    }

    // Fallback: if no line spans found, split by newlines
    if (lineNo === 1) {
      const inner = html
        .replace(/<\/?pre[^>]*>/g, "")
        .replace(/<\/?code[^>]*>/g, "")
        .trim();
      for (const raw of inner.split("\n")) {
        result[lineNo] = raw.trim();
        lineNo++;
      }
    }

    return result;
  } catch {
    return {};
  }
}

/**
 * Highlight a single line of code (best-effort without full file context).
 */
export async function highlightLine(
  code: string,
  lang: string,
): Promise<string> {
  try {
    const hl = await getHighlighter();
    const html = hl.codeToHtml(code, { lang, theme: "github-dark" });

    const lineMatch = /<span class="line">(.*?)<\/span>/s.exec(html);
    if (lineMatch) return lineMatch[1];
    // Fallback: strip pre/code tags
    return html
      .replace(/<\/?pre[^>]*>/g, "")
      .replace(/<\/?code[^>]*>/g, "")
      .trim();
  } catch {
    return escapeHtml(code);
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
