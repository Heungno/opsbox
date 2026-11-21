// Codespaces 테스트 환경 준비: 없는 파일만 만들고 기존 데이터는 건드리지 않습니다.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, scryptSync } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const userFile = path.join(dataDir, 'user.json');
const serverFile = path.join(dataDir, 'servers.json');
const sharePath = path.join(__dirname, 'sample-share');
const sampleResults = path.join(__dirname, 'sample-results');
const seededMarker = path.join(sharePath, '.seeded');

const TEST_USER = 'admin';
const TEST_PASSWORD = 'opsbox1234';

fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(userFile)) {
  const salt = randomBytes(32);
  const passwordHash = scryptSync(TEST_PASSWORD, salt, 64).toString('hex');
  const users = [{ username: TEST_USER, displayName: '테스트 관리자', passwordSalt: salt.toString('hex'), passwordHash }];
  fs.writeFileSync(userFile, `${JSON.stringify({ users }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(`테스트 계정 생성: ${TEST_USER} / ${TEST_PASSWORD}`);
}

if (!fs.existsSync(serverFile)) {
  const servers = [
    {
      basicInfo: { id: 'SAMPLE-WEB01', name: '샘플 웹서버', os: 'Linux', ip: '192.0.2.10', sharedPath: sharePath },
      roles: { selected: ['WEB'], products: { WEB: 'Nginx' } },
      policy: {
        basic: { processes: [], directories: [], fileChecks: [], ports: [], httpChecks: [], policy: null, queryTemplateId: '', policyIds: {}, scriptParts: {} },
        web: { checks: [], settings: {}, scriptParts: {} },
        was: { checks: [], settings: {}, scriptParts: {} },
        db: { checks: [], settings: {}, scriptParts: {}, customQueryTemplateIds: [] },
      },
    },
  ];
  fs.writeFileSync(serverFile, `${JSON.stringify(servers, null, 2)}\n`, 'utf8');
  console.log('샘플 서버 생성: SAMPLE-WEB01');
}

// 샘플 점검 결과를 공유 폴더 자리에 한 번만 복사합니다.
// OpsBox가 가져가면(DB 저장 + 암호화 백업) 원본은 지워지므로 Git 추적 폴더와 분리합니다.
if (!fs.existsSync(seededMarker) && fs.existsSync(sampleResults)) {
  fs.cpSync(sampleResults, path.join(sharePath, 'results'), { recursive: true, preserveTimestamps: true });
  fs.writeFileSync(seededMarker, new Date().toISOString());
  console.log('샘플 점검 결과 복사: .devcontainer/sample-share/results');
}
