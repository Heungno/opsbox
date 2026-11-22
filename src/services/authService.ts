import { db } from '../db/database';
import { ValidationError } from '../shared/errors';
import type { SessionUser, UserRecord } from '../types/auth';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/*
 * 로그인·세션·내 정보
 *
 * 세션은 서명한 쿠키(아이디·만료 시각·비밀번호 지문)이고 서버에 따로 저장하지 않습니다.
 * 요청마다 users 테이블에서 사용자를 다시 읽어
 *  - 비밀번호가 바뀌었으면(지문이 다르면) 그 세션을 끊고
 *  - 표시 이름은 DB의 최신 값을 씁니다.
 */

const SESSION_COOKIE = 'opsbox_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SESSION_KEY = randomBytes(32);

export const DISPLAY_NAME_MAX = 50;
export const PASSWORD_MIN = 12;
const PASSWORD_MAX = 256;

/** 아이디로 사용자 한 명 (대소문자 무시: users.username은 COLLATE NOCASE) */
function findUser(username: string): UserRecord | undefined {
  const row = db.prepare('SELECT username, display_name, password_salt, password_hash FROM users WHERE username = ?').get(username.trim()) as Record<string, string | null> | undefined;
  if (!row) return undefined;
  return {
    username: String(row.username),
    displayName: row.display_name ?? undefined,
    passwordSalt: String(row.password_salt),
    passwordHash: String(row.password_hash),
  };
}

const sessionUserOf = (user: UserRecord): SessionUser => ({ username: user.username, displayName: user.displayName || user.username });

/** 비밀번호 지문: 비밀번호를 바꾸면 달라져 이전 세션이 끊깁니다. (해시 자체는 쿠키에 넣지 않음) */
function passwordFingerprint(user: UserRecord): string {
  return createHmac('sha256', SESSION_KEY).update(`pw:${user.passwordSalt}:${user.passwordHash}`).digest('base64url').slice(0, 22);
}

function hashPassword(password: string) {
  const salt = randomBytes(32);
  return { salt: salt.toString('hex'), hash: scryptSync(password, salt, 64).toString('hex') };
}

function passwordMatches(user: UserRecord, password: string): boolean {
  if (!/^[a-f\d]{64}$/i.test(user.passwordSalt) || !/^[a-f\d]{128}$/i.test(user.passwordHash)) return false;
  const actual = scryptSync(password, Buffer.from(user.passwordSalt, 'hex'), 64);
  return timingSafeEqual(actual, Buffer.from(user.passwordHash, 'hex'));
}

function signature(payload: string): string {
  return createHmac('sha256', SESSION_KEY).update(payload).digest('base64url');
}

export function authenticate(username: string, password: string): SessionUser | undefined {
  const user = findUser(username);
  if (!user || !passwordMatches(user, password)) return undefined;
  return sessionUserOf(user);
}

/** 세션 토큰 만들기. 없는 사용자면 오류 (세션은 DB의 사용자와 묶임) */
export function createSession(username: string): string {
  const user = findUser(username);
  if (!user) throw new Error(`사용자가 없습니다: ${username}`);
  const payload = Buffer.from(JSON.stringify({ username: user.username, pw: passwordFingerprint(user), expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

/** 계정 추가 (데모·테스트용. 운영 계정은 scripts/create-user.cjs) */
export function createUser(username: string, displayName: string, password: string) {
  const { salt, hash } = hashPassword(password);
  db.prepare('INSERT INTO users (username, display_name, password_salt, password_hash) VALUES (?, ?, ?, ?)').run(username, displayName, salt, hash);
}

/** 내 표시 이름 바꾸기: 앞뒤 공백 제거, 1~50자, 제어 문자 금지 */
export function updateDisplayName(username: string, value: unknown): { before: string; after: SessionUser } {
  const user = findUser(username);
  if (!user) throw new Error(`사용자가 없습니다: ${username}`);
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new ValidationError([{ field: 'displayName', message: '이름을 입력하세요.' }]);
  if ([...name].length > DISPLAY_NAME_MAX) throw new ValidationError([{ field: 'displayName', message: `이름은 ${DISPLAY_NAME_MAX}자 이하로 입력하세요.` }]);
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new ValidationError([{ field: 'displayName', message: '이름에 줄바꿈·제어 문자를 넣을 수 없습니다.' }]);
  db.prepare('UPDATE users SET display_name = ? WHERE username = ?').run(name, user.username);
  return { before: user.displayName || user.username, after: { username: user.username, displayName: name } };
}

/**
 * 내 비밀번호 바꾸기. 현재 비밀번호가 틀리면 false (호출한 쪽에서 로그인 실패처럼 처리).
 * 새 비밀번호: 12~256자, 현재와 달라야 함
 */
export function changePassword(username: string, currentPassword: unknown, newPassword: unknown): boolean {
  const user = findUser(username);
  if (!user) throw new Error(`사용자가 없습니다: ${username}`);
  if (typeof newPassword !== 'string' || newPassword.length < PASSWORD_MIN) {
    throw new ValidationError([{ field: 'newPassword', message: `새 비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.` }]);
  }
  if (newPassword.length > PASSWORD_MAX) throw new ValidationError([{ field: 'newPassword', message: `새 비밀번호는 ${PASSWORD_MAX}자 이하로 입력하세요.` }]);
  if (typeof currentPassword !== 'string' || !passwordMatches(user, currentPassword)) return false;
  if (newPassword === currentPassword) throw new ValidationError([{ field: 'newPassword', message: '새 비밀번호가 현재 비밀번호와 같습니다.' }]);
  const { salt, hash } = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE username = ?').run(salt, hash, user.username);
  return true;
}

export function getSession(token?: string): SessionUser | undefined {
  if (!token) return undefined;
  const [payload, providedSignature, extra] = token.split('.');
  if (!payload || !providedSignature || extra !== undefined) return undefined;
  const expectedSignature = Buffer.from(signature(payload));
  const actualSignature = Buffer.from(providedSignature);
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) return undefined;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { username?: unknown; pw?: unknown; expiresAt?: unknown };
    if (typeof session.username !== 'string' || !session.username || typeof session.expiresAt !== 'number' || session.expiresAt <= Date.now()) return undefined;
    // 사용자가 지워졌거나 비밀번호가 바뀌었으면 끊음 (이전 형식 쿠키는 pw가 없어 다시 로그인)
    const user = findUser(session.username);
    if (!user || session.pw !== passwordFingerprint(user)) return undefined;
    return sessionUserOf(user);
  } catch {
    return undefined;
  }
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function readSessionCookie(cookieHeader?: string): SessionUser | undefined {
  const token = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return getSession(token);
}

export function sessionMaxAge() {
  return SESSION_TTL_SECONDS;
}
