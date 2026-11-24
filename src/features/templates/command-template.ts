/*
 * 관리 명령 템플릿(COMMAND) 해석.
 * 줄 규칙은 실행기 조각(*-PART-COMMAND_RUNNER)과 같습니다.
 *   "# @opsbox-키 값" = 머리 주석, "#"로 시작하는 다른 줄·빈 줄 = 무시, 나머지 = 도구에 넣을 명령.
 */

export type CommandLevel = 'Critical' | 'Warning' | 'Healthy';

export interface CommandTemplate {
  product: string;
  tool: string;
  home: string;
  args: string;
  require: string[];
  quit: string;
  timeoutSeconds: number;
  rules: Array<{ level: CommandLevel; pattern: string }>;
  commands: string[];
}

export interface CommandIssue { line: number; message: string }

const LEVELS: readonly string[] = ['Critical', 'Warning', 'Healthy'];
const DEFAULT_TIMEOUT_SECONDS = 20;

export function parseCommandTemplate(content: string): { template: CommandTemplate; errors: CommandIssue[]; warnings: CommandIssue[] } {
  const template: CommandTemplate = { product: '', tool: '', home: '', args: '', require: [], quit: '', timeoutSeconds: DEFAULT_TIMEOUT_SECONDS, rules: [], commands: [] };
  const errors: CommandIssue[] = [];
  const warnings: CommandIssue[] = [];
  const lineErrors: CommandIssue[] = [];

  content.split('\n').forEach((raw, index) => {
    const no = index + 1;
    const line = raw.replace(/\r$/, '');
    const header = /^#\s*@opsbox-([a-z]+)\s+(.*)$/.exec(line);
    if (header) {
      const key = header[1];
      const value = header[2].trimEnd();
      switch (key) {
        case 'product': template.product = value; break;
        case 'tool': template.tool = value; break;
        case 'home': template.home = value; break;
        case 'args':
          template.args = value;
          if (/-P(?!\$\{)\S/.test(value)) warnings.push({ line: no, message: '@opsbox-args에 비밀번호를 직접 적었을 수 있습니다. ${환경변수}로 바꾸세요.' });
          break;
        case 'require': template.require = value.split(/\s+/).filter(Boolean); break;
        case 'quit': template.quit = value; break;
        case 'timeout': {
          const seconds = Number(value);
          if (/^\d+$/.test(value) && seconds > 0) template.timeoutSeconds = seconds;
          else lineErrors.push({ line: no, message: `${no}번 줄: @opsbox-timeout은 1 이상의 정수(초)여야 합니다.` });
          break;
        }
        case 'status': {
          const rule = /^(\S+)\s+~\s+(\S.*)$/.exec(value);
          if (!rule) { lineErrors.push({ line: no, message: `${no}번 줄: 판정 규칙은 '<수준> ~ <정규식>' 형식이어야 합니다.` }); break; }
          if (!LEVELS.includes(rule[1])) { lineErrors.push({ line: no, message: `${no}번 줄: 수준은 Critical·Warning·Healthy 중 하나여야 합니다.` }); break; }
          try { new RegExp(rule[2]); } catch { lineErrors.push({ line: no, message: `${no}번 줄: 정규식이 올바르지 않습니다.` }); break; }
          template.rules.push({ level: rule[1] as CommandLevel, pattern: rule[2] });
          break;
        }
        default: warnings.push({ line: no, message: `@opsbox-${key}는 모르는 머리 주석이라 무시합니다.` });
      }
    } else if (/^\s*#/.test(line) || !line.trim()) {
      // 일반 주석·빈 줄
    } else {
      template.commands.push(line);
    }
  });

  if (!template.tool) errors.push({ line: 0, message: '@opsbox-tool(관리 도구 이름)이 필요합니다.' });
  errors.push(...lineErrors);
  if (!template.commands.length) errors.push({ line: 0, message: '도구에 넣을 명령 줄이 1개 이상 필요합니다.' });
  return { template, errors, warnings };
}
