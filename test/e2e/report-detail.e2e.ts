import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { startApp, type TestApp } from './helpers/app';
import { findBrowser, openSession, settle } from './helpers/browser';

/*
 * 보고서 상세 구조 고정: 재구성 전후로 섹션 제목·주요 표시가 같아야 합니다.
 * (데모 데이터는 같은 시드로 만들어 날짜만 실행일 기준으로 바뀜)
 */
const skip = findBrowser() ? false : '브라우저 없음 (OPSBOX_E2E_BROWSER)';
let app: TestApp;
before(async () => { if (!skip) app = await startApp(); });
after(async () => { await app?.stop(); });

async function snapshot(serverId: string) {
  const session = await openSession(app.baseUrl);
  try {
    const cookie = (await session.page.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    const reports = (await (await fetch(`${app.baseUrl}/api/reports`, { headers: { cookie } })).json()).data;
    const latest = reports.find((report: { serverId: string }) => report.serverId === serverId);
    await session.page.goto(`${app.baseUrl}/reports/detail?serverId=${serverId}&file=${encodeURIComponent(latest.fileName)}`, { waitUntil: 'domcontentloaded' });
    await settle(2500);
    const view = await session.page.evaluate(() => ({
      headings: [...document.querySelectorAll('main h2, main h3')].filter((h) => (h as HTMLElement).offsetParent !== null).map((h) => h.textContent?.replace(/\s+/g, ' ').trim()),
      header: document.querySelector('.report-print-header, #print-header')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      title: (document.querySelector('main .header p, #report-title')?.textContent?.replace(/\s+/g, ' ').trim() ?? '').replace(/점검일시: [\d-]+ [\d:]+/, '점검일시: *'),
    }));
    return { ...view, errors: [...session.errors] };
  } finally {
    await session.browser.close();
  }
}

test('보고서 상세: WEB(WebtoB)·DB(MSSQL)·기타 서버의 섹션 구조와 머리말', { skip }, async () => {
  const views = { WEB: await snapshot('WEB-01'), DB: await snapshot('DB-01'), OTHER: await snapshot('FILE-01') };
  for (const view of Object.values(views)) assert.deepEqual(view.errors, []);
  // 처음 실행에서 얻은 값을 아래에 고정합니다(재구성 전 기준).
  assert.deepEqual(Object.fromEntries(Object.entries(views).map(([key, view]) => [key, { headings: view.headings, title: view.title }])), EXPECTED);
});

const EXPECTED: Record<string, { headings: string[]; title: string }> = {
  "WEB": {
    "headings": [
      "공통 점검 결과",
      "서버 정보",
      "종합 진단 상태",
      "자원 사용량 요약",
      "자원 사용 추세",
      "점검 항목별 결과",
      "포털 DB 포트 접속",
      "디스크 사용량",
      "프로세스",
      "디렉터리 사용량",
      "파일 크기",
      "포트 리스닝",
      "HTTP 응답",
      "역할별 점검 결과",
      "WEB 역할 점검 결과",
      "WEB 엔진 상태",
      "WEB-WAS 연동 상태",
      "사용자 요청 처리량",
      "WEB 로그 상태",
      "현재 자동 수집되지 않는 항목"
    ],
    "title": "서버: WEB-01 | 역할: WEB | OS: Microsoft Windows Server 2019 Standard (10.0.17763) | 점검일시: *"
  },
  "DB": {
    "headings": [
      "공통 점검 결과",
      "서버 정보",
      "종합 진단 상태",
      "자원 사용량 요약",
      "자원 사용 추세",
      "점검 항목별 결과",
      "포털 DB 포트 접속",
      "디스크 사용량",
      "프로세스",
      "디렉터리 사용량",
      "포트 리스닝",
      "역할별 점검 결과",
      "DB 역할 점검 결과",
      "DB 인스턴스·접속 상태",
      "세션·프로세스 사용률",
      "데이터 영역 사용률",
      "백업 상태",
      "아카이브 모드 상태",
      "트랜잭션 로그 사용률",
      "복제·이중화 상태",
      "현재 자동 수집되지 않는 항목"
    ],
    "title": "서버: DB-01 | 역할: DB | OS: Microsoft Windows Server 2019 Datacenter (10.0.17763) | 점검일시: *"
  },
  "OTHER": {
    "headings": [
      "공통 점검 결과",
      "서버 정보",
      "종합 진단 상태",
      "자원 사용량 요약",
      "자원 사용 추세",
      "점검 항목별 결과",
      "포털 DB 포트 접속",
      "디스크 사용량",
      "프로세스",
      "디렉터리 사용량",
      "포트 리스닝",
      "역할별 점검 결과"
    ],
    "title": "서버: FILE-01 | 역할: 기타 | OS: Microsoft Windows Server 2016 Standard (10.0.14393) | 점검일시: *"
  }
};
