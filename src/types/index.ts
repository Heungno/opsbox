/*
 * 타입 모음. 서비스·라우트에서는 '../types'에서 가져다 씁니다.
 *
 * api.ts        API 응답 규약, 오류 코드, 공통 파라미터
 * auth.ts       사용자·세션
 * commonCode.ts 공통코드
 * server.ts     서버, 점검 설정, 저장 구조
 * policy.ts     점검 정책
 * template.ts   스크립트·쿼리 템플릿
 * result.ts     점검 결과, 가져오기
 * report.ts     대시보드·보고서
 * validation.ts 입력값 검증 결과
 */
export * from './api';
export * from './auth';
export * from './commonCode';
export * from './server';
export * from './policy';
export * from './template';
export * from './result';
export * from './report';
export type { ValidationResult } from './validation';
