import { buildApp } from './app';
import { purgeOldAuditLogs } from './features/audit/service';
import { upgradeGeneratedTemplates } from './features/scripts/check-builder/templates';
import { startResultImportScheduler } from './features/results/importer';
import { logger } from './shared/logger';

const app = buildApp();

/* 서버 시작 */
async function start() {
  try {
    // 포트: OPSBOX_PORT (기본 3000). 데모 서버(npm run demo:dev)는 3001을 씁니다.
    const port = Number(process.env.OPSBOX_PORT) || 3000;
    await app.listen({
      host: '0.0.0.0',
      port,
    });

    app.log.info({ address: `http://localhost:${port}` }, 'OpsBox 시작');
    app.log.debug(`\n${app.printRoutes()}`);

    startResultImportScheduler();

    // 생성기 버전이 오른 점검 만들기 조각 다시 만들기 (직접 편집한 조각은 그대로)
    const upgraded = upgradeGeneratedTemplates();
    if (upgraded.length) app.log.info({ templates: upgraded }, '점검 만들기 스크립트를 새 생성기로 다시 만들었습니다');

    // 감사 로그 보관 기간 정리: 시작 시 1회 + 하루마다
    purgeOldAuditLogs();
    setInterval(purgeOldAuditLogs, 24 * 60 * 60 * 1000).unref();
  } catch (error) {
    app.log.fatal({ err: error }, 'OpsBox 시작 실패');
    await new Promise((resolve) => setTimeout(resolve, 200)); // 로그 파일에 쓸 시간
    process.exit(1);
  }
}

// 테스트에서 불러올 때는 서버를 띄우지 않고 app만 씁니다.
export { app };
if (require.main === module) runMain();

function runMain() {
  // 종료 신호: 처리 중인 요청을 마치고 로그를 남긴 뒤 종료
  let shuttingDown = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      app.log.info({ signal }, 'OpsBox 종료');
      try {
        await app.close();
      } finally {
        logger.flush();
        setTimeout(() => process.exit(0), 200);
      }
    });
  }

  process.on('unhandledRejection', (reason) => app.log.error({ err: reason }, '처리되지 않은 Promise 오류'));
  process.on('uncaughtException', (error) => {
    app.log.fatal({ err: error }, '처리되지 않은 예외로 종료합니다');
    setTimeout(() => process.exit(1), 200);
  });

  start();
}
