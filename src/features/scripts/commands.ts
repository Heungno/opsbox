import { COMMAND_ONLY_ITEMS } from '../../shared/constants';
import { BadRequestError } from '../../shared/errors';
import { Server } from '../servers/types';
import { getServerRoles } from '../servers/service';
import { ManagedTemplate } from '../templates/types';

/*
 * 관리 도구 명령(COMMAND 템플릿) 항목
 * 서버 정책에서 COMMAND 템플릿을 고른 WEB·WAS 항목은 항목별 조각 대신 공통 실행기 조각(COMMAND_RUNNER) 하나가 실행합니다.
 */

export const COMMAND_NOT_SELECTED_MESSAGE = '서버 정책에서 관리 명령 템플릿을 고르세요.';

const COMMAND_ROLES = ['WEB', 'WAS'] as const;

export interface CommandEntry {
  role: 'WEB' | 'WAS';
  item: string;
  templateId: string;
  name: string;
  content: string;
  message: string | null;
}

/** WEB·WAS 역할 항목 중 scriptParts가 COMMAND 템플릿인 것(content 채움)과, COMMAND_ONLY_ITEMS인데 고르지 않은 것(content '', message) */
export function resolveCommandItems(server: Server, templates: ManagedTemplate[]): CommandEntry[] {
  const roles = getServerRoles(server);
  const entries: CommandEntry[] = [];
  for (const role of COMMAND_ROLES) {
    if (!roles.includes(role)) continue;
    for (const item of server.roleChecks?.[role] ?? []) {
      const selectedId = server.scriptParts?.[item];
      const template = selectedId ? templates.find((entry) => entry.id === selectedId && entry.kind === 'COMMAND') : undefined;
      if (template) {
        if (!template.enabled || template.item !== item) {
          throw new BadRequestError(`${server.os} 점검 항목 '${item}'에 지정한 스크립트 템플릿을 사용할 수 없습니다. 서버 정책에서 템플릿을 다시 선택하세요.`);
        }
        entries.push({ role, item, templateId: template.id, name: template.name, content: template.content.replace(/\r\n/g, '\n'), message: null });
      } else if (!selectedId && COMMAND_ONLY_ITEMS.has(item)) {
        entries.push({ role, item, templateId: '', name: '', content: '', message: COMMAND_NOT_SELECTED_MESSAGE });
      }
    }
  }
  return entries;
}
