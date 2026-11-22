/*
 * 기준 비교(golden) 테스트 환경: helpers/env의 임시 폴더를 쓰되, DB를 demo 폴더 아래에 둡니다.
 * (scripts/seed-demo.ts가 demo 경로의 DB에서만 동작하도록 되어 있어서)
 * OpsBox 모듈보다 먼저 import 해야 합니다.
 */
import path from 'node:path';

import { TEST_ROOT } from './env';

process.env.OPSBOX_DB_PATH = path.join(TEST_ROOT, 'demo', 'opsbox.db');

export { TEST_ROOT };
