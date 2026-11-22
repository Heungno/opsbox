// Codespaces 테스트 환경 준비: 없는 것만 만들고 기존 데이터는 건드리지 않습니다.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sharePath = path.join(__dirname, 'sample-share');
const sampleResults = path.join(__dirname, 'sample-results');
const seededMarker = path.join(sharePath, '.seeded');

// 테스트 계정·샘플 서버 (OpsBox 서비스로 만듦)
fs.mkdirSync(sharePath, { recursive: true });
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const seed = spawnSync(process.execPath, [tsxCli, path.join(__dirname, 'seed.ts'), sharePath], { cwd: root, stdio: 'inherit' });
if (seed.status !== 0) process.exit(seed.status ?? 1);

// 샘플 점검 결과를 공유 폴더의 results/ 에 한 번만 복사합니다.
// OpsBox가 가져가면(DB 저장 + 암호화 백업) 원본은 지워지므로 Git 추적 폴더와 분리합니다.
if (!fs.existsSync(seededMarker) && fs.existsSync(sampleResults)) {
  fs.cpSync(sampleResults, path.join(sharePath, 'results'), { recursive: true, preserveTimestamps: true });
  fs.writeFileSync(seededMarker, new Date().toISOString());
  console.log('샘플 점검 결과 복사: .devcontainer/sample-share/results');
}
