/*
 * 프로그램 동작이 기대는 고정 값 (공통코드가 아님: 관리자가 바꾸면 스크립트·DB 제약이 깨집니다)
 * 화면에 보이는 이름은 공통코드(policyCategories, operatingSystems 등)를 씁니다.
 */

/** 점검 정책 분류 (DB 제약 policies.category, server_policies.category와 같음) */
export const POLICY_CATEGORIES = ['BASIC', 'WEB', 'WAS', 'DB'] as const;

/** 역할별 정책이 있는 서버 역할 */
export const ROLE_POLICY_TYPES = ['WEB', 'WAS', 'DB'] as const;

/** 점검 스크립트를 만들 수 있는 OS */
export const SCRIPT_OS = ['Windows', 'Linux'] as const;

/** 기본 스크립트 조각 없이 관리 명령 템플릿으로만 도는 점검 항목 */
export const COMMAND_ONLY_ITEMS: ReadonlySet<string> = new Set(['WAS_ENGINE_STATUS']);
