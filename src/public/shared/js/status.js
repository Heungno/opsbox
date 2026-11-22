/*
 * 점검 상태 표시 이름 (공통코드 healthStatuses)
 *
 * 화면은 상태 값(Healthy·Warning·Critical·NotCollected…)을 그대로 보여 주지 않고 statusLabel()로 이름을 씁니다.
 * 이름은 공통코드 관리의 '점검 상태'를 따르고, 불러오기 전·실패 시에는 기본 한글 이름을 씁니다.
 * 화면 스크립트는 그리기 전에 loadStatusLabels()를 한 번 기다립니다.
 */

const DEFAULT_LABELS = {
  Healthy: '정상',
  Warning: '경고',
  Critical: '위험',
  Unknown: '알 수 없음',
  NotChecked: '미점검',
  NotCollected: '미수집',
};

let labels = { ...DEFAULT_LABELS };
let loading;

/** 상태 값 → 표시 이름 (모르는 값은 그대로, 값이 없으면 '미판정') */
export function statusLabel(value) {
  if (value === undefined || value === null || value === '') return '미판정';
  return labels[value] ?? String(value);
}

/** 공통코드 healthStatuses([{ value, label }])로 이름을 바꿉니다. 이름이 빈 코드는 무시합니다. */
export function setStatusLabels(codes) {
  for (const code of Array.isArray(codes) ? codes : []) {
    if (code && typeof code.value === 'string' && typeof code.label === 'string' && code.label.trim()) labels[code.value] = code.label.trim();
  }
}

/** 기본 이름으로 되돌림 (테스트용) */
export function resetStatusLabels() {
  labels = { ...DEFAULT_LABELS };
  loading = undefined;
}

/** 공통코드에서 상태 이름을 한 번 불러옵니다. 실패해도 기본 이름으로 계속합니다. */
export function loadStatusLabels() {
  loading ??= import('./api.js')
    .then(({ api }) => api('/api/common-codes'))
    .then((codes) => setStatusLabels(codes?.healthStatuses))
    .catch(() => {});
  return loading;
}
