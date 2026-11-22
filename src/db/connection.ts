import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/*
 * OpsBox SQLite 연결
 * - DB 파일: OPSBOX_DB_PATH 또는 data/opsbox.db
 * - WAL(읽기와 쓰기가 서로 막지 않음), 잠금 시 5초 대기, 외래키 사용
 */
export const DB_PATH = process.env.OPSBOX_DB_PATH || path.join(process.cwd(), 'data', 'opsbox.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
`);

/**
 * 트랜잭션. 안에서 다시 부르면(예: 정책 저장 + 템플릿 동기화) SAVEPOINT로 처리해
 * 안쪽이 실패하면 그 부분만, 바깥이 실패하면 전체가 되돌아갑니다.
 */
let transactionDepth = 0;
export function transaction<T>(fn: () => T): T {
  const depth = transactionDepth;
  const savepoint = `sp_${depth}`;
  db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
  transactionDepth = depth + 1;
  let result: T;
  try {
    result = fn();
  } catch (error) {
    transactionDepth = depth;
    try { db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`); } catch { /* 이미 끝난 트랜잭션 */ }
    throw error;
  }
  // 깊이는 확정 성공 여부와 관계없이 한 번만 되돌립니다(확정 실패 뒤에도 다음 트랜잭션을 쓸 수 있게).
  transactionDepth = depth;
  try {
    db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
  } catch (error) {
    if (depth === 0 && db.isTransaction) { try { db.exec('ROLLBACK'); } catch { /* 되돌릴 수 없으면 그대로 오류 전달 */ } }
    throw error;
  }
  return result;
}
