export interface FormularPage {
  params: Record<string, string>;
  categories: string[];
}

const FORMULAR_START = /\{\{\s*(?:Шаблон\s*:\s*)?Формуляр\s*(?=\||\}\})/i;
const CATEGORY = /\[\[\s*Категория\s*:\s*([^\]|]+?)\s*(?:\|[^\]]*)?\]\]/gi;

/** Splits the template body on top-level pipes, ignoring pipes inside [[...]] and {{...}}. */
function splitTemplateBody(text: string, start: number): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const pair = text.slice(i, i + 2);
    if (pair === "{{" || pair === "[[") {
      depth++;
      current += pair;
      i += 2;
      continue;
    }
    if (pair === "}}" || pair === "]]") {
      if (depth === 0 && pair === "}}") {
        parts.push(current);
        return parts;
      }
      depth = Math.max(0, depth - 1);
      current += pair;
      i += 2;
      continue;
    }
    const ch = text[i];
    if (ch === "|" && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
    i++;
  }
  parts.push(current); // unterminated template: keep what was read
  return parts;
}

export function parseFormular(wikitext: string): FormularPage | null {
  const match = FORMULAR_START.exec(wikitext);
  if (!match) return null;

  const params: Record<string, string> = {};
  for (const part of splitTemplateBody(wikitext, match.index + match[0].length)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!key) continue;
    if (value) params[key] = value;
    else delete params[key];
  }

  const categories = [...wikitext.matchAll(CATEGORY)].map((m) => m[1]);
  return { params, categories };
}
