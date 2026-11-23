// 원문에서 선택자 빼기 (주석·나머지 그대로). shouldRemove(media, selector)
const { splitSelectors } = require('./cssmove.cjs');
const blank = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
function blocksAt(text, from, to) {
  const out = []; let depth = 0, start = from, open = -1;
  for (let i = from; i < to; i++) {
    const ch = text[i];
    if (ch === '{') { if (depth === 0) open = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0) { out.push({ start, open, close: i }); start = i + 1; } }
    else if (ch === ';' && depth === 0) start = i + 1;
  }
  return out;
}
function removeSelectors(css, shouldRemove) {
  const text = blank(css); const edits = [];
  const handleRule = (b, media) => {
    const raw = text.slice(b.start, b.open); const lead = raw.length - raw.trimStart().length;
    const pStart = b.start + lead; const prelude = raw.trim();
    const parts = splitSelectors(prelude); const keep = parts.filter((p) => !shouldRemove(media, p));
    if (keep.length === parts.length) return 'kept';
    if (!keep.length) { edits.push([pStart, b.close + 1, '']); return 'gone'; }
    edits.push([pStart, b.open, keep.join(',\n' + ' '.repeat(media ? 2 : 0)) + ' ']); return 'kept';
  };
  for (const b of blocksAt(text, 0, text.length)) {
    const prelude = text.slice(b.start, b.open).trim();
    if (prelude.startsWith('@media')) {
      const media = prelude.replace(/\s+/g, ' ');
      const inner = blocksAt(text, b.open + 1, b.close);
      const before = edits.length; const results = inner.map((ib) => handleRule(ib, media));
      if (results.every((r) => r === 'gone')) { edits.splice(before); const raw = text.slice(b.start, b.open); edits.push([b.start + raw.length - raw.trimStart().length, b.close + 1, '']); }
    } else if (!prelude.startsWith('@')) handleRule(b, '');
  }
  let out = css;
  for (const [s, e, r] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + r + out.slice(e);
  return out.replace(/\n[ \t]*\n([ \t]*\n)+/g, '\n\n');
}
module.exports = { removeSelectors };
