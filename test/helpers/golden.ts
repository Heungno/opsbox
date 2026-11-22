/*
 * 기준 비교(golden): 데모 서버·정책으로 만든 생성 스크립트와 설정 API 응답을 모읍니다.
 * test/helpers/demo-env 를 먼저 import 한 상태에서 부르세요.
 *
 * 응답 정규화(재구성으로 바뀌는 것이 허용된 키만 뺌):
 * - 서버 객체: type, product, enabled
 * - 정책 객체: checks
 * - 점검 만들기가 생성한 템플릿(generated)의 updatedAt: 생성 시각이라 실행마다 다름
 */
import path from 'node:path';

export const GOLDEN_DIR = path.join(__dirname, '..', 'golden');

const SERVER_IGNORED = ['type', 'product', 'enabled'];
const POLICY_IGNORED = ['checks'];

const omit = (value: any, keys: string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
};
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

let prepared: Promise<(url: string) => Promise<{ statusCode: number; body: string; data: any }>> | undefined;

/** 데모 서버·정책을 한 번만 만들고, 로그인한 GET 요청 함수를 돌려줍니다. */
function prepare() {
  prepared ??= (async () => {
    const { seedDemo } = await import('../../scripts/seed-demo');
    await seedDemo({ results: false });
    const { createUser } = await import('../../src/features/auth/service');
    const { app } = await import('../../src/server');
    createUser('golden', '기준 비교', 'golden-pass-1234');
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'golden', password: 'golden-pass-1234' } });
    if (login.statusCode !== 200) throw new Error(`기준 비교 로그인 실패: ${login.body}`);
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    return async (url: string) => {
      const response = await app.inject({ method: 'GET', url, headers: { cookie } });
      if (response.statusCode !== 200) throw new Error(`${url} → ${response.statusCode}: ${response.body}`);
      const isJson = String(response.headers['content-type'] ?? '').includes('application/json');
      return { statusCode: response.statusCode, body: response.body, data: isJson ? response.json().data : undefined };
    };
  })();
  return prepared;
}

/** 키: test/golden 아래 파일 경로(/ 구분), 값: 파일 내용 */
export async function collectGolden(): Promise<Record<string, string>> {
  const get = await prepare();
  const files: Record<string, string> = {};

  // 미사용 서버도 설정 응답은 비교하고, 스크립트는 내려받을 수 없으므로 사용 중인 서버만
  const servers: any[] = (await get('/api/servers?includeInactive=1')).data;
  files['api/servers.json'] = json(servers.map((server) => omit(server, SERVER_IGNORED)));
  for (const server of servers) {
    const id = encodeURIComponent(server.id);
    files[`api/servers/${server.id}.json`] = json(omit((await get(`/api/servers/${id}`)).data, SERVER_IGNORED));
    files[`api/servers/${server.id}/check-config.json`] = json((await get(`/api/servers/${id}/check-config`)).data);
    if (server.enabled !== false) files[`scripts/${server.id}.${server.os === 'Windows' ? 'ps1' : 'sh'}`] = (await get(`/api/scripts/generate/${id}`)).body;
  }
  files['api/policies.json'] = json((await get('/api/policies')).data.map((policy: any) => omit(policy, POLICY_IGNORED)));
  files['api/templates.json'] = json((await get('/api/templates')).data.map((template: any) => (template.generated ? { ...template, updatedAt: '<생성 시각>' } : template)));
  files['api/common-codes.json'] = json((await get('/api/common-codes')).data);
  files['api/common-codes-manage.json'] = json((await get('/api/common-codes/manage')).data);
  return files;
}
