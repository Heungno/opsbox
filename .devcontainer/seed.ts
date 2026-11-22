/*
 * Codespaces 테스트 데이터: 테스트 계정과 샘플 서버를 OpsBox 서비스로 만듭니다(이미 있으면 건너뜀).
 * .devcontainer/setup.cjs 가 실행합니다: node --import tsx .devcontainer/seed.ts <공유 폴더>
 */
import { createUser } from '../src/services/authService';
import { createServer, getServer } from '../src/features/servers/service';
import { db } from '../src/db';

const TEST_USER = 'admin';
const TEST_PASSWORD = 'opsbox1234';
const sharePath = process.argv[2] ?? '';

if (!db.prepare('SELECT 1 FROM users WHERE username = ?').get(TEST_USER)) {
  createUser(TEST_USER, '테스트 관리자', TEST_PASSWORD);
  console.log(`테스트 계정 생성: ${TEST_USER} / ${TEST_PASSWORD}`);
}

if (!getServer('SAMPLE-WEB01')) {
  createServer({ id: 'SAMPLE-WEB01', name: '샘플 웹서버', os: 'Linux', ip: '192.0.2.10', sharedPath: sharePath, roles: ['WEB'], products: { WEB: 'Nginx' }, processes: [], directories: [] } as never);
  console.log('샘플 서버 생성: SAMPLE-WEB01');
}
