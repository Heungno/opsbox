import type { FastifyInstance } from 'fastify';

import { getCommonCodes, getRawCommonCodes, saveCommonCodes } from '../services/commonCodeService';
import type { CommonCodes } from '../types/commonCode';
import { ok, requireObject } from '../utils/http';

export async function commonCodeRoutes(app: FastifyInstance) {
  // 관리 화면용: 사용 여부·정렬 정보(_codeMeta)를 포함한 원본
  app.get('/common-codes/manage', async () => ok(getRawCommonCodes()));
  // 일반 화면용: 사용 중인 코드만 정렬해서
  app.get('/common-codes', async () => ok(getCommonCodes()));
  app.put<{ Body: CommonCodes }>('/common-codes', async (request) => ok(saveCommonCodes(requireObject<CommonCodes>(request.body))));
}
