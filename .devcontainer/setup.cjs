// Codespaces 테스트 환경 준비: 없는 것만 만들고 기존 데이터는 건드리지 않습니다.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const sharePath = path.join(__dirname, 'sample-share');
const sampleResults = path.join(__dirname, 'sample-results');
const seededMarker = path.join(sharePath, '.seeded');

// 이전 버전 OpsBox가 만든 DB(버전 표시 없이 예전 테이블이 있음)는 열 수 없으므로, 지우지 않고 이름을 바꿔 옆에 둡니다.
// (Codespaces는 테스트 환경이라 새 DB로 다시 시작합니다. 샘플 결과도 다시 넣습니다.)
const dbPath = process.env.OPSBOX_DB_PATH || path.join(root, 'data', 'opsbox.db');
if (fs.existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  const legacy = version === 0 && db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'users'").get();
  db.close();
  if (legacy) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbPath + suffix)) fs.renameSync(dbPath + suffix, `${dbPath}.legacy-${stamp}${suffix}`);
    }
    fs.rmSync(seededMarker, { force: true });
    console.log(`이전 버전 DB를 옮겨 두고 새 DB로 시작합니다: ${dbPath}.legacy-${stamp}`);
  }
}

// 테스트 계정·샘플 서버 (OpsBox 서비스로 만듦)
fs.mkdirSync(sharePath, { recursive: true });
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const seed = spawnSync(process.execPath, [tsxCli, path.join(__dirname, 'seed.ts')], { cwd: root, stdio: 'inherit' });
if (seed.status !== 0) process.exit(seed.status ?? 1);

// 샘플 점검 결과를 수신함(.devcontainer/sample-share/results, devcontainer.json의 OPSBOX_RESULT_INBOX)에 한 번만 복사합니다.
// OpsBox가 가져가면(DB 저장 + 암호화 백업) 원본은 지워지므로 Git 추적 폴더와 분리합니다.
if (!fs.existsSync(seededMarker) && fs.existsSync(sampleResults)) {
  fs.cpSync(sampleResults, path.join(sharePath, 'results'), { recursive: true, preserveTimestamps: true });
  fs.writeFileSync(seededMarker, new Date().toISOString());
  console.log('샘플 점검 결과 복사: .devcontainer/sample-share/results');
}
