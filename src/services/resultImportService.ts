import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { db, transaction } from '../db/database';
import { getAllServers } from './serverService';
import { getHealthStatus, parseResultJson } from './resultService';
import { writeEncryptedBackup } from './backupCrypto';
import { BadRequestError, ConflictError } from '../shared/errors';
import { logger } from '../shared/logger';
import { recordAudit } from './auditService';
import type { ImportStatus, ImportSummary } from '../types/result';

/*
 * 점검 결과 가져오기
 *
 * 공유 폴더의 <sharedPath>/results/ 는 "수신함"입니다.
 *   - 그 아래 어디에 있든(.json) 파일을 찾고, 파일 안의 서버 ID로 어느 서버 결과인지 정합니다.
 *     점검자는 파일을 results/ 에 그냥 넣으면 됩니다.
 *   - 예전 구조 results/<연도>/<서버ID>/ 도 그대로 읽습니다. 이때 폴더의 서버 ID와
 *     파일 안의 서버 ID가 다르면 잘못 넣은 것으로 보고 가져오지 않습니다.
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

const MIN_FILE_AGE_MS = Number(process.env.OPSBOX_IMPORT_MIN_AGE_SECONDS ?? 10) * 1000;

let running = false;
let lastSummary: ImportSummary | undefined;

const MAX_SCAN_DEPTH = 3; // results/ → <연도>/ → <서버ID>/

interface InboxFile {
  fullPath: string;
  fileName: string;
  /** 예전 구조(results/<연도>/<서버ID>/)에 있을 때의 폴더 정보 */
  folderYear?: string;
  folderServerId?: string;
}

/** 여러 서버가 같은 공유 폴더를 쓰면 수신함을 한 번만 읽도록 경로를 모읍니다. */
function inboxRoots(): string[] {
  const roots = new Set<string>();
  for (const server of getAllServers()) {
    if (server.sharedPath?.trim()) roots.add(path.resolve(server.sharedPath.trim(), 'results'));
  }
  return [...roots];
}

function listInboxFiles(root: string): InboxFile[] {
  if (!fs.existsSync(root)) return [];
  const files: InboxFile[] = [];
  const walk = (folder: string, parts: string[]) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory() && parts.length < MAX_SCAN_DEPTH - 1) {
        walk(fullPath, [...parts, entry.name]);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        const legacy = parts.length === 2 && /^\d{4}$/.test(parts[0]);
        files.push({
          fullPath,
          fileName: entry.name,
          folderYear: legacy ? parts[0] : undefined,
          folderServerId: legacy ? parts[1] : undefined,
        });
      }
    }
  };
  walk(root, []);
  return files.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function recordError(sourcePath: string, serverId: string | null, message: string) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO result_import_errors (source_path, server_id, message, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_path) DO UPDATE SET message = excluded.message, last_seen = excluded.last_seen
  `).run(sourcePath, serverId, message, now, now);
}

function clearError(sourcePath: string) {
  db.prepare('DELETE FROM result_import_errors WHERE source_path = ?').run(sourcePath);
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return value === undefined || value === null || value === '' || !Number.isFinite(number) ? null : number;
}

/** 결과 파일 안의 서버 ID (schemaVersion 2: server.id, 이전 형식: server) */
function serverIdInResult(parsed: { server?: unknown }): string {
  return typeof parsed.server === 'string' ? parsed.server.trim() : '';
}

/** 백업 폴더의 연도는 파일 안의 점검 일시에서 정합니다. */
function resultYear(checkDate: unknown, fallback?: string): string {
  const match = /^(\d{4})/.exec(String(checkDate ?? ''));
  return match?.[1] ?? fallback ?? String(new Date().getFullYear());
}

/** 경로 구분자 등을 제거해 백업·DB에 안전하게 쓸 파일 이름으로 만듭니다. */
function safeFileName(fileName: string): string {
  const base = path.basename(fileName.replace(/\\/g, '/')).replace(/[^\p{L}\p{N}._-]/gu, '_');
  return base.toLowerCase().endsWith('.json') ? base : `${base || 'result'}.json`;
}

interface StoredResult {
  serverId: string;
  fileName: string;
  checkDate: string | null;
  outcome: 'imported' | 'duplicate';
}

/**
 * 결과 한 건을 검증해 DB에 저장하고 암호화 백업을 만듭니다. (원본 삭제는 호출한 쪽에서)
 * 서버를 알 수 없거나 폴더와 내용이 맞지 않으면 예외를 던집니다.
 */
function storeResult(content: Buffer, originalName: string, hint: { folderYear?: string; folderServerId?: string } = {}): StoredResult {
  const text = content.toString('utf8');
  const parsed = parseResultJson(text); // 형식 오류면 여기서 예외
  const contentServerId = serverIdInResult(parsed);

  if (hint.folderServerId && contentServerId && contentServerId !== hint.folderServerId) {
    throw new Error(`파일 안의 서버 ID(${contentServerId})가 폴더(${hint.folderServerId})와 다릅니다. 올바른 서버의 결과인지 확인하세요.`);
  }
  const serverId = contentServerId || hint.folderServerId || '';
  if (!serverId) throw new Error('파일에 서버 ID가 없습니다. OpsBox에서 내려받은 점검 스크립트의 결과 파일인지 확인하세요.');
  if (!getAllServers().some((server) => server.id === serverId)) {
    throw new Error(`등록되지 않은 서버 ID입니다: ${serverId}. 서버 관리에서 서버를 먼저 등록하세요.`);
  }

  const fileName = safeFileName(originalName);
  const year = resultYear(parsed.checkDate, hint.folderYear);
  const hash = createHash('sha256').update(content).digest('hex');
  const exists = db.prepare('SELECT backup_path FROM check_results WHERE file_hash = ?').get(hash) as { backup_path: string | null } | undefined;

  // 1) 먼저 암호화 백업을 만들고 (실패하면 원본을 지우지 않음)
  const backupPath = exists?.backup_path && fs.existsSync(exists.backup_path)
    ? exists.backup_path
    : writeEncryptedBackup(path.join(year, serverId, fileName), content, hash);

  // 2) DB 저장
  if (!exists) {
    transaction(() => {
      db.prepare(`
        INSERT INTO check_results (server_id, file_name, check_date, status, cpu, memory, disk, file_hash, raw_json, backup_path, imported_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        serverId,
        fileName,
        parsed.checkDate ? String(parsed.checkDate) : null,
        getHealthStatus(parsed),
        numberOrNull(parsed.cpu),
        numberOrNull(parsed.memory),
        numberOrNull(parsed.disk),
        hash,
        text.replace(/^\uFEFF/, ''),
        backupPath,
        new Date().toISOString(),
      );
    });
  } else if (exists.backup_path !== backupPath) {
    db.prepare('UPDATE check_results SET backup_path = ? WHERE file_hash = ?').run(backupPath, hash);
  }

  return { serverId, fileName, checkDate: parsed.checkDate ? String(parsed.checkDate) : null, outcome: exists ? 'duplicate' : 'imported' };
}

function importInboxFile(file: InboxFile): StoredResult {
  const stored = storeResult(fs.readFileSync(file.fullPath), file.fileName, file);
  // 3) 수신함의 원본 삭제
  fs.unlinkSync(file.fullPath);
  clearError(file.fullPath);
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
    stored = storeResult(content, originalName, { folderServerId: expectedServerId });
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
    for (const root of inboxRoots()) {
      let files: InboxFile[] = [];
      try {
        files = listInboxFiles(root);
      } catch (error) {
        summary.failed++;
        summary.errors.push({ file: root, message: `공유 폴더를 읽을 수 없습니다: ${(error as Error).message}` });
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
          const repeated = Boolean(db.prepare('SELECT 1 FROM result_import_errors WHERE source_path = ? AND message = ?').get(file.fullPath, message));
          summary.failed++;
          summary.errors.push({ file: file.fullPath, message, repeated });
          recordError(file.fullPath, file.folderServerId ?? null, message);
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
  const errors = db.prepare('SELECT source_path AS file, server_id AS serverId, message, first_seen AS firstSeen, last_seen AS lastSeen FROM result_import_errors ORDER BY last_seen DESC').all() as unknown as ImportStatus['pendingErrors'];
  const total = (db.prepare('SELECT COUNT(*) AS count FROM check_results').get() as { count: number }).count;
  return { running, lastRun: lastSummary ?? null, totalResults: total, pendingErrors: errors };
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
