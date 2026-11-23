/*
 * 계산된 스타일(computed style) 스냅샷 비교 (순수 함수)
 * 스냅샷: 요소 경로 → { CSS 속성 → 값 }
 */

export type StyleSnapshot = Record<string, Record<string, string>>;
export interface StyleDiff {
  path: string;
  property: string;
  before?: string;
  after?: string;
}

const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const rgb = (r: number, g: number, b: number, a?: number) =>
  a === undefined || a >= 1 ? `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})` : `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${round(a, 2)})`;

/** 값 맞추기: 색은 정수 rgb/rgba(알파 소수 2자리), px는 소수 2자리. color-mix 계산 오차를 없앱니다. */
export function normalizeValue(_property: string, value: string): string {
  let text = value
    .replace(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/g, (_m, r, g, b, a) =>
      rgb(Number(r) * 255, Number(g) * 255, Number(b) * 255, a === undefined ? undefined : Number(a)))
    .replace(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/g, (_m, r, g, b, a) =>
      rgb(Number(r), Number(g), Number(b), a === undefined ? undefined : Number(a)));
  text = text.replace(/(-?[\d.]+)px/g, (_m, n) => `${round(Number(n), 2)}px`);
  return text;
}

export function diffStyles(before: StyleSnapshot, after: StyleSnapshot): StyleDiff[] {
  const diffs: StyleDiff[] = [];
  for (const [path, props] of Object.entries(before)) {
    const next = after[path];
    if (!next) {
      diffs.push({ path, property: '*', before: 'present', after: undefined });
      continue;
    }
    for (const property of new Set([...Object.keys(props), ...Object.keys(next)])) {
      const a = props[property] === undefined ? undefined : normalizeValue(property, props[property]);
      const b = next[property] === undefined ? undefined : normalizeValue(property, next[property]);
      if (a !== b) diffs.push({ path, property, before: a, after: b });
    }
  }
  for (const path of Object.keys(after)) if (!before[path]) diffs.push({ path, property: '*', before: undefined, after: 'present' });
  return diffs;
}
