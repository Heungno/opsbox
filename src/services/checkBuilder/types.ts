import type { PolicyInput } from '../../types/policy';

/*
 * 점검 만들기(Check Builder) 폼 데이터
 *
 * 정책 항목의 executor.options.builder 에 저장됩니다. 폼 값은 생성기가 스크립트 조각으로 바꾸고,
 * 서버마다 다른 값(대상·경로)은 서버 상세의 입력(scope: SERVER)으로 받아 실행 중에 읽습니다.
 */

export const BUILDER_TYPES = ['COMMAND_NUMBER', 'COMMAND_TEXT', 'SETTING_VALUE', 'REMOTE_PORT', 'FILE_FRESHNESS', 'LOG_PATTERN'] as const;
export type BuilderType = (typeof BUILDER_TYPES)[number];
export type BuilderOs = 'Windows' | 'Linux';
export type Level = 'Warning' | 'Critical';
export type Direction = 'HIGHER_IS_WORSE' | 'LOWER_IS_WORSE';
export type Comparator = '=' | '!=' | '>=' | '<=';

export const BUILDER_TYPE_LABELS: Record<BuilderType, string> = {
  COMMAND_NUMBER: '명령 결과 숫자 비교',
  COMMAND_TEXT: '명령 결과 문구 확인',
  SETTING_VALUE: '설정값 비교',
  REMOTE_PORT: '원격 포트 접속',
  FILE_FRESHNESS: '파일 최신 여부',
  LOG_PATTERN: '로그 문구 검색',
};

/** 제한 값 (설계 문서 3·5.6장) */
export const LIMITS = {
  commandLength: 2000,
  phraseLength: 200,
  phraseCount: 20,
  outputLength: 2000,
  /** 판정용 출력 상한(바이트) — 보관은 outputLength, 판정은 이만큼 전체를 봅니다 */
  judgeOutputBytes: 1048576,
  commandTimeoutSeconds: 30,
  sampleLines: 5,
} as const;

export interface BuilderSpec {
  version: 1;
  type: BuilderType;
  /** 준비된 점검 ID. 직접 입력이면 null */
  presetId: string | null;
  /** 직접 입력 명령 (COMMAND_*). 준비된 점검이면 무시하고 프리셋 명령을 씁니다. */
  command?: string;
  /** COMMAND_NUMBER: 표시용 단위 */
  unit?: string;
  /** COMMAND_NUMBER: 기본은 높을수록 나쁨 */
  direction?: Direction;
  /** COMMAND_NUMBER 기준값, LOG_PATTERN 건수 기준 */
  warning?: number;
  critical?: number;
  /** COMMAND_TEXT */
  badPhrases?: string[];
  goodPhrases?: string[];
  /** COMMAND_TEXT·SETTING_VALUE 불일치 수준 (기본 Critical) */
  level?: Level;
  /** SETTING_VALUE: Linux sysctl 키 / Windows 레지스트리 값 이름 */
  settingName?: string;
  /** SETTING_VALUE: Windows 레지스트리 경로 (예: HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters) */
  settingPath?: string;
  comparator?: Comparator;
  expected?: string;
  /** REMOTE_PORT: 접속 제한 시간(초, 기본 3) */
  timeoutSeconds?: number;
  /** FILE_FRESHNESS */
  maxAgeHours?: number;
  missingLevel?: Level;
  /** LOG_PATTERN */
  phrases?: string[];
  periodDays?: number;
}

/**
 * 준비된 점검.
 * command는 실행할 명령(Linux bash / Windows PowerShell). 서버별 입력은 환경 변수 OPSBOX_INPUT_<KEY 대문자>로 받습니다.
 * 숫자 유형은 숫자 하나를, 문구 유형은 판정할 텍스트를 출력합니다.
 */
export interface Preset {
  id: string;
  os: BuilderOs;
  type: 'COMMAND_NUMBER' | 'COMMAND_TEXT' | 'SETTING_VALUE';
  name: string;
  description: string;
  command?: string;
  defaults: Partial<BuilderSpec>;
  inputs: PolicyInput[];
}
