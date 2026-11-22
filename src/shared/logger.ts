import path from 'node:path';
import pino from 'pino';

/*
 * OpsBox 애플리케이션 로그
 *
 * - 화면(터미널): 읽기 쉬운 형태(pino-pretty). 요청은 'GET /경로 → 200 (5ms) [요청ID]' 한 줄
 * - 파일: JSON 한 줄씩, logs/opsbox.<날짜>.<번호>.log
 *   하루마다 새 파일, 한 파일이 OPSBOX_LOG_MAX_SIZE(기본 100m)를 넘으면 번호를 올려 새 파일.
 *   최근 OPSBOX_LOG_RETENTION_FILES(기본 30)개만 남기고 오래된 파일은 자동 삭제.
 * - 화면 오류 알림의 "요청 ID"는 파일의 reqId로 찾을 수 있습니다.
 *
 * 환경변수
 *   OPSBOX_LOG_LEVEL            기본 info (debug, warn, error 등)
 *   OPSBOX_LOG_DIR              기본 logs
 *   OPSBOX_LOG_FILE             false면 파일 기록 끄기
 *   OPSBOX_LOG_RETENTION_FILES  기본 30
 *   OPSBOX_LOG_MAX_SIZE         기본 100m
 */

export const LOG_DIR = process.env.OPSBOX_LOG_DIR || path.join(process.cwd(), 'logs');
const level = process.env.OPSBOX_LOG_LEVEL || 'info';
const fileEnabled = process.env.OPSBOX_LOG_FILE !== 'false';
const retentionFiles = Math.max(1, Number(process.env.OPSBOX_LOG_RETENTION_FILES ?? 30) || 30);
const maxSize = process.env.OPSBOX_LOG_MAX_SIZE || '100m';

const targets: pino.TransportTargetOptions[] = [
  {
    target: 'pino-pretty',
    level,
    // 요청 관련 필드는 메시지 한 줄에 담겨 있으므로 콘솔에서는 펼치지 않고(파일에는 남음), 요청 ID만 끝에 붙입니다.
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname,reqId,req,res,responseTime,method,url,statusCode,errorCode,ip',
      messageFormat: '{msg}{if reqId} [{reqId}]{end}',
    },
  },
];

if (fileEnabled) {
  targets.push({
    target: 'pino-roll',
    level,
    options: {
      file: path.join(LOG_DIR, 'opsbox'),
      frequency: 'daily',
      dateFormat: 'yyyy-MM-dd',
      size: maxSize,
      mkdir: true,
      limit: { count: retentionFiles, removeOtherLogFiles: true },
    },
  });
}

export const logger = pino({
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
  // 로그에 비밀값이 남지 않도록 가립니다.
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'passwordSalt',
      '*.passwordSalt',
    ],
    censor: '[숨김]',
  },
  transport: { targets },
});

if (fileEnabled) logger.info({ logDir: LOG_DIR, retentionFiles, maxSize }, '로그 파일 기록 시작');
