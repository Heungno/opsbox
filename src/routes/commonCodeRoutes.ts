import { getCommonCodes } from '../services/commonCodeService';

export async function commonCodeRoutes(app) {
  app.get('/common-codes', async () => getCommonCodes());
}
