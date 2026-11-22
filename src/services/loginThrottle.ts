import { TooManyRequestsError } from '../shared/errors';

/*
 * 로그인 실패 제한 (메모리 보관, 재시작하면 초기화)
 *
 * - 같은 아이디: 15분 안에 5번 틀리면 15분 동안 잠금
 * - 같은 IP:    15분 안에 20번 틀리면 15분 동안 잠금 (여러 아이디를 돌려 대입하는 경우)
 * 잠긴 동안에는 비밀번호 확인(scrypt)도 하지 않아 CPU 부담을 막습니다.
 * 로그인에 성공하면 그 아이디의 실패 기록을 지웁니다.
 */
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_USER_FAILURES = 5;
const MAX_IP_FAILURES = 20;
const MAX_ENTRIES = 10_000;

interface Entry { failures: number[]; lockedUntil: number }
const entries = new Map<string, Entry>();

const userKey = (username: string) => `user:${username.trim().toLowerCase()}`;
const ipKey = (ip: string) => `ip:${ip}`;

function prune(now: number) {
  if (entries.size < MAX_ENTRIES) return;
  for (const [key, entry] of entries) {
    if (entry.lockedUntil <= now && entry.failures.every((time) => now - time > WINDOW_MS)) entries.delete(key);
  }
}

/** 잠겨 있으면 429 오류를 던집니다. */
export function assertLoginAllowed(username: string, ip: string, now = Date.now()) {
  for (const key of [userKey(username), ipKey(ip)]) {
    const lockedUntil = entries.get(key)?.lockedUntil ?? 0;
    if (lockedUntil > now) {
      const seconds = Math.ceil((lockedUntil - now) / 1000);
      throw new TooManyRequestsError(`로그인 실패가 반복되어 잠시 잠겼습니다. 약 ${Math.ceil(seconds / 60)}분 뒤에 다시 시도하세요.`, seconds);
    }
  }
}

export function recordLoginFailure(username: string, ip: string, now = Date.now()) {
  prune(now);
  for (const [key, max] of [[userKey(username), MAX_USER_FAILURES], [ipKey(ip), MAX_IP_FAILURES]] as const) {
    const entry = entries.get(key) ?? { failures: [], lockedUntil: 0 };
    entry.failures = [...entry.failures.filter((time) => now - time <= WINDOW_MS), now];
    if (entry.failures.length >= max) {
      entry.lockedUntil = now + LOCK_MS;
      entry.failures = [];
    }
    entries.set(key, entry);
  }
}

export function recordLoginSuccess(username: string) {
  entries.delete(userKey(username));
}

/** 테스트용 */
export function resetLoginThrottle() {
  entries.clear();
}
