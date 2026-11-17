import fs from 'fs';
import path from 'path';

export interface ScriptInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  path: string;
  command?: string;
}

const SCRIPT_FILE = path.join(process.cwd(), 'data', 'scripts.json');

function readScripts(): any {
  const data = fs.readFileSync(SCRIPT_FILE, 'utf8');

  return JSON.parse(data);
}

export function getScripts(serverType: string, os: string): ScriptInfo[] {
  const scripts = readScripts();

  const osScripts = scripts?.[os];

  if (!osScripts) {
    return [];
  }

  const common = osScripts.COMMON ?? [];

  const target = osScripts[serverType] ?? [];

  return [...common, ...target];
}

export function getScriptById(scriptId: string): ScriptInfo | null {
  const scripts = readScripts();

  for (const os of Object.values(scripts)) {
    if (typeof os !== 'object') {
      continue;
    }

    for (const group of Object.values(os as Record<string, ScriptInfo[]>)) {
      const found = group.find((script) => script.id === scriptId);

      if (found) {
        return found;
      }
    }
  }

  return null;
}
