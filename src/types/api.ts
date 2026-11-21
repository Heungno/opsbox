/*
 * 클라이언트 ↔ 서버 API 공통 규약
 *
 * 성공: { success: true, data, ...meta }
 * 실패: { success: false, code, message, errors?, requestId? }  (HTTP 상태코드도 함께 설정)
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTERNAL_ERROR';

/** 입력값 검증 오류 한 건 (화면에서 필드 옆에 표시) */
export interface FieldError {
  field: string;
  index?: number;
  message: string;
}

export type ApiSuccess<T, Meta extends object = object> = { success: true; data: T } & Meta;

export interface ApiFailure {
  success: false;
  code: ErrorCode;
  message: string;
  errors?: FieldError[];
  /** 서버 오류(5xx)일 때 로그에서 찾을 수 있는 요청 ID */
  requestId?: string;
}

export type ApiResponse<T, Meta extends object = object> = ApiSuccess<T, Meta> | ApiFailure;

/* 라우트 공통 파라미터 */
export interface IdParams {
  id: string;
}

export interface ServerIdParams {
  serverId: string;
}

export interface ResultFileParams extends ServerIdParams {
  fileName: string;
}
