import { db } from '../../db/connection';

/* 로그인 계정(users). 아이디는 대소문자를 구분하지 않습니다(COLLATE NOCASE). */

export type UserRow = { username: string; display_name: string | null; password_salt: string; password_hash: string };

export function findUserRow(username: string): UserRow | undefined {
  return db.prepare('SELECT username, display_name, password_salt, password_hash FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function insertUser(username: string, displayName: string | null, salt: string, hash: string) {
  db.prepare('INSERT INTO users (username, display_name, password_salt, password_hash) VALUES (?, ?, ?, ?)').run(username, displayName, salt, hash);
}

export function updateDisplayNameRow(username: string, displayName: string) {
  db.prepare('UPDATE users SET display_name = ? WHERE username = ?').run(displayName, username);
}

export function updatePasswordRow(username: string, salt: string, hash: string) {
  db.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE username = ?').run(salt, hash, username);
}
