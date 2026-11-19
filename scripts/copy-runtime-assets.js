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
copyDirectory('src/script-parts', 'src/script-parts');
copyDirectory('src/template-samples', 'src/template-samples');

const dataSource = path.join(projectRoot, 'data');
const dataDestination = path.join(distRoot, 'data');
fs.mkdirSync(dataDestination, { recursive: true });
for (const entry of fs.readdirSync(dataSource, { withFileTypes: true })) {
  const source = path.join(dataSource, entry.name);
  const destination = path.join(dataDestination, entry.name);
  if (fs.existsSync(destination)) continue;
  fs.cpSync(source, destination, { recursive: true });
}

console.log('빌드 산출물: dist');
console.log('포함 항목: 서버 코드, 화면 파일, 스크립트 원본, 템플릿 샘플, 초기 데이터');
