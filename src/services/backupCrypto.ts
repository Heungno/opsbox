import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

import { logger } from '../logger';

/*
 * 점검 결과 원본 JSON 백업 암호화
 *
 * 형식: MAGIC(8) | IV(12) | AUTH_TAG(16) | AES-256-GCM(gzip(원본))
 * 키:   OPSBOX_BACKUP_KEY (base64, 32바이트) 환경변수, 없으면 키 파일
 *       OPSBOX_BACKUP_KEY_FILE (기본 data/backup.key)을 사용합니다.
 *       키 파일이 없으면 새로 만듭니다. 키를 잃어버리면 백업을 복구할 수 없으니
 *       백업과 다른 곳에 따로 보관하세요.
 *
 * 복호화: node scripts/decrypt-backup.cjs <파일 또는 폴더>
 */

const MAGIC = Buffer.from('OPSBOXE1', 'ascii');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export const BACKUP_DIR = process.env.OPSBOX_BACKUP_DIR || path.join(process.cwd(), 'data', 'backup', 'results');
const KEY_FILE = process.env.OPSBOX_BACKUP_KEY_FILE || path.join(process.cwd(), 'data', 'backup.key');

let cachedKey: Buffer | undefined;

function decodeKey(value: string, source: string): Buffer {
  const key = Buffer.from(value.trim(), 'base64');
  if (key.length !== 32) throw new Error(`백업 암호화 키가 올바르지 않습니다 (${source}): base64로 인코딩한 32바이트여야 합니다.`);
  return key;
}

export function getBackupKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (process.env.OPSBOX_BACKUP_KEY) {
    cachedKey = decodeKey(process.env.OPSBOX_BACKUP_KEY, 'OPSBOX_BACKUP_KEY');
    return cachedKey;
  }
  if (!fs.existsSync(KEY_FILE)) {
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, `${randomBytes(32).toString('base64')}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    logger.warn({ keyFile: KEY_FILE }, '새 백업 암호화 키를 만들었습니다. 이 키가 없으면 백업을 복구할 수 없으니 안전한 다른 위치에 따로 보관하세요.');
  }
  cachedKey = decodeKey(fs.readFileSync(KEY_FILE, 'utf8'), KEY_FILE);
  return cachedKey;
}

export function encryptBackup(plain: Buffer, key = getBackupKey()): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(MAGIC);
  const encrypted = Buffer.concat([cipher.update(gzipSync(plain)), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

export function decryptBackup(data: Buffer, key = getBackupKey()): Buffer {
  if (data.length < MAGIC.length + IV_LENGTH + TAG_LENGTH || !data.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('OpsBox 백업 파일 형식이 아닙니다.');
  }
  const iv = data.subarray(MAGIC.length, MAGIC.length + IV_LENGTH);
  const tag = data.subarray(MAGIC.length + IV_LENGTH, MAGIC.length + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  return gunzipSync(Buffer.concat([decipher.update(data.subarray(MAGIC.length + IV_LENGTH + TAG_LENGTH)), decipher.final()]));
}

/*
 * 암호화한 백업을 BACKUP_DIR/<relativePath>.enc 로 저장합니다.
 * 같은 이름이 이미 있으면 덮어쓰지 않고 해시를 붙입니다. 저장한 경로를 돌려줍니다.
 */
export function writeEncryptedBackup(relativePath: string, plain: Buffer, hash: string): string {
  // 경로에 '..' 등이 섞여 백업 폴더 밖으로 나가지 않도록 확인 (예전에 등록된 서버 ID 대비)
  const root = path.resolve(BACKUP_DIR);
  if (!path.resolve(root, relativePath).startsWith(root + path.sep)) {
    throw new Error(`백업 경로가 백업 폴더 밖을 가리킵니다: ${relativePath}`);
  }
  let target = path.join(BACKUP_DIR, `${relativePath}.enc`);
  if (fs.existsSync(target)) {
    const parsed = path.parse(relativePath);
    target = path.join(BACKUP_DIR, parsed.dir, `${parsed.name}.${hash.slice(0, 12)}${parsed.ext}.enc`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temp, encryptBackup(plain), { mode: 0o600 });
  fs.renameSync(temp, target);
  return target;
}
