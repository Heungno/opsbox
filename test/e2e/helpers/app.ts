/*
 * 브라우저 테스트용 OpsBox: 임시 폴더에 데모 데이터를 만들고 빈 포트로 띄웁니다.
 * 데모 계정: demo / demo1234
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl: string, child: ChildProcess, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`OpsBox가 시작하지 못했습니다 (종료 코드 ${child.exitCode})`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch { /* 아직 안 뜸 */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('OpsBox가 시간 안에 뜨지 않았습니다.');
}

export interface TestApp {
  baseUrl: string;
  stop(): Promise<void>;
}

export async function startApp(): Promise<TestApp> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsbox-e2e-'));
  const port = await freePort();
  const env = {
    ...process.env,
    OPSBOX_DB_PATH: path.join(dir, 'demo', 'opsbox.db'), // seed-demo는 demo 폴더의 DB에서만 동작
    OPSBOX_BACKUP_DIR: path.join(dir, 'backup'),
    OPSBOX_BACKUP_KEY_FILE: path.join(dir, 'backup.key'),
    OPSBOX_LOG_DIR: path.join(dir, 'logs'),
    OPSBOX_LOG_LEVEL: 'error',
    OPSBOX_RESULT_INBOX: path.join(dir, 'inbox'),
    OPSBOX_IMPORT_INTERVAL_MINUTES: '0',
    OPSBOX_PORT: String(port),
  };
  delete (env as Record<string, string | undefined>).OPSBOX_BACKUP_KEY;
  const seed = spawnSync(process.execPath, ['--no-warnings', '--import', 'tsx', 'scripts/seed-demo.ts'], { cwd: ROOT, env, encoding: 'utf8' });
  if (seed.status !== 0) throw new Error(`데모 데이터를 만들지 못했습니다:\n${seed.stderr}`);
  const child = spawn(process.execPath, ['--no-warnings', '--import', 'tsx', 'src/server.ts'], { cwd: ROOT, env, stdio: 'ignore' });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(baseUrl, child);
  } catch (error) {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    baseUrl,
    async stop() {
      if (child.exitCode === null) {
        const exited = new Promise((resolve) => child.once('exit', resolve));
        child.kill('SIGTERM');
        await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
        if (child.exitCode === null) child.kill('SIGKILL');
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
