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
// 서버에서 실행용 라이브러리를 설치할 때 쓰는 목록 (npm run package가 dist/node_modules를 이걸로 채움)
for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(projectRoot, file), path.join(distRoot, file));
// 운영 서버에서 쓰는 관리 도구 (Node 기본 모듈만 씀, dist 폴더에서 node scripts/<파일>로 실행)
//   create-user.cjs     계정 만들기
//   decrypt-backup.cjs  암호화된 점검 결과 백업 복원
fs.mkdirSync(path.join(distRoot, 'scripts'), { recursive: true });
for (const file of ['create-user.cjs', 'decrypt-backup.cjs']) fs.copyFileSync(path.join(projectRoot, 'scripts', file), path.join(distRoot, 'scripts', file));

console.log('빌드 산출물: dist');
console.log('포함 항목: 서버 코드, 화면 파일, 기본 공통코드·템플릿·점검 정책 (seeds/, 빈 DB에 처음 넣는 값), package.json·package-lock.json, 관리 도구 (scripts/create-user.cjs, scripts/decrypt-backup.cjs)');
