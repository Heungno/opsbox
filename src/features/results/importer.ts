import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { transaction } from '../../db';
import { getServer } from '../servers/service';
import { getInboxDirs } from '../settings/service';
import { getHealthStatus, parseResultJson } from './service';
import { clearImportError, countResults, findBackupPathByHash, hasSameImportError, insertResult, listImportErrors, recordImportError, updateBackupPath } from './repository';
import { writeEncryptedBackup } from './backup-crypto';
import { BadRequestError, ConflictError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { recordAudit } from '../../services/auditService';
import type { ImportStatus, ImportSummary } from './types';

/*
 * 점검 결과 가져오기
 *
 * 수신함은 OPSBOX_RESULT_INBOX(여러 개는 ; 구분, 기본 data/inbox)의 폴더입니다.
 *   - 각 수신함 바로 아래의 .json 파일만 읽습니다(하위 폴더는 읽지 않음).
 *   - 어느 서버의 결과인지는 파일 안의 서버 ID로 정합니다.
 *
 * 가져온 파일은
 *   1) DB(check_results)에 저장하고
 *   2) 원본을 암호화해 <BACKUP_DIR>/<점검 연도>/<서버ID>/<파일>.enc 로 정리해 보관한 뒤
 *   3) 수신함의 원본을 삭제합니다.
 *
 * - 같은 내용의 파일(SHA-256 동일)은 다시 저장하지 않습니다.
 * - 아직 쓰는 중일 수 있는 파일(최근 수정)은 다음 주기로 미룹니다.
 * - 읽기/형식/서버 확인 오류는 result_import_errors에 남기고 원본은 그대로 둡니다.
 * - 화면에서 올린 파일(storeUploadedResult)도 같은 검증·저장·백업 과정을 거칩니다.
 */

/** 점검 스크립트가 쓰는 점검 일시 형식 (정렬·기간 조회가 이 형식에 기대므로 다른 형식은 받지 않음) */
const CHECK_DATE_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const MIN_FILE_AGE_MS = Number(process.env.OPSBOX_IMPORT_MIN_AGE_SECONDS ?? 10) * 1000;

let running = false;
let lastSummary: ImportSummary | undefined;

interface InboxFile {
  fullPath: string;
  fileName: string;
}

/** 수신함 바로 아래의 .json 파일 (수신함 폴더가 없으면 만듭니다) */
function listInboxFiles(root: string): InboxFile[] {
  fs.mkdirSync(root, { recursive: true });
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => ({ fullPath: path.join(root, entry.name), fileName: entry.name }))
    .sort((x, y) => x.fileName.localeCompare(y.fileName));
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return value === undefined || value === null || value === '' || !Number.isFinite(number) ? null : number;
}

/** 결과 파일 안의 서버 ID (parseResultJson이 server.id를 server로 펼침) */
function serverIdInResult(parsed: { server?: unknown }): string {
  return typeof parsed.server === 'string' ? parsed.server.trim() : '';
}

/** 백업 폴더의 연도는 파일 안의 점검 일시에서 정합니다. */
function resultYear(checkDate: string): string {
  return checkDate.slice(0, 4);
}

/** 경로 구분자 등을 제거해 백업·DB에 안전하게 쓸 파일 이름으로 만듭니다. */
function safeFileName(fileName: string): string {
  const base = path.basename(fileName.replace(/\\/g, '/')).replace(/[^\p{L}\p{N}._-]/gu, '_');
  return base.toLowerCase().endsWith('.json') ? base : `${base || 'result'}.json`;
}

interface StoredResult {
  serverId: string;
  fileName: string;
  checkDate: string;
  outcome: 'imported' | 'duplicate';
}

/**
 * 결과 한 건을 검증해 DB에 저장하고 암호화 백업을 만듭니다. (원본 삭제는 호출한 쪽에서)
 * 서버를 알 수 없으면 예외를 던집니다. fallbackServerId: 파일에 서버 ID가 없을 때 쓸 ID(서버 화면에서 올린 경우)
 */
function storeResult(content: Buffer, originalName: string, fallbackServerId?: string): StoredResult {
  const text = content.toString('utf8');
  const parsed = parseResultJson(text); // JSON 형식 오류면 여기서 예외
  if (parsed.schemaVersion !== 2) throw new Error('지원하지 않는 결과 형식입니다(schemaVersion 2만 지원). 최신 점검 스크립트로 다시 점검하세요.');
  if (!CHECK_DATE_PATTERN.test(String(parsed.checkDate ?? ''))) throw new Error(`점검 일시(collectedAt) 형식이 올바르지 않습니다: ${parsed.checkDate ?? ''}`);
  const checkDate = String(parsed.checkDate);
  const contentServerId = serverIdInResult(parsed);

  const serverId = contentServerId || fallbackServerId || '';
  if (!serverId) throw new Error('파일에 서버 ID가 없습니다. OpsBox에서 내려받은 점검 스크립트의 결과 파일인지 확인하세요.');
  const server = getServer(serverId);
  if (!server) throw new Error(`등록되지 않은 서버 ID입니다: ${serverId}. 서버 관리에서 서버를 먼저 등록하세요.`);
  if (!server.enabled) throw new Error(`미사용 서버의 결과입니다: ${serverId}. 서버 목록에서 [다시 사용]을 누른 뒤 가져오세요.`);

  const fileName = safeFileName(originalName);
  const year = resultYear(checkDate);
  const hash = createHash('sha256').update(content).digest('hex');
  const exists = findBackupPathByHash(hash);

  // 1) 먼저 암호화 백업을 만들고 (실패하면 원본을 지우지 않음)
  const backupPath = exists?.backup_path && fs.existsSync(exists.backup_path)
    ? exists.backup_path
    : writeEncryptedBackup(path.join(year, serverId, fileName), content, hash);

  // 2) DB 저장
  if (!exists) {
    transaction(() => insertResult({
      serverId,
      fileName,
      checkDate,
      hostname: parsed.hostname || null,
      status: getHealthStatus(parsed),
      cpu: numberOrNull(parsed.cpu),
      memory: numberOrNull(parsed.memory),
      disk: numberOrNull(parsed.disk),
      fileHash: hash,
      rawJson: text.replace(/^\uFEFF/, ''),
      backupPath,
    }));
  } else if (exists.backup_path !== backupPath) {
    updateBackupPath(hash, backupPath);
  }

  return { serverId, fileName, checkDate, outcome: exists ? 'duplicate' : 'imported' };
}

function importInboxFile(file: InboxFile): StoredResult {
  const stored = storeResult(fs.readFileSync(file.fullPath), file.fileName);
  // 3) 수신함의 원본 삭제
  fs.unlinkSync(file.fullPath);
  clearImportError(file.fullPath);
  return stored;
}

/**
 * 화면에서 올린 결과 파일 저장. expectedServerId가 있으면(서버 상세 화면에서 올린 경우)
 * 파일 안의 서버 ID와 같아야 합니다.
 */
export function storeUploadedResult(content: Buffer, originalName: string, expectedServerId?: string): StoredResult {
  if (!content.length) throw new BadRequestError('빈 파일입니다.');
  let stored: StoredResult;
  try {
    if (expectedServerId) {
      const parsed = parseResultJson(content.toString('utf8'));
      const contentServerId = serverIdInResult(parsed);
      if (contentServerId && contentServerId !== expectedServerId) {
        throw new Error(`이 파일은 ${contentServerId} 서버의 결과입니다. ${expectedServerId} 서버 화면에서는 올릴 수 없습니다.`);
      }
    }
    stored = storeResult(content, originalName, expectedServerId);
  } catch (error) {
    if (error instanceof SyntaxError) throw new BadRequestError('JSON 형식이 아닙니다. OpsBox 점검 스크립트가 만든 결과 파일인지 확인하세요.');
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError((error as Error).message);
  }
  return stored;
}

export function importResults(): ImportSummary {
  if (running) throw new ConflictError('점검 결과 가져오기가 이미 실행 중입니다. 잠시 후 다시 시도하세요.');
  running = true;
  const summary: ImportSummary = {
    startedAt: new Date().toISOString(),
    finishedAt: '',
    scanned: 0,
    imported: 0,
    duplicates: 0,
    skippedRecent: 0,
    failed: 0,
    errors: [],
  };
  try {
    for (const root of getInboxDirs()) {
      let files: InboxFile[] = [];
      try {
        files = listInboxFiles(root);
      } catch (error) {
        summary.failed++;
        summary.errors.push({ file: root, message: `수신함 폴더를 읽을 수 없습니다: ${(error as Error).message}` });
        continue;
      }
      for (const file of files) {
        summary.scanned++;
        try {
          if (Date.now() - fs.statSync(file.fullPath).mtimeMs < MIN_FILE_AGE_MS) {
            summary.skippedRecent++;
            continue;
          }
          const { outcome } = importInboxFile(file);
          if (outcome === 'imported') summary.imported++;
          else summary.duplicates++;
        } catch (error) {
          const message = (error as Error).message;
          const repeated = hasSameImportError(file.fullPath, message);
          summary.failed++;
          summary.errors.push({ file: file.fullPath, message, repeated });
          recordImportError(file.fullPath, null, message);
        }
      }
    }
  } finally {
    running = false;
    summary.finishedAt = new Date().toISOString();
    lastSummary = summary;
  }
  return summary;
}

export function getImportStatus(): ImportStatus {
  return { running, inboxes: getInboxDirs(), lastRun: lastSummary ?? null, totalResults: countResults(), pendingErrors: listImportErrors() };
}

/** 가져오기 결과를 애플리케이션 로그와 감사 로그에 남깁니다. */
export function logImportSummary(summary: ImportSummary, trigger: 'manual' | 'schedule') {
  const newErrors = summary.errors.filter((error) => !error.repeated);
  if (summary.imported || summary.duplicates || summary.failed) {
    logger.info({ trigger, imported: summary.imported, duplicates: summary.duplicates, failed: summary.failed, waiting: summary.skippedRecent }, '점검 결과 가져오기');
  }
  newErrors.forEach((error) => logger.error({ file: error.file, reason: error.message }, '점검 결과 가져오기 실패'));
  summary.errors.filter((error) => error.repeated).forEach((error) => logger.debug({ file: error.file, reason: error.message }, '점검 결과 가져오기 실패 (이전과 같은 오류)'));
  return newErrors.length;
}

/*
 * 주기 실행: 서버 시작 직후 1회, 이후 OPSBOX_IMPORT_INTERVAL_MINUTES(기본 5분)마다.
 * 0 이하로 설정하면 자동 실행을 끕니다 (API로 수동 실행만).
 * 새로 가져왔거나 새 오류가 있을 때만 감사 로그(system)에 남깁니다.
 */
export function startResultImportScheduler() {
  const minutes = Number(process.env.OPSBOX_IMPORT_INTERVAL_MINUTES ?? 5);
  const run = () => {
    try {
      const summary = importResults();
      const newErrors = logImportSummary(summary, 'schedule');
      if (summary.imported || newErrors) {
        recordAudit(null, {
          action: 'RESULT_IMPORT',
          summary: `자동 가져오기: 신규 ${summary.imported}건, 실패 ${summary.failed}건`,
          detail: { trigger: 'schedule', imported: summary.imported, duplicates: summary.duplicates, failed: summary.failed, errors: summary.errors.filter((error) => !error.repeated) },
        });
      }
    } catch (error) {
      if (!(error instanceof ConflictError)) logger.error({ err: error }, '점검 결과 가져오기 오류');
    }
  };
  run();
  if (Number.isFinite(minutes) && minutes > 0) {
    const timer = setInterval(run, minutes * 60 * 1000);
    timer.unref();
  }
}
