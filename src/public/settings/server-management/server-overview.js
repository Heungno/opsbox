/* 서버 상세 › 개요: 결과 경로 표시, 최근 점검 상태, 역할 표시 */
import { roleLabel } from '../../shared/js/codes.js';

const CHECK_STATUSES = ['Healthy', 'Warning', 'Critical', 'NotCollected'];

/** 결과 저장 경로: 서버 지정 → OS별 기본값 → 스크립트 폴더 */
export function effectiveResultPath(server, settings) {
  if (server.resultPath) return { path: server.resultPath, source: '이 서버만 지정' };
  const fallback = server.os === 'Windows' ? settings.windows : server.os === 'Linux' ? settings.linux : '';
  if (fallback) return { path: fallback, source: `${server.os} 기본값` };
  return { path: '', source: '스크립트가 있는 폴더에 저장 (설정 → 결과 수집에서 기본값을 정할 수 있습니다)' };
}

/** 최근 점검 결과의 상태 */
export function healthOf(result) {
  // 결과에 기록된 종합 상태(점검 당시 정책으로 계산)를 먼저 씁니다. 서버·보고서와 같은 규칙입니다.
  if (CHECK_STATUSES.includes(result.summary?.status)) return result.summary.status;
  if (result.fileChecks?.some((file) => file.status === 'Critical' || file.exists === false)) {
    return 'Critical';
  }
  if (result.disks?.some((disk) => disk.status === 'Critical')) {
    return 'Critical';
  }
  if (result.ports?.some((port) => port.listening === false)) {
    return 'Critical';
  }
  if (result.httpChecks?.some((check) => check.success === false)) return 'Critical';
  if (result.wasChecks?.some((check) => check.status === 'Critical')) return 'Critical';
  if (result.ports?.some((port) => port.listening === false)) {
    return 'Critical';
  }
  const max = Math.max(result.cpu || 0, result.memory || 0, result.disk || 0);

  if (max >= 90) {
    return 'Critical';
  }

  if (max >= 70) {
    return 'Warning';
  }

  if (result.fileChecks?.some((file) => file.status === 'Warning')) {
    return 'Warning';
  }
  if (result.disks?.some((disk) => disk.status === 'Warning')) {
    return 'Warning';
  }
  if (result.wasChecks?.some((check) => check.status === 'Warning')) return 'Warning';

  return 'Healthy';
}

/** 역할 배지: 'WEB + 기타' (공통코드 이름) */
export function roleBadgeText(roles) {
  return roles.map(roleLabel).join(' + ');
}
