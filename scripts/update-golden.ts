/*
 * 기준 비교(golden) 파일 다시 만들기: node --import tsx scripts/update-golden.ts
 * 임시 폴더의 데모 DB로 서버·정책을 만들고, 생성 스크립트와 설정 API 응답을 test/golden/ 에 씁니다.
 * 동작을 일부러 바꾼 경우에만 실행하세요. (재구성 중에는 실행하지 않음)
 */
import '../test/helpers/demo-env';

import fs from 'node:fs';
import path from 'node:path';

import { GOLDEN_DIR, collectGolden } from '../test/helpers/golden';

collectGolden().then((files) => {
  fs.rmSync(GOLDEN_DIR, { recursive: true, force: true });
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(GOLDEN_DIR, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  console.log(`기준 파일 ${Object.keys(files).length}개: ${GOLDEN_DIR}`);
  process.exit(0);
}, (error) => {
  console.error(error);
  process.exit(1);
});
