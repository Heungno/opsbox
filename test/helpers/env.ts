/*
 * 테스트 환경: 임시 폴더의 DB·백업·로그를 쓰도록 환경 변수를 설정합니다.
 * OpsBox 모듈은 불러올 때 이 값을 읽으므로, 테스트 파일에서 가장 먼저 import 해야 합니다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'opsbox-test-'));

process.env.OPSBOX_DB_PATH = path.join(TEST_ROOT, 'opsbox.db');
process.env.OPSBOX_BACKUP_DIR = path.join(TEST_ROOT, 'backup');
process.env.OPSBOX_BACKUP_KEY = randomBytes(32).toString('base64');
process.env.OPSBOX_LOG_DIR = path.join(TEST_ROOT, 'logs');
process.env.OPSBOX_LOG_LEVEL = 'error';
process.env.OPSBOX_IMPORT_MIN_AGE_SECONDS = '0';

export function makeDir(...parts: string[]) {
  const dir = path.join(TEST_ROOT, ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

process.on('exit', () => fs.rmSync(TEST_ROOT, { recursive: true, force: true }));
