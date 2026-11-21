// 암호화된 점검 결과 백업(.enc)을 원본 JSON으로 복원합니다.
//
// 사용법:
//   node scripts/decrypt-backup.cjs <파일.enc>              → 화면에 출력
//   node scripts/decrypt-backup.cjs <파일.enc> <저장경로>    → 파일로 저장
//   node scripts/decrypt-backup.cjs <폴더> <저장폴더>        → 폴더 안의 .enc 전체를 같은 구조로 복원
//
// 키: OPSBOX_BACKUP_KEY(base64) 환경변수 또는 OPSBOX_BACKUP_KEY_FILE(기본 data/backup.key)
const fs = require('node:fs');
const path = require('node:path');
const { createDecipheriv } = require('node:crypto');
const { gunzipSync } = require('node:zlib');

const MAGIC = Buffer.from('OPSBOXE1', 'ascii');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function loadKey() {
  const raw = process.env.OPSBOX_BACKUP_KEY
    || fs.readFileSync(process.env.OPSBOX_BACKUP_KEY_FILE || path.join(process.cwd(), 'data', 'backup.key'), 'utf8');
  const key = Buffer.from(raw.trim(), 'base64');
  if (key.length !== 32) throw new Error('백업 암호화 키가 올바르지 않습니다 (base64 32바이트).');
  return key;
}

function decrypt(data, key) {
  if (data.length < MAGIC.length + IV_LENGTH + TAG_LENGTH || !data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('OpsBox 백업 파일 형식이 아닙니다.');
  const iv = data.subarray(MAGIC.length, MAGIC.length + IV_LENGTH);
  const tag = data.subarray(MAGIC.length + IV_LENGTH, MAGIC.length + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  try {
    return gunzipSync(Buffer.concat([decipher.update(data.subarray(MAGIC.length + IV_LENGTH + TAG_LENGTH)), decipher.final()]));
  } catch {
    throw new Error('복호화에 실패했습니다. 백업을 만든 키와 다른 키이거나 파일이 손상되었습니다.');
  }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.endsWith('.enc') ? [full] : [];
  });
}

function main() {
  const [source, target] = process.argv.slice(2);
  if (!source) throw new Error('사용법: node scripts/decrypt-backup.cjs <파일.enc|폴더> [저장경로]');
  const key = loadKey();

  if (fs.statSync(source).isDirectory()) {
    if (!target) throw new Error('폴더를 복원할 때는 저장 폴더를 지정하세요.');
    let count = 0;
    for (const file of walk(source)) {
      const out = path.join(target, path.relative(source, file).replace(/\.enc$/, ''));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, decrypt(fs.readFileSync(file), key));
      count++;
    }
    process.stdout.write(`${count}개 파일을 복원했습니다: ${target}\n`);
    return;
  }

  const plain = decrypt(fs.readFileSync(source), key);
  if (target) {
    fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
    fs.writeFileSync(target, plain);
    process.stdout.write(`복원했습니다: ${target}\n`);
  } else {
    process.stdout.write(plain);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
