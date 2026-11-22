/*
 * 보고서 상세: 섹션별 요약 문구와 표시 도우미 (DOM 전역·화면 상태를 쓰지 않음)
 */

export function summarizeRolePolicyDetail(item) {
  if (item.message) return item.message;
  if (item.item === 'WEB_ENGINE_STATUS') {
    const command = item.detail?.command || item.command;
    return command ? `${command} 실행 결과 확인` : 'WebtoB 엔진 상태 확인';
  }
  if (['WEB_LOG', 'WAS_LOG'].includes(item.item) && item.detail?.categories) {
    const counts = item.detail.categories;
    const readError = item.detail.readErrors?.[0];
    const readWarning = item.detail.readErrorCount ? ` · 읽기 실패 ${item.detail.readErrorCount}개${readError ? ` (${readError.path}: ${readError.message})` : ''}` : '';
    return `최근 ${item.detail.periodDays ?? 7}일 · 파일 ${item.detail.checkedFileCount ?? 0}개 · Fatal ${counts.fatal ?? 0} · Error/Exception ${counts.errorException ?? 0} · Warning ${counts.warning ?? 0} · HTTP 5xx ${counts.http5xx ?? 0} · HTTP 4xx ${counts.http4xx ?? 0}${readWarning}`;
  }
  if (Array.isArray(item.detail?.queries)) return item.detail.queries.map((query) => `${query.target ? `[${query.target}] ` : ''}${query.name || query.id || item.detail.queryName || '쿼리'}: ${query.status}${query.rowCount !== undefined ? ` · ${query.rowCount}행` : ''}${query.output ? ` · ${query.output}` : query.message ? ` · ${query.message}` : ''}`).join('\n').slice(0, 1200);
  if (typeof item.detail === 'string') return item.detail.slice(0, 800);
  if (Array.isArray(item.detail)) return `${item.detail.length}개 상세 결과`;
  if (item.detail?.output) return String(item.detail.output).slice(0, 800);
  if (item.detail?.message) return item.detail.message;
  if (item.detail && typeof item.detail === 'object') return Object.entries(item.detail).map(([key, value]) => `${key}: ${value}`).join(' · ').slice(0, 800);
  return item.status || '결과 없음';
}

export function summarizeWebtoB(check) {
  if (!check || check.status === 'NotCollected') return { status: 'NotCollected', detail: check?.message || 'wsadmin 결과 없음' };
  return { status: check.status, detail: check.message || `${check.command} 실행 결과 확인` };
}

export function summarizeDatabaseCheck(check, product) {
  if (!check || check.status === 'NotCollected') return { status: 'NotCollected', detail: check?.message || `${product || 'DB'} 연결 결과 없음` };
  if (check.message) return { status: check.status, detail: check.message };
  if (check.instances?.length) {
    const failed = check.instances.filter((instance) => instance.status === 'Critical');
    if (failed.length) return { status: check.status, detail: failed.map((instance) => `${instance.target}: ${instance.message || '접속 실패'}`).join(' · ').slice(0, 800) };
    return { status: check.status, detail: `${check.instances.length}개 인스턴스 점검 · ${check.databaseCount ?? 0}개 DB · ${check.instances.map((instance) => instance.serverName || instance.target).join(', ')}` };
  }
  const serverInfo = [check.serverName, check.version, check.edition].filter(Boolean).join(' · ');
  const detail = `${check.databaseCount ?? 0}개 DB · 정상 ${Math.max(0, (check.databaseCount ?? 0) - (check.offlineCount ?? 0))}개${serverInfo ? ` · ${serverInfo}` : ''}`;
  return { status: check.status, detail };
}

export function summarizeWasRuntime(items, product) {
  if (product === 'Node.js') return { status: 'NotCollected', detail: 'Node.js 런타임 수집기 미설정' };
  if (!items?.length) return { status: 'NotCollected', detail: 'JVM Heap 결과 없음' };
  const collected = items.filter((item) => item.heapUsagePercent !== undefined);
  if (!collected.length) return { status: 'NotCollected', detail: items[0].message || 'JDK jstat를 사용할 수 없음' };
  const worst = collected.reduce((max, item) => Math.max(max, Number(item.heapUsagePercent) || 0), 0);
  const status = collected.some((item) => item.status === 'Critical') ? 'Critical' : collected.some((item) => item.status === 'Warning') ? 'Warning' : 'Healthy';
  return { status, detail: `${collected.length}개 JVM · 최대 ${worst}%` };
}

export function summarizeMetric(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { status: 'NotCollected', detail: '결과 값 없음' };
  return { status: value >= 90 ? 'Critical' : value >= 70 ? 'Warning' : 'Healthy', detail: `${value}%` };
}

export function summarizeProcesses(items) {
  if (!items?.length) return { status: 'NotCollected', detail: '프로세스 결과 없음' };
  const stopped = items.filter((item) => item.running === false).map((item) => item.name);
  return { status: stopped.length ? 'Critical' : 'Healthy', detail: stopped.length ? `중지: ${stopped.join(', ')}` : `${items.length}개 프로세스 실행 중` };
}

export function summarizePorts(items) {
  if (!items?.length) return { status: 'NotCollected', detail: '포트 점검 미등록' };
  const stopped = items.filter((item) => item.listening === false);
  return { status: stopped.length ? 'Critical' : 'Healthy', detail: stopped.length ? `${stopped.length}개 포트 미수신` : `${items.length}개 포트 수신 중` };
}

export function summarizeHttp(items) {
  if (!items?.length) return { status: 'NotCollected', detail: 'HTTP 점검 미등록 또는 미수집' };
  const failed = items.filter((item) => item.success === false);
  const avg = Math.round(items.reduce((sum, item) => sum + (item.responseTimeMs || 0), 0) / items.length);
  return { status: failed.length ? 'Critical' : 'Healthy', detail: failed.length ? `${failed.length}개 URL 실패` : `${items.length}개 URL 정상 · 평균 ${avg} ms` };
}

export function summarizeDisks(disks, totalUsage) {
  if (disks?.length) {
    const worst = disks.reduce((max, item) => Math.max(max, item.usagePercent || 0), 0);
    return { status: worst >= 90 ? 'Critical' : worst >= 70 ? 'Warning' : 'Healthy', detail: `${disks.length}개 디스크 · 최대 ${worst}%` };
  }
  return summarizeMetric(totalUsage);
}

export function summarizePaths(directories, files) {
  const count = (directories?.length || 0) + (files?.length || 0);
  if (!count) return { status: 'NotCollected', detail: '경로·파일 점검 미등록' };
  const missing = (directories || []).filter((item) => item.exists === false).length + (files || []).filter((item) => item.status === 'Critical' || item.exists === false).length;
  const warning = (files || []).filter((item) => item.status === 'Warning').length;
  return { status: missing ? 'Critical' : warning ? 'Warning' : 'Healthy', detail: `${count}개 경로 점검 · ${missing ? `${missing}개 확인 필요` : '대상 확인됨'}` };
}

/** OS 정보: 결과 파일 값 우선, 없으면 등록한 OS */
export function osInfo(data, registeredOs = '') {
  const name = data.host?.osName?.trim() || '';
  const version = data.host?.osVersion?.trim() || '';
  const registered = registeredOs || '';
  if (name) {
    return { name, version, collected: true, label: version ? `${name} (${version})` : name };
  }
  return { name: registered, version, collected: false, label: registered };
}

/** 이전 점검과의 차이 배지 (차이가 없으면 "변화없음", 비교 대상이 없으면 null) */
export function createDiffBadge(currentVal, prevVal, isPercent = true) {
  if (prevVal === undefined || prevVal === null || isNaN(prevVal)) return null;
  const diff = Math.round((currentVal - prevVal) * 10) / 10;
  if (diff === 0) {
    const span = document.createElement('span');
    span.className = 'diff-badge diff-same';
    span.textContent = '- (변화없음)';
    return span;
  }

  const span = document.createElement('span');
  if (diff > 0) {
    span.className = 'diff-badge diff-up';
    span.textContent = `▲ +${diff}${isPercent ? '%' : ''}`;
  } else {
    span.className = 'diff-badge diff-down';
    span.textContent = `▼ ${diff}${isPercent ? '%' : ''}`;
  }
  return span;
}

/** 가동 시간: 년·개월·일·시간·분 */
export function formatUptime(minutes, parts) {
  let values;
  if (parts && ['years', 'months', 'days', 'hours', 'minutes'].some((key) => Number(parts[key]) > 0)) {
    values = [
      [Number(parts.years) || 0, '년'],
      [Number(parts.months) || 0, '개월'],
      [Number(parts.days) || 0, '일'],
      [Number(parts.hours) || 0, '시간'],
      [Number(parts.minutes) || 0, '분'],
    ];
  } else {
    let remaining = Math.max(0, Math.floor(Number(minutes) || 0));
    const minutesPerYear = 365 * 24 * 60;
    const minutesPerMonth = 30 * 24 * 60;
    let years = Math.floor(remaining / minutesPerYear);
    remaining %= minutesPerYear;
    let months = Math.floor(remaining / minutesPerMonth);
    remaining %= minutesPerMonth;
    if (months === 12) { years += 1; months = 0; }
    const days = Math.floor(remaining / (24 * 60));
    remaining %= 24 * 60;
    const hours = Math.floor(remaining / 60);
    const mins = remaining % 60;
    values = [[years, '년'], [months, '개월'], [days, '일'], [hours, '시간'], [mins, '분']];
  }
  const formatted = values.filter(([value]) => value > 0).map(([value, unit]) => `${value}${unit}`);
  return formatted.length ? formatted.join(' ') : '0분';
}
