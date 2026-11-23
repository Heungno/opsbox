// node prune.cjs <file.css> [--dry]  (winners.json 기준)
// 맞은 적 있는 규칙에서 한 번도 이기지 못한 선언을 지웁니다. 맞은 적 없는 규칙은 목록만 출력.
const fs = require('fs'); const path = require('path');
const [file, flag] = process.argv.slice(2);
const name = path.basename(file);
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'winners.json'), 'utf8'))[name];
const used = new Set(data.used); const matched = new Set(data.matchedRules);
const css = fs.readFileSync(file, 'utf8');
const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
const lineStarts = [0]; for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
const pos = (i) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= i) lo = mid; else hi = mid - 1; } return `${lo}:${i - lineStarts[lo]}`; };

const edits = []; const unmatched = []; let removedDecls = 0, removedRules = 0;
// 규칙 찾기: '{' 앞 prelude가 @로 시작하지 않는 블록 (중첩 1단계 @media까지)
function scan(from, to, depthMedia) {
  let i = from, start = from;
  while (i < to) {
    const ch = text[i];
    if (ch === '{') {
      const prelude = text.slice(start, i).trim();
      let depth = 1, j = i + 1; while (depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
      const close = j - 1;
      if (prelude.startsWith('@media') || prelude.startsWith('@supports')) scan(i + 1, close, true);
      else if (!prelude.startsWith('@')) rule(prelude, start, i, close);
      i = j; start = j; continue;
    }
    if (ch === ';') start = i + 1;
    i++;
  }
}
function rule(prelude, start, open, close) {
  const key = pos(open + 1);
  if (!matched.has(key)) { unmatched.push(`${pos(open).split(':')[0] * 1 + 1}: ${prelude.replace(/\s+/g, ' ')}`); return; }
  // 선언 위치
  const decls = []; let s = open + 1;
  for (let k = open + 1; k <= close; k++) {
    if (text[k] === ';' || k === close) {
      const seg = text.slice(s, k); const lead = seg.length - seg.trimStart().length;
      if (seg.trim()) decls.push({ start: s + lead, end: text[k] === ';' ? k + 1 : k });
      s = k + 1;
    }
  }
  const dead = decls.filter((d) => !used.has(pos(d.start)));
  if (!dead.length) return;
  if (dead.length === decls.length) {
    const lead = text.slice(start, open).length - text.slice(start, open).trimStart().length;
    edits.push([start + lead, close + 1]); removedRules++; removedDecls += dead.length; return;
  }
  for (const d of dead) { let e = d.end; while (text[e] === ' ' || text[e] === '\t') e++; if (text[e] === '\n') e++; let b = d.start; while (b > 0 && (text[b - 1] === ' ' || text[b - 1] === '\t')) b--; edits.push([b, e]); removedDecls++; }
}
scan(0, text.length, false);
let out = css;
for (const [s, e] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + out.slice(e);
// 빈 @media 지우기
out = out.replace(/@media[^{]*\{\s*\}\n?/g, '').replace(/\n[ \t]*\n([ \t]*\n)+/g, '\n\n');
console.log(`${name}: removed ${removedDecls} declarations (${removedRules} whole rules); unmatched rules: ${unmatched.length}`);
if (unmatched.length) console.log(unmatched.join('\n'));
if (flag !== '--dry') fs.writeFileSync(file, out);
