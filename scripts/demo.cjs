/*
 * 데모 데이터 실행기 (화면 확인용 샘플 서버·점검 결과)
 *
 *   npm run demo:seed     data/demo/ 에 데모 DB를 새로 만듭니다 (있으면 지우고 다시 만듦)
 *   npm run demo:dev      데모 DB를 쓰는 개발 서버를 http://localhost:3001 로 띄웁니다
 *   npm run demo:remove   data/demo/ 폴더를 지웁니다
 *
 * 운영 DB(data/opsbox.db)와 백업·키는 전혀 건드리지 않습니다.
 * 환경 변수를 여기서 설정하므로 Windows PowerShell에서도 같은 명령으로 실행됩니다.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const demoDir = path.join(root, 'data', 'demo');
const env = {
  ...process.env,
  OPSBOX_DB_PATH: path.join(demoDir, 'opsbox.db'),
  OPSBOX_BACKUP_DIR: path.join(demoDir, 'backup'),
  OPSBOX_BACKUP_KEY_FILE: path.join(demoDir, 'backup.key'),
  OPSBOX_LOG_DIR: path.join(demoDir, 'logs'),
  OPSBOX_PORT: process.env.OPSBOX_PORT || '3001',
};
delete env.OPSBOX_BACKUP_KEY; // 운영 백업 키를 데모에 쓰지 않도록

const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function run(args) {
  const child = spawn(process.execPath, [tsxCli, ...args], { cwd: root, env, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 1));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
}

function remove() {
  fs.rmSync(demoDir, { recursive: true, force: true });
}

const command = process.argv[2];
if (command === 'seed') {
  remove();
  run([path.join('scripts', 'seed-demo.ts')]);
} else if (command === 'dev') {
  if (!fs.existsSync(env.OPSBOX_DB_PATH)) {
    console.error('데모 DB가 없습니다. 먼저 npm run demo:seed 를 실행하세요.');
    process.exit(1);
  }
  run(['watch', path.join('src', 'server.ts')]);
} else if (command === 'remove') {
  remove();
  console.log(`데모 데이터를 지웠습니다: ${demoDir}`);
} else {
  console.error('사용법: node scripts/demo.cjs <seed|dev|remove>');
  process.exit(1);
}
