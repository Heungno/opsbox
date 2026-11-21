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
    // Persist the definitions used for this run so historical reports can
    // render the saved result using its original component configuration.
    .replace('checks = [ordered]@{', 'checks = [ordered]@{\n    policyDefinitions = $opsboxConfig.checks.policyItems');
}
