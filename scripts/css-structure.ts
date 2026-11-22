/*
 * CSS 구조 검사 (디자인 체계 규칙): 직접 색, 이유 없는 !important, 파일 간 중복 선택자, @import 목록
 * 라이브러리 없이 주석을 지우고 중괄호 깊이로 규칙을 나눕니다.
 */

export interface Rule {
  selector: string;
  body: string;
  /** 선언부가 시작하는 줄 (1부터) */
  line: number;
  /** 감싼 @규칙 (예: '@media (max-width: 900px)') */
  atRules: string[];
}

/** 주석을 같은 길이의 공백으로 (줄 번호 유지) */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;

export function parseRules(css: string): Rule[] {
  const text = stripComments(css);
  const rules: Rule[] = [];
  const stack: { prelude: string }[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      stack.push({ prelude: text.slice(start, i).trim() });
      start = i + 1;
    } else if (ch === '}') {
      const open = stack.pop();
      if (open && !open.prelude.startsWith('@')) {
        const bodyStart = start;
        rules.push({ selector: open.prelude, body: text.slice(bodyStart, i), line: lineAt(text, bodyStart), atRules: stack.map((s) => s.prelude) });
      }
      start = i + 1;
    } else if (ch === ';' && stack.length === 0) {
      start = i + 1; // @import 등
    }
  }
  return rules;
}

const isTokenBlock = (selector: string) => selector.split(',').every((part) => /^:root(\[[^\]]+\])?$/.test(part.trim()));

const COLOR_NAMES = ['white', 'black', 'red', 'green', 'blue', 'gray', 'grey', 'silver', 'orange', 'yellow', 'navy', 'maroon', 'purple', 'teal'];
const COLOR_PATTERN = new RegExp(`#[0-9a-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?)\\([^)]*\\)|\\b(?:${COLOR_NAMES.join('|')})\\b`, 'g');

/** 직접 적은 색. allowInTokenBlocks면 :root 블록의 --토큰 선언은 제외 */
export function findLiteralColors(css: string, { allowInTokenBlocks }: { allowInTokenBlocks: boolean }): { line: number; value: string }[] {
  const found: { line: number; value: string }[] = [];
  const text = stripComments(css).replace(/url\([^)]*\)/g, (m) => m.replace(/[^\n]/g, ' '));
  for (const rule of parseRules(text)) {
    let offset = 0;
    for (const declaration of rule.body.split(';')) {
      const property = declaration.split(':')[0].trim();
      const skip = (allowInTokenBlocks && isTokenBlock(rule.selector) && property.startsWith('--')) || property === 'content';
      if (!skip) {
        for (const match of declaration.slice(declaration.indexOf(':') + 1).matchAll(COLOR_PATTERN)) {
          const index = offset + declaration.indexOf(':') + 1 + (match.index ?? 0);
          found.push({ line: rule.line + rule.body.slice(0, index).split('\n').length - 1, value: match[0] });
        }
      }
      offset += declaration.length + 1;
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

/** 같은 줄에 주석이 없고 바로 윗줄이 주석만 있는 줄도 아닌 !important 줄 번호 */
export function findImportantWithoutReason(css: string): number[] {
  const lines = css.split('\n');
  return lines.flatMap((line, i) => (/!important/.test(line) && !/\/\*/.test(line) && !/^\s*\/\*.*\*\/\s*$/.test(lines[i - 1] ?? '') ? [i + 1] : []));
}

/** 선택자 → 정의된 파일 목록 (:root 토큰 블록 제외) */
export function selectorsByFile(files: Record<string, string>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [file, css] of Object.entries(files)) {
    for (const rule of parseRules(css)) {
      if (isTokenBlock(rule.selector) || rule.atRules.some((at) => at.startsWith('@keyframes') || at.startsWith('@font-face'))) continue;
      for (const selector of rule.selector.split(',').map((part) => part.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
        const list = map.get(selector) ?? [];
        if (!list.includes(file)) list.push(file);
        map.set(selector, list);
      }
    }
  }
  return map;
}

export function findDuplicateSelectorsAcrossFiles(files: Record<string, string>): { selector: string; files: string[] }[] {
  return [...selectorsByFile(files)].filter(([, list]) => list.length > 1).map(([selector, list]) => ({ selector, files: list }));
}

/** @import 경로 (./ 제거) */
export function importedFiles(appCss: string): string[] {
  return [...stripComments(appCss).matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)].map((m) => m[1].replace(/^\.\//, ''));
}
