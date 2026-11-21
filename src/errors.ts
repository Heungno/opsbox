import type { ErrorCode, FieldError } from './types/api';

/*
 * 업무 오류 클래스
 *
 * 서비스에서 이 클래스로 던지면 에러 핸들러가 상태코드·코드·메시지를 그대로 응답합니다.
 * 그 밖의 예외(일반 Error 등)는 서버 오류(500)로 처리하고 내부 메시지는 숨깁니다.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly errors?: FieldError[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400: 요청 형식이 잘못되었거나 처리할 수 없는 입력 */
export class BadRequestError extends AppError {
  constructor(message = '요청 형식이 올바르지 않습니다.', errors?: FieldError[]) {
    super(400, 'BAD_REQUEST', message, errors);
  }
}

/** 400: 입력값 검증 실패 (필드별 오류 목록 포함) */
export class ValidationError extends AppError {
  constructor(errors: FieldError[], message?: string) {
    super(400, 'VALIDATION_ERROR', message ?? errors[0]?.message ?? '입력값을 확인하세요.', errors);
  }
}

/** 401: 로그인 필요 또는 로그인 실패 */
export class UnauthorizedError extends AppError {
  constructor(message = '로그인이 필요합니다.') {
    super(401, 'UNAUTHENTICATED', message);
  }
}

/** 404: 대상 없음 */
export class NotFoundError extends AppError {
  constructor(message = '요청한 항목을 찾을 수 없습니다.') {
    super(404, 'NOT_FOUND', message);
  }
}

/** 409: 현재 상태와 충돌 (중복, 이미 실행 중 등) */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

/** 429: 짧은 시간에 너무 많이 시도함 (로그인 실패 반복 등) */
export class TooManyRequestsError extends AppError {
  constructor(message: string, public readonly retryAfterSeconds: number) {
    super(429, 'TOO_MANY_REQUESTS', message);
  }
}
