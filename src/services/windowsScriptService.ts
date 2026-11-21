import { Server } from '../types/server';
import { ManagedTemplate } from '../types/template';
import { buildScriptConfig, selectScriptParts } from './scriptAssembly';

const CONFIG_TOKEN = '@@CONFIG_BASE64@@';

export function assembleWindowsScript(server: Server, templates: ManagedTemplate[], policyQueryTemplates: ManagedTemplate[] = [], customQueryTemplates: ManagedTemplate[] = []): string {
  const config = buildScriptConfig(server, policyQueryTemplates, customQueryTemplates);
  const encodedConfig = Buffer.from(JSON.stringify(config), 'utf8').toString('base64');

  return selectScriptParts(server, templates, 'Windows', CONFIG_TOKEN)
    .map((part) => part.replace(CONFIG_TOKEN, encodedConfig))
    .join('\r\n\r\n')
    // 이번 실행에 쓴 정책 정의를 결과에 함께 저장해, 지난 보고서도 그때의 표시 구성으로 그립니다.
    .replace('checks = [ordered]@{', 'checks = [ordered]@{\n    policyDefinitions = $opsboxConfig.checks.policyItems');
}
