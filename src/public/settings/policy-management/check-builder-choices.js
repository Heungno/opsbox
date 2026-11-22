/* 점검 만들기 폼의 종류·판정 수준 선택지 (순수 함수) */

/**
 * 점검 종류·판정 수준 선택지 (서버 GET /api/check-builder/types 응답에서)
 * 화면에 따로 적지 않고 서버 한 곳에서 받습니다.
 */
export function builderChoices(meta) {
  const types = Array.isArray(meta?.types) ? meta.types : [];
  return {
    types: types.map((entry) => [entry.value, entry.label]),
    levels: (Array.isArray(meta?.levels) ? meta.levels : []).map((entry) => [entry.value, entry.label]),
    help: (value) => types.find((entry) => entry.value === value)?.help ?? '',
  };
}
