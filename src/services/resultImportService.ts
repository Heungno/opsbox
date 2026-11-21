import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { db, transaction } from '../db/database';
import { getAllServers } from './serverService';
import { getHealthStatus, parseResultJson } from './resultService';
import { writeEncryptedBackup } from './backupCrypto';

/*
 * 점검 결과 가져오기
 *
 * 각 서버의 공유 폴더 <sharedPath>/results/<연도>/<서버ID>/*.json 을 찾아
 *   1) DB(check_results)에 저장하고
 *   2) 원본을 암호화해 백업 폴더(<BACKUP_DIR>/<연도>/<서버ID>/<파일>.enc)에 보관한 뒤
 *   3) 공유 폴더의 원본을 삭제합니다.
 *
 * - 같은 내용의 파일(SHA-256 동일)은 다시 저장하지 않습니다.
 * - 아직 쓰는 중일 수 있는 파일(최근 수정)은 다음 주기로 미룹니다.
 * - 읽기/형식 오류는 result_import_errors에 남기고 원본은 그대로 둡니다.
 */

const MIN_FILE_AGE_MS = Number(process.env.OPSBOX_IMPORT_MIN_AGE_SECONDS ?? 10) * 1000;

export interface ImportSummary {
  startedAt: string;
  finishedAt: string;
  scanned: number;
  imported: number;
  duplicates: number;
  skippedRecent: number;
  failed: number;
  errors: Array<{ file: string; message: string }>;
}

let running = false;
let lastSummary: ImportSummary | undefined;

function listResultFiles(sharedPath: string, serverId: string) {
  const resultsRoot = path.join(sharedPath, 'results');
  if (!sharedPath || !fs.existsSync(resultsRoot)) return [];
  const files: Array<{ year: string; fullPath: string; fileName: string }> = [];
  for (const year of fs.readdirSync(resultsRoot, { withFileTypes: true })) {
    if (!year.isDirectory() || !/^\d{4}$/.test(year.name)) continue;
    const folder = path.join(resultsRoot, year.name, serverId);
    if (!fs.existsSync(folder)) continue;
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        files.push({ year: year.name, fullPath: path.join(folder, entry.name), fileName: entry.name });
      }
    }
  }
  return files.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function recordError(sourcePath: string, serverId: string, message: string) {
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

function importFile(serverId: string, year: string, fullPath: string, fileName: string): 'imported' | 'duplicate' {
  const content = fs.readFileSync(fullPath);
  const text = content.toString('utf8');
  const parsed = parseResultJson(text); // 형식 오류면 여기서 예외
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
        text.replace(/^﻿/, ''),
        backupPath,
        new Date().toISOString(),
      );
    });
  } else if (exists.backup_path !== backupPath) {
    db.prepare('UPDATE check_results SET backup_path = ? WHERE file_hash = ?').run(backupPath, hash);
  }

  // 3) 공유 폴더의 원본 삭제
  fs.unlinkSync(fullPath);
  clearError(fullPath);
  return exists ? 'duplicate' : 'imported';
}

export function importResults(): ImportSummary {
  if (running) throw new Error('점검 결과 가져오기가 이미 실행 중입니다.');
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
    for (const server of getAllServers()) {
      let files: ReturnType<typeof listResultFiles> = [];
      try {
        files = listResultFiles(server.sharedPath, server.id);
      } catch (error) {
        summary.failed++;
        summary.errors.push({ file: server.sharedPath, message: `공유 폴더를 읽을 수 없습니다: ${(error as Error).message}` });
        continue;
      }
      for (const file of files) {
        summary.scanned++;
        try {
          if (Date.now() - fs.statSync(file.fullPath).mtimeMs < MIN_FILE_AGE_MS) {
            summary.skippedRecent++;
            continue;
          }
          const outcome = importFile(server.id, file.year, file.fullPath, file.fileName);
          if (outcome === 'imported') summary.imported++;
          else summary.duplicates++;
        } catch (error) {
          const message = (error as Error).message;
          summary.failed++;
          summary.errors.push({ file: file.fullPath, message });
          recordError(file.fullPath, server.id, message);
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

export function getImportStatus() {
  const errors = db.prepare('SELECT source_path AS file, server_id AS serverId, message, first_seen AS firstSeen, last_seen AS lastSeen FROM result_import_errors ORDER BY last_seen DESC').all();
  const total = (db.prepare('SELECT COUNT(*) AS count FROM check_results').get() as { count: number }).count;
  return { running, lastRun: lastSummary ?? null, totalResults: total, pendingErrors: errors };
}

/*
 * 주기 실행: 서버 시작 직후 1회, 이후 OPSBOX_IMPORT_INTERVAL_MINUTES(기본 5분)마다.
 * 0 이하로 설정하면 자동 실행을 끕니다 (API로 수동 실행만).
 */
export function startResultImportScheduler(log: { info: (msg: string) => void; error: (msg: string) => void }) {
  const minutes = Number(process.env.OPSBOX_IMPORT_INTERVAL_MINUTES ?? 5);
  const run = () => {
    try {
      const summary = importResults();
      if (summary.imported || summary.duplicates || summary.failed) {
        log.info(`점검 결과 가져오기: 신규 ${summary.imported}건, 중복 ${summary.duplicates}건, 실패 ${summary.failed}건, 대기 ${summary.skippedRecent}건`);
      }
      summary.errors.forEach((error) => log.error(`점검 결과 가져오기 실패: ${error.file} - ${error.message}`));
    } catch (error) {
      log.error(`점검 결과 가져오기 오류: ${(error as Error).message}`);
    }
  };
  run();
  if (Number.isFinite(minutes) && minutes > 0) {
    const timer = setInterval(run, minutes * 60 * 1000);
    timer.unref();
  }
}
