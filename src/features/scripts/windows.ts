import { Server } from '../servers/types';
import { ManagedTemplate } from '../templates/types';
import { buildScriptConfig, selectScriptParts } from './assembly';

const CONFIG_TOKEN = '@@CONFIG_BASE64@@';

export function assembleWindowsScript(server: Server, templates: ManagedTemplate[], policyQueryTemplates: ManagedTemplate[] = [], customQueryTemplates: ManagedTemplate[] = []): string {
  const config = buildScriptConfig(server, policyQueryTemplates, customQueryTemplates, templates);
  // 명령 항목이 없으면 commands 키를 넣지 않아 기존 서버의 스크립트가 그대로입니다.
  const { commands, ...configWithoutCommands } = config;
  const encodedConfig = Buffer.from(JSON.stringify(commands.length ? config : configWithoutCommands), 'utf8').toString('base64');

  return selectScriptParts(server, templates, 'Windows', CONFIG_TOKEN)
    .map((part) => part.replace(CONFIG_TOKEN, encodedConfig))
    .join('\r\n\r\n')
    // 이번 실행에 쓴 정책 정의를 결과에 함께 저장해, 지난 보고서도 그때의 표시 구성으로 그립니다.
    .replace('checks = [ordered]@{', 'checks = [ordered]@{\n    policyDefinitions = $opsboxConfig.checks.policyItems');
}
