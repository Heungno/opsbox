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
copyDirectory('seeds', 'seeds');

console.log('빌드 산출물: dist');
console.log('포함 항목: 서버 코드, 화면 파일, 기본 공통코드·템플릿·점검 정책 (seeds/, 빈 DB에 처음 넣는 값)');
