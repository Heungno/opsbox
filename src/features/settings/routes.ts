import type { FastifyInstance } from 'fastify';

import { recordAudit } from '../../services/auditService';
import { ok, requireObject } from '../../shared/http';
import { getResultPathSettings, saveResultPathSettings } from './service';

export async function settingsRoutes(app: FastifyInstance) {
  // 결과 수집: 수신함(읽기 전용)과 OS별 기본 결과 저장 경로
  app.get('/settings/result-paths', async () => ok(getResultPathSettings()));

  app.put<{ Body: { windows?: string; linux?: string } }>('/settings/result-paths', async (request) => {
    const before = getResultPathSettings();
    const saved = saveResultPathSettings(requireObject(request.body));
    recordAudit(request, {
      action: 'SETTINGS_UPDATE',
      targetId: 'result-paths',
      summary: '결과 저장 경로 기본값 변경',
      before: { windows: before.windows, linux: before.linux },
      after: { windows: saved.windows, linux: saved.linux },
    });
    return ok(saved);
  });
}
