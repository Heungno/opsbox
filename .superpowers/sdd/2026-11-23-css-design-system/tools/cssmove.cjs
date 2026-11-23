// CSS 규칙 옮기기 도구 (작업용, 저장소에 안 넣음)
// units(css): 최상위 규칙 / @media 안 규칙을 선택자 하나씩으로 나눈 목록 {media, selector, body, index}
// 그 밖의 @규칙(@keyframes, @font-face, @supports 등)은 통째로 {raw}
const fs = require('fs');

function strip(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

function blocks(text) {
  // 최상위 블록 나누기: [{prelude, body}] 와 ;로 끝나는 @문 {raw}
  const out = []; let depth = 0, start = 0, preludeEnd = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') { if (depth === 0) preludeEnd = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0) { out.push({ prelude: text.slice(start, preludeEnd).trim(), body: text.slice(preludeEnd + 1, i) }); start = i + 1; } }
    else if (ch === ';' && depth === 0) { out.push({ raw: text.slice(start, i + 1).trim() }); start = i + 1; }
  }
  return out;
}

function splitSelectors(prelude) {
  const parts = []; let depth = 0, cur = '';
  for (const ch of prelude) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.map((p) => p.replace(/\s+/g, ' '));
}

function units(css) {
  const list = []; let index = 0;
  for (const b of blocks(strip(css))) {
    if (b.raw !== undefined) { list.push({ raw: b.raw, index: index++ }); continue; }
    if (b.prelude.startsWith('@media')) {
      for (const inner of blocks(b.body)) {
        if (inner.raw !== undefined) continue;
        for (const s of splitSelectors(inner.prelude)) list.push({ media: b.prelude.replace(/\s+/g, ' '), selector: s, body: inner.body, index: index++ });
      }
    } else if (b.prelude.startsWith('@')) list.push({ raw: `${b.prelude} {${b.body}}`, index: index++, at: b.prelude });
    else for (const s of splitSelectors(b.prelude)) list.push({ media: '', selector: s, body: b.body, index: index++ });
  }
  return list;
}

function decls(body) {
  // 선언 나누기 (; 기준, url(...) 안 ; 없다고 가정)
  return body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':'); return { prop: d.slice(0, i).trim(), value: d.slice(i + 1).trim() };
  });
}

function mergeBodies(bodies) {
  // 같은 선택자 정의 여러 개를 cascade 순서대로 하나로: 뒤가 이김, 단 !important는 !important만 이김
  const map = new Map();
  for (const body of bodies) for (const { prop, value } of decls(body)) {
    const imp = /!important\s*$/.test(value); const prev = map.get(prop);
    if (prev && prev.imp && !imp) continue;
    map.delete(prop); map.set(prop, { value, imp });
  }
  return [...map].map(([prop, { value }]) => `  ${prop}: ${value};`).join('\n');
}

function render(list, { merge = true } = {}) {
  // 같은 (media, selector)는 마지막 위치에 합쳐서 하나로. 연속한 같은 media는 한 블록, 같은 본문 연속 선택자는 묶음
  let items = list;
  if (merge) {
    // 같은 (media, selector)를 마지막 위치로 합치되, 사이에 같은 계열 속성을 정하는 다른 규칙이 있으면 그 선언은 원래 자리에 둡니다
    const family = (p) => (p.startsWith("--") ? p : p.replace(/^-webkit-/, "").split("-")[0]);
    const keyOf = (u) => u.media + "\u0000" + u.selector;
    const groups = new Map();
    for (const u of list) { if (u.raw) continue; const k = keyOf(u); (groups.get(k) ?? groups.set(k, []).get(k)).push(u); }
    const pos = new Map(list.map((u, i) => [u, i]));
    const residual = new Map();
    const finalBodies = new Map();
    for (const [k, g] of groups) {
      const last = g.at(-1); const lastPos = pos.get(last); const moved = [];
      for (const u of g) {
        if (u === last) { moved.push(u.body); continue; }
        const keep = [], move = [];
        for (const d of decls(u.body)) {
          const fam = family(d.prop); let conflict = false;
          for (let i = pos.get(u) + 1; i < lastPos && !conflict; i++) { const o = list[i]; if (o.raw || keyOf(o) === k) continue; conflict = decls(o.body).some((x) => family(x.prop) === fam); }
          (conflict ? keep : move).push(d.prop + ": " + d.value);
        }
        if (keep.length) residual.set(u, keep.join(";"));
        if (move.length) moved.push(move.join(";"));
      }
      finalBodies.set(last, mergeBodies(moved));
    }
    items = list.filter((u) => u.raw || finalBodies.has(u) || residual.has(u))
      .map((u) => (u.raw ? u : { ...u, merged: finalBodies.get(u) ?? mergeBodies([residual.get(u)]) }));
  } else items = list.map((u) => (u.raw ? u : { ...u, merged: decls(u.body).map(({ prop, value }) => `  ${prop}: ${value};`).join('\n') }));
  // 같은 media·같은 본문이 연속이면 선택자 묶기
  const rules = [];
  for (const u of items) {
    const last = rules.at(-1);
    if (!u.raw && last && !last.raw && last.media === u.media && last.merged === u.merged) last.selectors.push(u.selector);
    else rules.push(u.raw ? u : { media: u.media, selectors: [u.selector], merged: u.merged });
  }
  let out = ''; let open = null;
  for (const r of rules) {
    const media = r.raw ? null : r.media || null;
    if (open !== media) { if (open) out += '}\n\n'; if (media) out += `${media} {\n`; open = media; }
    if (r.raw) { out += `${r.raw}\n\n`; continue; }
    const pad = media ? '  ' : '';
    if (!r.merged) continue;
    out += `${pad}${r.selectors.join(`,\n${pad}`)} {\n${r.merged.split('\n').map((l) => pad + l).join('\n')}\n${pad}}\n${media ? '' : '\n'}`;
  }
  if (open) out += '}\n';
  return out.replace(/\n{3,}/g, '\n\n');
}

module.exports = { units, render, splitSelectors, decls, mergeBodies, strip };

if (require.main === module) {
  // 사용: node cssmove.cjs list legacy.css  → 첫 클래스별 개수
  const [cmd, file] = process.argv.slice(2);
  const us = units(fs.readFileSync(file, 'utf8'));
  if (cmd === 'list') {
    const c = {};
    for (const u of us) { if (u.raw) { c['@raw ' + (u.at || u.raw.slice(0, 30))] = (c['@raw ' + (u.at || u.raw.slice(0, 30))] || 0) + 1; continue; } const m = u.selector.replace(/^:root(\[[^\]]*\])?\s*/, '').match(/^[.#]?[a-zA-Z][\w-]*/); const k = m ? m[0].replace(/^(\.[a-z]+)-.*/, '$1-*') : u.selector; c[k] = (c[k] || 0) + 1; }
    console.log(Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'));
  }
}
