const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');

function copyDirectory(sourceRelativePath, destinationRelativePath) {
  const source = path.join(projectRoot, sourceRelativePath);
  const destination = path.join(distRoot, destinationRelativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

copyDirectory('src/public', 'src/public');
const dataDestination = path.join(distRoot, 'data');
fs.mkdirSync(dataDestination, { recursive: true });
for (const fileName of ['common-codes.json', 'templates.json', 'policy.json']) {
  const source = path.join(projectRoot, 'data', fileName);
  const destination = path.join(dataDestination, fileName);
  fs.copyFileSync(source, destination);
}

console.log('빌드 산출물: dist');
console.log('포함 항목: 서버 코드, 화면 파일, 공통 코드·템플릿·점검 정책 JSON 초기 데이터 (첫 실행 시 SQLite로 이관)');
