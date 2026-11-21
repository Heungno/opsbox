/** DB users 테이블 한 행 */
export interface UserRecord {
  username: string;
  displayName?: string;
  passwordSalt: string;
  passwordHash: string;
}

/** 로그인한 사용자 (세션 쿠키에 담기는 정보) */
export interface SessionUser {
  username: string;
  displayName: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}
