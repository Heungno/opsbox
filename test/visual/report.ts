/*
 * 기준·현재 스크린샷을 나란히 보는 비교 페이지. 차이 이미지와 차이 비율은 페이지 안에서 캔버스로 계산합니다.
 */
import fs from 'node:fs';
import path from 'node:path';

export function writeReport(outDir: string, names: string[], notes: Record<string, string> = {}): string {
  const rows = names
    .filter((name) => fs.existsSync(path.join(outDir, 'baseline', `${name}.png`)) && fs.existsSync(path.join(outDir, 'current', `${name}.png`)))
    .map((name) => `<section data-name="${name}"><h2>${name} <span class="ratio"></span></h2>${notes[name] ? `<p class="note">${notes[name]}</p>` : ''}
<div class="pair"><figure><figcaption>전</figcaption><img src="baseline/${name}.png"></figure><figure><figcaption>후</figcaption><img src="current/${name}.png"></figure><figure><figcaption>차이</figcaption><canvas></canvas></figure></div></section>`)
    .join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>OpsBox 화면 전·후 비교</title>
<style>body{font:14px sans-serif;margin:16px;background:#f4f4f4}section{background:#fff;margin:0 0 24px;padding:12px}.pair{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;align-items:start}img,canvas{width:100%;border:1px solid #ccc}.ratio{color:#b00}.note{color:#444}</style>
<h1>화면 전·후 비교</h1><p>차이 비율이 큰 순서로 정렬합니다. 빨간 점이 바뀐 픽셀입니다.</p><main>${rows}</main>
<script>
const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
(async () => {
  const sections = [...document.querySelectorAll('section')];
  for (const s of sections) {
    const [a, b] = await Promise.all([...s.querySelectorAll('img')].map((img) => load(img.src)));
    const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
    const read = (img) => { const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = read(a), db = read(b), canvas = s.querySelector('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'), out = ctx.createImageData(w, h); let changed = 0;
    for (let p = 0; p < da.length; p += 4) {
      const d = Math.abs(da[p] - db[p]) + Math.abs(da[p + 1] - db[p + 1]) + Math.abs(da[p + 2] - db[p + 2]);
      if (d > 30) { changed++; out.data.set([220, 0, 0, 255], p); } else { const g = (db[p] + db[p + 1] + db[p + 2]) / 3; out.data.set([g, g, g, 60], p); }
    }
    ctx.putImageData(out, 0, 0);
    s.dataset.ratio = changed / (w * h); s.querySelector('.ratio').textContent = (100 * changed / (w * h)).toFixed(2) + '%' + (a.height !== b.height ? ' (높이 ' + a.height + '→' + b.height + ')' : '');
  }
  sections.sort((x, y) => y.dataset.ratio - x.dataset.ratio).forEach((s) => document.querySelector('main').append(s));
})();
</script>`;
  const file = path.join(outDir, 'report.html');
  fs.writeFileSync(file, html);
  return file;
}
