import type { ReportField } from './types';

export type { ReportField } from './types';

const REPORT_RULES: Record<string, ReportField[]> = {
  WEB: [
    {
      key: 'cpu',
      label: 'CPU 사용률',
      category: 'resource',
    },

    {
      key: 'memory',
      label: '메모리 사용률',
      category: 'resource',
    },

    {
      key: 'disk',
      label: '디스크 사용률',
      category: 'resource',
    },

    {
      key: 'network',
      label: '네트워크',
      category: 'network',
    },

    {
      key: 'logError',
      label: '로그 오류',
      category: 'service',
    },
  ],

  WAS: [
    {
      key: 'cpu',
      label: 'CPU 사용률',
      category: 'resource',
    },

    {
      key: 'memory',
      label: '메모리 사용률',
      category: 'resource',
    },

    {
      key: 'disk',
      label: '디스크 사용률',
      category: 'resource',
    },

    {
      key: 'network',
      label: '네트워크',
      category: 'network',
    },

    {
      key: 'logError',
      label: '애플리케이션 오류',
      category: 'service',
    },
  ],

  DB: [
    {
      key: 'cpu',
      label: 'CPU 사용률',
      category: 'resource',
    },

    {
      key: 'memory',
      label: '메모리 사용률',
      category: 'resource',
    },

    {
      key: 'disk',
      label: '디스크 사용률',
      category: 'resource',
    },

    {
      key: 'network',
      label: '네트워크',
      category: 'network',
    },
  ],

  OTHER: [
    { key: 'cpu', label: 'CPU 사용률', category: 'resource' },
    { key: 'memory', label: '메모리 사용률', category: 'resource' },
    { key: 'disk', label: '디스크 사용률', category: 'resource' },
    { key: 'network', label: '네트워크', category: 'network' },
  ],
};

export function getReportFields(serverType: string) {
  return REPORT_RULES[serverType] ?? [];
}
