import path from 'node:path';

import '../../db'; // 스키마 준비
import { ValidationError } from '../../shared/errors';
import { getSettingValue, setSettingValue } from './repository';

/*
 * 결과 경로
 *
 * - 수신함(OpsBox가 결과를 가져오는 폴더): 환경 변수 OPSBOX_RESULT_INBOX (여러 개는 ; 구분, 기본 data/inbox).
 *   설치할 때 정하는 OpsBox 서버 설정이라 화면에서는 보여 주기만 합니다.
 * - 결과 저장 경로(점검 스크립트가 결과를 저장하는 폴더, 대상 서버가 보는 경로): OS별 기본값을 여기 두고,
 *   서버마다 따로 지정할 수 있습니다. 비어 있으면 스크립트가 있는 폴더에 저장합니다.
 */
export interface ResultPathSettings {
  windows: string;
  linux: string;
  inboxes: string[];
}

const KEYS = { windows: 'result_path_windows', linux: 'result_path_linux' } as const;

const RULES: Record<'Windows' | 'Linux', { pattern: RegExp; example: string }> = {
  Windows: { pattern: /^(\\\\|[A-Za-z]:\\)/, example: '\\\\NAS\\opsbox\\results 또는 D:\\opsbox\\results' },
  Linux: { pattern: /^\//, example: '/mnt/opsbox/results' },
};

/** 결과 저장 경로 검사: 빈 값은 허용, 값이 있으면 그 OS의 절대 경로. 문제가 있으면 오류 문구 */
export function resultPathError(os: string, value: string): string | undefined {
  const rule = RULES[os as 'Windows' | 'Linux'];
  if (!value || !rule || rule.pattern.test(value)) return undefined;
  return `결과 저장 경로는 ${os} 절대 경로여야 합니다. 예: ${rule.example}`;
}

export function getInboxDirs(): string[] {
  const configured = (process.env.OPSBOX_RESULT_INBOX ?? '').split(';').map((dir) => dir.trim()).filter(Boolean);
  const dirs = configured.length ? configured : [path.join('data', 'inbox')];
  return [...new Set(dirs.map((dir) => path.resolve(process.cwd(), dir)))];
}

/** 대상 OS의 기본 결과 저장 경로 (없으면 '') */
export function defaultResultPath(os: string): string {
  if (os === 'Windows') return getSettingValue(KEYS.windows) ?? '';
  if (os === 'Linux') return getSettingValue(KEYS.linux) ?? '';
  return '';
}

export function getResultPathSettings(): ResultPathSettings {
  return { windows: defaultResultPath('Windows'), linux: defaultResultPath('Linux'), inboxes: getInboxDirs() };
}

/** 보낸 OS 값만 바꿉니다(앞뒤 공백 제거, 빈 값 허용). */
export function saveResultPathSettings(input: { windows?: unknown; linux?: unknown }): ResultPathSettings {
  const values: Partial<Record<'windows' | 'linux', string>> = {};
  const errors: Array<{ field: string; message: string }> = [];
  for (const [field, os] of [['windows', 'Windows'], ['linux', 'Linux']] as const) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== 'string') { errors.push({ field, message: `${os} 결과 저장 경로는 문자열이어야 합니다.` }); continue; }
    const value = (input[field] as string).trim();
    const error = resultPathError(os, value);
    if (error) errors.push({ field, message: error });
    values[field] = value;
  }
  if (errors.length) throw new ValidationError(errors);
  for (const [field, value] of Object.entries(values) as Array<['windows' | 'linux', string]>) setSettingValue(KEYS[field], value);
  return getResultPathSettings();
}
