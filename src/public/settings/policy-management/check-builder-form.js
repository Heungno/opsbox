import { api, errorMessage } from '/shared/js/api.js';

/*
 * 점검 만들기 안내형 폼 (정책 항목 창)
 *
 * 폼 값은 executor.options.builder 로 저장되고, 서버가 OS에 맞는 스크립트 조각을 만듭니다.
 * DOM은 createElement/textContent만 사용합니다(사용자 값이 HTML로 해석되지 않게).
 */

const TYPES = [
  { value: 'COMMAND_NUMBER', label: '명령 결과 숫자 비교', help: '명령 출력의 숫자를 주의·위험 기준과 비교합니다. (예: Swap 사용률, Ping 손실률)' },
  { value: 'COMMAND_TEXT', label: '명령 결과 문구 확인', help: '명령 출력에 비정상 문구가 있는지 확인합니다. (예: NIC 링크 DOWN, Multipath failed)' },
  { value: 'SETTING_VALUE', label: '설정값 비교', help: 'Linux 커널 파라미터 또는 Windows 레지스트리 값이 기준과 같은지 확인합니다.' },
  { value: 'REMOTE_PORT', label: '원격 포트 접속', help: '이 서버에서 다른 서버의 포트로 접속되는지 확인합니다. 대상은 서버 상세에서 입력합니다.' },
  { value: 'FILE_FRESHNESS', label: '파일 최신 여부', help: '파일이 정해진 시간 안에 수정되었는지 확인합니다. (예: 설정 파일 백업) 경로는 서버 상세에서 입력합니다.' },
  { value: 'LOG_PATTERN', label: '로그 문구 검색', help: '최근 기간의 로그에서 문구가 들어간 줄 수를 셉니다. 경로는 서버 상세에서 입력합니다.' },
];
const LEVELS = [['Critical', '위험'], ['Warning', '주의']];
const PRESET_TYPES = ['COMMAND_NUMBER', 'COMMAND_TEXT', 'SETTING_VALUE'];
const SERVER_INPUT_NOTE = {
  REMOTE_PORT: '서버 상세 › 점검 정책에서 서버마다 접속 대상(호스트:포트)을 한 줄에 하나씩 입력합니다.',
  FILE_FRESHNESS: '서버 상세 › 점검 정책에서 서버마다 확인할 파일 경로를 입력합니다.',
  LOG_PATTERN: '서버 상세 › 점검 정책에서 서버마다 로그 파일 또는 폴더 경로를 입력합니다.',
};
const COMMAND_WARNING = '입력한 명령은 점검 스크립트 실행 계정(보통 관리자) 권한으로 그대로 실행됩니다.';

const presetCache = new Map();
async function loadPresets(os) {
  if (!presetCache.has(os)) presetCache.set(os, await api(`/api/check-builder/presets?os=${encodeURIComponent(os)}`));
  return presetCache.get(os);
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter(Boolean));
  return node;
}

function field(label, control, help) {
  return el('label', { className: 'form-group' }, [el('span', { text: label }), control, help ? el('small', { className: 'policy-help', text: help }) : null]);
}

function select(options, value, onChange) {
  const node = el('select');
  options.forEach(([optionValue, label]) => node.add(new Option(label, optionValue)));
  node.value = value ?? options[0]?.[0] ?? '';
  node.addEventListener('change', () => onChange(node.value));
  return node;
}

const toNumber = (value) => (String(value).trim() === '' ? undefined : Number(value));
const toLines = (value) => String(value ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

function numberInput(value, onInput, attrs = {}) {
  const node = el('input', { type: 'number', step: 'any', value: value ?? '', ...attrs });
  node.addEventListener('input', () => onInput(toNumber(node.value)));
  return node;
}

function textInput(value, onInput, attrs = {}) {
  const node = el('input', { type: 'text', value: value ?? '', ...attrs });
  node.addEventListener('input', () => onInput(node.value));
  return node;
}

function linesInput(values, onInput, placeholder) {
  const node = el('textarea', { rows: 3, placeholder, value: (values ?? []).join('\n') });
  node.addEventListener('input', () => onInput(toLines(node.value)));
  return node;
}

/**
 * 폼 그리기
 * @param host 폼을 넣을 요소
 * @param options { os, category, item, template, policyId, onNameSuggest(name), onRegenerated(template) }
 */
export async function mountCheckBuilderForm(host, { os, category, item, template, policyId, onNameSuggest, onRegenerated }) {
  const presets = await loadPresets(os).catch((error) => { host.replaceChildren(el('p', { className: 'policy-help', text: errorMessage(error, '준비된 점검 목록을 불러오지 못했습니다.') })); return null; });
  if (!presets) return;
  let spec = structuredClone(item?.executor?.options?.builder ?? { version: 1, type: 'COMMAND_NUMBER', presetId: null });
  const set = (key, value) => { spec[key] = value; };
  host._readCheckBuilderSpec = () => structuredClone(spec);

  const render = () => {
    const preset = presets.find((entry) => entry.id === spec.presetId);
    const typeInfo = TYPES.find((entry) => entry.value === spec.type) ?? TYPES[0];
    const parts = [];

    if (template?.generatedState === 'DETACHED') {
      const regenerate = el('button', { type: 'button', className: 'btn btn-small', text: '폼 기준으로 다시 만들기' });
      regenerate.addEventListener('click', async () => {
        if (!policyId) return;
        if (!confirm('직접 편집한 스크립트를 폼 기준으로 다시 만들까요? 편집한 내용은 스크립트 이력에 남습니다.')) return;
        try { const next = await api(`/api/policies/${encodeURIComponent(policyId)}/items/${encodeURIComponent(item.id)}/regenerate`, { method: 'POST' }); template = { ...next, generatedState: 'GENERATED' }; onRegenerated?.(next); render(); }
        catch (error) { alert(errorMessage(error, '스크립트를 다시 만들지 못했습니다.')); }
      });
      parts.push(el('div', { className: 'check-builder-notice' }, [el('p', { text: '이 항목의 스크립트는 직접 편집되었습니다. 폼 변경은 스크립트에 반영되지 않습니다.' }), regenerate]));
    }

    parts.push(field('점검 유형', select(TYPES.map((entry) => [entry.value, entry.label]), spec.type, (value) => { spec = { version: 1, type: value, presetId: null }; render(); }), typeInfo.help));

    if (PRESET_TYPES.includes(spec.type)) {
      const options = presets.filter((entry) => entry.type === spec.type).map((entry) => [entry.id, entry.name]);
      const direct = spec.type === 'SETTING_VALUE' ? [] : [['', '직접 입력 (명령을 직접 씁니다)']];
      parts.push(field('준비된 점검', select([...options, ...direct], spec.presetId ?? '', (value) => {
        const next = presets.find((entry) => entry.id === value);
        spec = { version: 1, type: spec.type, presetId: next ? next.id : null, ...(next ? structuredClone(next.defaults) : {}) };
        if (next) onNameSuggest?.(next.name);
        render();
      })));
      if (spec.type === 'SETTING_VALUE' && !spec.presetId && options.length) { spec.presetId = options[0][0]; Object.assign(spec, structuredClone(presets.find((entry) => entry.id === spec.presetId).defaults)); return render(); }
      if (preset) {
        parts.push(el('p', { className: 'policy-help', text: preset.description }));
        if (preset.command) parts.push(field('실행 명령 (미리보기)', el('pre', { className: 'webtob-console-output check-builder-command', text: preset.command })));
      } else if (spec.type !== 'SETTING_VALUE') {
        const command = el('textarea', { rows: 3, spellcheck: false, placeholder: os === 'Windows' ? 'PowerShell 명령 (예: (Get-Service Spooler).Status)' : 'bash 명령 (예: systemctl is-active crond)', value: spec.command ?? '' });
        command.addEventListener('input', () => set('command', command.value));
        parts.push(field('실행할 명령', command), el('p', { className: 'check-builder-warning', role: 'note', text: COMMAND_WARNING }));
      }
    }

    switch (spec.type) {
      case 'COMMAND_NUMBER':
        parts.push(el('div', { className: 'form-grid' }, [
          field('판정 방향', select([['HIGHER_IS_WORSE', '높을수록 나쁨'], ['LOWER_IS_WORSE', '낮을수록 나쁨']], spec.direction ?? 'HIGHER_IS_WORSE', (value) => set('direction', value))),
          field('주의 기준', numberInput(spec.warning, (value) => set('warning', value))),
          field('위험 기준', numberInput(spec.critical, (value) => set('critical', value))),
          field('단위 (표시용)', textInput(spec.unit, (value) => set('unit', value), { maxLength: 20, placeholder: '%' })),
        ]));
        break;
      case 'COMMAND_TEXT':
        parts.push(field('비정상 문구 (한 줄에 하나)', linesInput(spec.badPhrases, (value) => set('badPhrases', value), 'state DOWN'), '출력에 하나라도 있으면 아래 수준으로 판정합니다. 대소문자는 가리지 않습니다.'));
        parts.push(field('정상 문구 (선택, 한 줄에 하나)', linesInput(spec.goodPhrases, (value) => set('goodPhrases', value), ''), '입력하면 출력에 이 문구가 없을 때 주의로 판정합니다.'));
        parts.push(field('비정상일 때 수준', select(LEVELS, spec.level ?? 'Critical', (value) => set('level', value))));
        break;
      case 'SETTING_VALUE':
        if (os === 'Windows') parts.push(field('레지스트리 경로', textInput(spec.settingPath, (value) => set('settingPath', value), { placeholder: 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters' })));
        parts.push(el('div', { className: 'form-grid' }, [
          field(os === 'Windows' ? '값 이름' : '커널 파라미터 이름', textInput(spec.settingName, (value) => set('settingName', value), { placeholder: os === 'Windows' ? 'TcpTimedWaitDelay' : 'vm.swappiness' })),
          field('비교', select([['=', '같음 (=)'], ['!=', '다름 (≠)'], ['>=', '이상 (≥)'], ['<=', '이하 (≤)']], spec.comparator ?? '=', (value) => set('comparator', value))),
          field('기대값', textInput(spec.expected, (value) => set('expected', value))),
          field('다를 때 수준', select(LEVELS, spec.level ?? 'Critical', (value) => set('level', value))),
        ]));
        break;
      case 'REMOTE_PORT':
        parts.push(el('div', { className: 'form-grid' }, [
          field('접속 제한 시간 (초)', numberInput(spec.timeoutSeconds ?? 3, (value) => set('timeoutSeconds', value), { min: 1, max: 30, step: 1 })),
          field('실패할 때 수준', select(LEVELS, spec.level ?? 'Critical', (value) => set('level', value))),
        ]));
        break;
      case 'FILE_FRESHNESS':
        parts.push(el('div', { className: 'form-grid' }, [
          field('허용 기간 (시간)', numberInput(spec.maxAgeHours, (value) => set('maxAgeHours', value), { min: 0, placeholder: '24' }), '이 시간보다 오래 수정되지 않았으면 주의입니다.'),
          field('파일이 없을 때 수준', select(LEVELS, spec.missingLevel ?? 'Critical', (value) => set('missingLevel', value))),
        ]));
        break;
      case 'LOG_PATTERN':
        parts.push(field('찾을 문구 (한 줄에 하나)', linesInput(spec.phrases, (value) => set('phrases', value), 'ERROR\nOutOfMemory'), '대소문자를 가리지 않고, 문구가 들어간 줄 수를 셉니다.'));
        parts.push(el('div', { className: 'form-grid' }, [
          field('검색 기간 (일)', numberInput(spec.periodDays ?? 7, (value) => set('periodDays', value), { min: 1, max: 365, step: 1 })),
          field('주의 기준 (건)', numberInput(spec.warning, (value) => set('warning', value), { min: 1, step: 1 })),
          field('위험 기준 (건)', numberInput(spec.critical, (value) => set('critical', value), { min: 1, step: 1 })),
        ]));
        break;
    }

    const inputs = preset?.inputs ?? [];
    const note = SERVER_INPUT_NOTE[spec.type] ?? (inputs.length ? `서버 상세 › 점검 정책에서 서버마다 '${inputs.map((input) => input.label).join("', '")}'을 입력할 수 있습니다.` : '');
    if (note) parts.push(el('p', { className: 'policy-help', text: note }));

    const preview = el('pre', { className: 'webtob-console-output check-builder-preview', hidden: true });
    const previewButton = el('button', { type: 'button', className: 'btn', text: '생성될 스크립트 보기' });
    previewButton.addEventListener('click', async () => {
      try {
        const name = document.getElementById('policy-item-name')?.value.trim();
        const result = await api('/api/check-builder/preview', { method: 'POST', body: { os, role: category, itemId: item?.id, itemName: name, spec } });
        preview.textContent = result.content;
        preview.hidden = false;
      } catch (error) {
        preview.textContent = errorMessage(error, '스크립트를 만들 수 없습니다. 입력값을 확인하세요.');
        preview.hidden = false;
      }
    });
    parts.push(el('div', { className: 'button-area' }, [previewButton]), preview);
    host.replaceChildren(...parts);
  };
  render();
}

/** 폼의 현재 값 (BuilderSpec) */
export function readCheckBuilderSpec(host) {
  return host._readCheckBuilderSpec ? host._readCheckBuilderSpec() : null;
}
