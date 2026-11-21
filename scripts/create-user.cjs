const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, scryptSync } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// 서버와 같은 DB 파일을 사용합니다 (OPSBOX_DB_PATH 또는 data/opsbox.db).
const dbPath = process.env.OPSBOX_DB_PATH || path.join(process.cwd(), 'data', 'opsbox.db');

function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      reject(new Error('계정 생성은 터미널에서 실행해야 합니다.'));
      return;
    }
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let value = '';
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 3) {
          process.stdin.setRawMode(false);
          process.exit(1);
        }
        if (byte === 13 || byte === 10) {
          process.stdin.removeListener('data', onData);
          process.stdin.setRawMode(false);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (byte === 8 || byte === 127) {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (byte >= 32 && byte <= 126) {
          value += String.fromCharCode(byte);
          process.stdout.write('*');
        }
      }
    };
    process.stdin.on('data', onData);
  });
}

async function main() {
  const username = process.argv[2]?.trim();
  if (!username || !/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
    throw new Error('사용법: node scripts/create-user.cjs <아이디> (아이디는 영문, 숫자, ., _, - 조합 3~64자)');
  }
  const password = await askHidden('비밀번호: ');
  const confirmation = await askHidden('비밀번호 확인: ');
  if (password.length < 4) throw new Error('비밀번호는 12자 이상이어야 합니다.');
  if (password !== confirmation) throw new Error('비밀번호가 일치하지 않습니다.');

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY COLLATE NOCASE, display_name TEXT, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL)');
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new Error('이미 등록된 아이디입니다.');

  const salt = randomBytes(32);
  const passwordHash = scryptSync(password, salt, 64).toString('hex');
  db.prepare('INSERT INTO users (username, display_name, password_salt, password_hash) VALUES (?, ?, ?, ?)').run(username, username, salt.toString('hex'), passwordHash);
  db.close();
  process.stdout.write(`회원 계정을 추가했습니다: ${username}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
