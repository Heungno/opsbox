/*
 * 화면 공통코드 도우미
 *
 * 화면에 보이는 이름과 선택 목록은 하드코딩하지 않고 공통코드(GET /api/common-codes)에서 가져옵니다.
 * - codeLabel(): 이름. 모르는 값이나 불러오기 전에는 값을 그대로 보여 줍니다(화면이 멈추지 않게).
 *   비활성 코드도 서버가 주는 _labels로 이름을 찾습니다(예전 데이터 표시).
 * - codeList(): 선택 목록. 사용 중인 코드만, 공통코드 순서대로.
 * 화면 스크립트는 그리기 전에 loadCodes()를 한 번 기다립니다.
 * 로직 모듈에서도 쓰므로 상대 경로로만 import 합니다.
 */
import { setStatusLabels } from './status.js';

let codes = {};
let loading;

/** 받은 공통코드를 기억하고 상태 이름도 맞춥니다. */
export function setCodes(value) {
  codes = value && typeof value === 'object' ? value : {};
  setStatusLabels(codes.healthStatuses);
}

/** 공통코드를 한 번만 불러옵니다. 실패해도 던지지 않고 빈 공통코드로 계속합니다. */
export function loadCodes(fetcher) {
  loading ??= Promise.resolve()
    .then(() => fetcher ?? import('./api.js').then(({ api }) => api))
    .then((fetch) => (fetcher ? fetcher('/api/common-codes') : fetch('/api/common-codes')))
    .then((value) => setCodes(value))
    .catch(() => setCodes({}))
    .then(() => codes);
  return loading;
}

export function getCodes() {
  return codes;
}

/** 테스트용: 불러온 공통코드를 지웁니다. */
export function resetCodes() {
  codes = {};
  loading = undefined;
}

const entries = (category, group) => {
  const value = codes[category];
  const list = group === undefined ? value : value?.[group];
  return Array.isArray(list) ? list : [];
};
const toCode = (entry) => (typeof entry === 'string' ? { value: entry, label: entry } : { value: String(entry?.value ?? ''), label: String(entry?.label ?? entry?.value ?? '') });

/** 선택 목록 [{ value, label }] (사용 중인 코드만) */
export function codeList(category, group) {
  return entries(category, group).map(toCode);
}

/** 이름. 비활성 코드는 _labels에서, 모르면 값 그대로 */
export function codeLabel(category, value, group) {
  if (value === undefined || value === null || value === '') return '';
  const key = group === undefined ? String(value) : `${group}::${value}`;
  const known = codes._labels?.[category]?.[key];
  if (known) return known;
  return codeList(category, group).find((code) => code.value === String(value))?.label || String(value);
}

/** 서버 역할 이름 (예: OTHER → 기타) */
export function roleLabel(role) {
  return codeLabel('serverRoles', role);
}
