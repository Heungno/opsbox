import { db } from '../db/database';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'opsbox_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SESSION_KEY = randomBytes(32);

interface UserRecord {
  username: string;
  displayName?: string;
  passwordSalt: string;
  passwordHash: string;
}


function readUsers(): UserRecord[] {
  const rows = db.prepare('SELECT username, display_name, password_salt, password_hash FROM users').all() as Array<Record<string, string | null>>;
  return rows.map((row) => ({
    username: String(row.username),
    displayName: row.display_name ?? undefined,
    passwordSalt: String(row.password_salt),
    passwordHash: String(row.password_hash),
  }));
}

function signature(payload: string): string {
  return createHmac('sha256', SESSION_KEY).update(payload).digest('base64url');
}

export function authenticate(username: string, password: string) {
  const user = readUsers().find((entry) => entry.username.toLowerCase() === username.trim().toLowerCase());
  if (!user || !/^[a-f\d]{64}$/i.test(user.passwordSalt) || !/^[a-f\d]{128}$/i.test(user.passwordHash)) return undefined;
  const actual = scryptSync(password, Buffer.from(user.passwordSalt, 'hex'), 64);
  const expected = Buffer.from(user.passwordHash, 'hex');
  if (!timingSafeEqual(actual, expected)) return undefined;
  return { username: user.username, displayName: user.displayName || user.username };
}

export function createSession(username: string, displayName: string): string {
  const payload = Buffer.from(JSON.stringify({ username, displayName, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export function getSession(token?: string) {
  if (!token) return undefined;
  const [payload, providedSignature, extra] = token.split('.');
  if (!payload || !providedSignature || extra !== undefined) return undefined;
  const expectedSignature = Buffer.from(signature(payload));
  const actualSignature = Buffer.from(providedSignature);
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) return undefined;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { username: string; displayName?: string; expiresAt: number };
    if (!session.username || session.expiresAt <= Date.now()) return undefined;
    return { username: session.username, displayName: session.displayName || session.username };
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

export function readSessionCookie(cookieHeader?: string) {
  const token = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return getSession(token);
}

export function sessionMaxAge() {
  return SESSION_TTL_SECONDS;
}
