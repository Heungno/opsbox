import { getCommonCodes, getRawCommonCodes, saveCommonCodes, CommonCodes } from '../services/commonCodeService';

export async function commonCodeRoutes(app) {
  app.get('/common-codes/manage', async () => getRawCommonCodes());
  app.get('/common-codes', async () => getCommonCodes());
  app.put('/common-codes', async (request) => saveCommonCodes(request.body as CommonCodes));
}
