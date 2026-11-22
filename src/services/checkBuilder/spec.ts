import type { FieldError } from '../../types/api';
import type { PolicyInput, PolicyItemResult, ResultComponent } from '../../features/policies/types';
import { getPreset } from './presets';
import { BUILDER_TYPES, LIMITS, type BuilderOs, type BuilderSpec } from './types';

/*
 * 점검 만들기 폼 데이터 검증과, 폼 데이터에서 파생되는 서버별 입력·결과 표시 정의
 */

const LEVELS = ['Warning', 'Critical'];
const DIRECTIONS = ['HIGHER_IS_WORSE', 'LOWER_IS_WORSE'];
const COMPARATORS = ['=', '!=', '>=', '<='];
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isText = (value: unknown, max: number) => typeof value === 'string' && value.trim() !== '' && value.length <= max;

/** 비어 있지 않은 값만 덮어씁니다(빈 배열·undefined는 프리셋 기본값 유지). */
function overlay<T extends object>(base: Partial<T>, top: Partial<T>): Partial<T> {
  const result: Partial<T> = { ...base };
  for (const [key, value] of Object.entries(top) as [keyof T, unknown][]) {
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) continue;
    result[key] = value as T[keyof T];
  }
  return result;
}

/** 준비된 점검의 명령·기본값과 공통 기본값을 합친 실행용 값 */
export function resolveSpec(spec: BuilderSpec): BuilderSpec & { command?: string } {
  const preset = spec.presetId ? getPreset(spec.presetId) : undefined;
  const defaults: Partial<BuilderSpec> = {
    direction: 'HIGHER_IS_WORSE', level: 'Critical', missingLevel: 'Critical', timeoutSeconds: 3, periodDays: 7,
    ...(preset?.defaults ?? {}),
  };
  const merged = overlay<BuilderSpec>(defaults, spec) as BuilderSpec;
  return preset ? { ...merged, command: preset.command } : merged;
}

function phraseErrors(value: unknown, field: string, required: boolean): FieldError[] {
  if (value === undefined && !required) return [];
  const list = Array.isArray(value) ? value : [];
  if (required && !list.length) return [{ field, message: '찾을 문구를 하나 이상 입력하세요.' }];
  if (list.length > LIMITS.phraseCount) return [{ field, message: `문구는 최대 ${LIMITS.phraseCount}개까지 입력할 수 있습니다.` }];
  if (!list.every((phrase) => isText(phrase, LIMITS.phraseLength))) return [{ field, message: `문구는 빈칸이 아닌 ${LIMITS.phraseLength}자 이하로 입력하세요.` }];
  return [];
}

function levelError(value: unknown, field: string): FieldError[] {
  return value === undefined || LEVELS.includes(value as string) ? [] : [{ field, message: '수준은 주의 또는 위험을 고르세요.' }];
}

export function validateBuilderSpec(raw: unknown, os: BuilderOs, field: string): FieldError[] {
  const at = (name: string) => `${field}.${name}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [{ field, message: '점검 만들기 설정이 없습니다.' }];
  const spec = raw as Partial<BuilderSpec>;
  if (spec.version !== 1) return [{ field: at('version'), message: '지원하지 않는 점검 만들기 형식입니다.' }];
  if (!BUILDER_TYPES.includes(spec.type as BuilderSpec['type'])) return [{ field: at('type'), message: '점검 유형을 고르세요.' }];

  const errors: FieldError[] = [];
  if (spec.presetId !== null && spec.presetId !== undefined) {
    const preset = typeof spec.presetId === 'string' ? getPreset(spec.presetId) : undefined;
    if (!preset) return [{ field: at('presetId'), message: '준비된 점검을 찾을 수 없습니다.' }];
    if (preset.os !== os) return [{ field: at('presetId'), message: `${os} 정책에서는 ${preset.os}용 준비된 점검을 쓸 수 없습니다.` }];
    if (preset.type !== spec.type) return [{ field: at('presetId'), message: '준비된 점검의 유형이 고른 점검 유형과 다릅니다.' }];
  }
  const resolved = resolveSpec(spec as BuilderSpec);

  if ((spec.type === 'COMMAND_NUMBER' || spec.type === 'COMMAND_TEXT') && !spec.presetId && !isText(spec.command, LIMITS.commandLength)) {
    errors.push({ field: at('command'), message: `실행할 명령을 ${LIMITS.commandLength}자 이하로 입력하세요.` });
  }

  switch (spec.type) {
    case 'COMMAND_NUMBER': {
      if (!DIRECTIONS.includes(resolved.direction as string)) errors.push({ field: at('direction'), message: '판정 방향을 고르세요.' });
      if (!isNumber(resolved.warning) || !isNumber(resolved.critical)) {
        errors.push({ field: at('warning'), message: '주의·위험 기준값을 숫자로 입력하세요.' });
      } else if (resolved.direction === 'LOWER_IS_WORSE' ? resolved.warning <= resolved.critical : resolved.warning >= resolved.critical) {
        errors.push({ field: at('warning'), message: resolved.direction === 'LOWER_IS_WORSE' ? '낮을수록 나쁜 값은 주의 기준이 위험 기준보다 커야 합니다.' : '주의 기준은 위험 기준보다 작아야 합니다.' });
      }
      break;
    }
    case 'COMMAND_TEXT':
      errors.push(...phraseErrors(resolved.badPhrases, at('badPhrases'), true), ...phraseErrors(resolved.goodPhrases, at('goodPhrases'), false), ...levelError(resolved.level, at('level')));
      break;
    case 'SETTING_VALUE':
      if (!isText(resolved.settingName, LIMITS.phraseLength)) errors.push({ field: at('settingName'), message: os === 'Windows' ? '레지스트리 값 이름을 입력하세요.' : '커널 파라미터 이름(예: vm.swappiness)을 입력하세요.' });
      // Linux 커널 파라미터 이름은 sysctl 옵션으로 해석되지 않도록 영문·숫자·. _ / - 만 허용하고 - 로 시작할 수 없음
      else if (os === 'Linux' && !/^[A-Za-z0-9_][A-Za-z0-9._/-]*$/.test(resolved.settingName!)) errors.push({ field: at('settingName'), message: '커널 파라미터 이름은 영문·숫자·. _ / - 만 쓸 수 있습니다. (예: vm.swappiness)' });
      if (os === 'Windows' && !isText(resolved.settingPath, 500)) errors.push({ field: at('settingPath'), message: '레지스트리 경로를 입력하세요. (예: HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters)' });
      if (!COMPARATORS.includes(resolved.comparator as string)) errors.push({ field: at('comparator'), message: '비교 방법(=, ≠, ≥, ≤)을 고르세요.' });
      if (!isText(resolved.expected, LIMITS.phraseLength)) errors.push({ field: at('expected'), message: '기대값을 입력하세요.' });
      errors.push(...levelError(resolved.level, at('level')));
      break;
    case 'REMOTE_PORT':
      if (!Number.isInteger(resolved.timeoutSeconds) || resolved.timeoutSeconds! < 1 || resolved.timeoutSeconds! > 30) errors.push({ field: at('timeoutSeconds'), message: '접속 제한 시간은 1~30초로 입력하세요.' });
      errors.push(...levelError(resolved.level, at('level')));
      break;
    case 'FILE_FRESHNESS':
      if (!isNumber(resolved.maxAgeHours) || resolved.maxAgeHours <= 0) errors.push({ field: at('maxAgeHours'), message: '허용 기간(시간)을 0보다 큰 숫자로 입력하세요.' });
      errors.push(...levelError(resolved.missingLevel, at('missingLevel')));
      break;
    case 'LOG_PATTERN':
      errors.push(...phraseErrors(resolved.phrases, at('phrases'), true));
      if (!Number.isInteger(resolved.periodDays) || resolved.periodDays! < 1 || resolved.periodDays! > 365) errors.push({ field: at('periodDays'), message: '검색 기간은 1~365일로 입력하세요.' });
      if (!isNumber(resolved.warning) || !isNumber(resolved.critical) || resolved.warning < 1 || resolved.critical < resolved.warning) {
        errors.push({ field: at('warning'), message: '주의·위험 건수 기준을 입력하세요. (주의 ≥ 1, 위험 ≥ 주의)' });
      }
      break;
  }
  if (spec.unit !== undefined && (typeof spec.unit !== 'string' || spec.unit.length > 20)) errors.push({ field: at('unit'), message: '단위는 20자 이하로 입력하세요.' });
  return errors;
}

/** 서버 상세에서 서버마다 입력받는 값 */
export function builderInputs(spec: BuilderSpec): PolicyInput[] {
  switch (spec.type) {
    case 'REMOTE_PORT':
      return [{ key: 'targets', label: '접속 대상 (호스트:포트, 한 줄에 하나)', type: 'TARGET_LIST', scope: 'SERVER', required: true }];
    case 'FILE_FRESHNESS':
      return [{ key: 'paths', label: '확인할 파일 경로 (한 줄에 하나)', type: 'PATH_LIST', scope: 'SERVER', required: true }];
    case 'LOG_PATTERN':
      return [{ key: 'paths', label: '로그 파일 또는 폴더 경로 (한 줄에 하나)', type: 'PATH_LIST', scope: 'SERVER', required: true }];
    default:
      return spec.presetId ? (getPreset(spec.presetId)?.inputs ?? []).map((input) => ({ ...input })) : [];
  }
}

const TABLE: ResultComponent = {
  type: 'TABLE',
  columns: [
    { key: 'target', label: '대상' }, { key: 'value', label: '값' }, { key: 'threshold', label: '기준' },
    { key: 'status', label: '상태' }, { key: 'message', label: '메시지' },
  ],
};

/** 보고서 표시 정의 */
export function builderResult(spec: BuilderSpec): PolicyItemResult {
  const extra: ResultComponent[] = spec.type === 'COMMAND_NUMBER' || spec.type === 'COMMAND_TEXT' ? [{ type: 'CONSOLE' }]
    : spec.type === 'LOG_PATTERN' ? [{ type: 'LOG_TABLE', columns: [{ key: 'timestamp', label: '시각' }, { key: 'path', label: '파일 경로' }, { key: 'message', label: '로그 내용' }] }]
      : [];
  return { components: [{ type: 'SUMMARY' }, structuredClone(TABLE), ...extra], statusField: 'status' };
}
