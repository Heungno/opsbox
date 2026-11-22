/*
 * 점검 만들기 Windows 실기 검증용 PowerShell 만들기
 *
 * 이 환경(Termux)에는 PowerShell이 없어, 생성기가 만든 조각을 실제 Windows에서 돌려 볼 단일 .ps1을 만듭니다.
 * 6가지 유형의 직접 입력 사례(판정 기대값 있음)와 Windows 준비된 점검 전체(판정은 서버마다 다름)를 담습니다.
 *
 * 사용: node node_modules/tsx/dist/cli.mjs scripts/build-windows-check-test.ts [출력 경로]
 * Windows: powershell -ExecutionPolicy Bypass -File .\opsbox-check-builder-test.ps1
 *          → 같은 폴더에 opsbox-check-builder-test-result.json 이 생깁니다.
 */
import { writeFileSync } from 'node:fs';

import { psLiteral } from '../src/features/scripts/check-builder/literal';
import { presetsFor } from '../src/features/scripts/check-builder/presets';
import type { BuilderSpec } from '../src/features/scripts/check-builder/types';
import { generateWindowsPart } from '../src/features/scripts/check-builder/windows';

interface Case {
  id: string;
  name: string;
  spec: BuilderSpec;
  inputs?: Record<string, string>;
  /** 기대 상태. 없으면 서버 환경에 따라 달라 기록만 합니다(단, '점검 중 오류'는 실패). */
  expect?: string;
  /** 메시지에 들어 있어야 할 문구 */
  expectMessage?: string;
}

const cases: Case[] = [
  // 명령 결과 숫자 비교
  { id: 'T_NUM_OK', name: '숫자: 정상 값', spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: "Write-Output 'value: 42.5'", warning: 70, critical: 90 }, expect: 'Healthy' },
  { id: 'T_NUM_CRIT', name: '숫자: 위험 값', spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: '95', warning: 70, critical: 90 }, expect: 'Critical' },
  { id: 'T_NUM_LOWER', name: '숫자: 낮을수록 나쁨', spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: '15', direction: 'LOWER_IS_WORSE', warning: 30, critical: 10 }, expect: 'Warning' },
  { id: 'T_NUM_NONUM', name: '숫자: 출력에 숫자 없음', spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: "'없음'", warning: 1, critical: 2 }, expect: 'NotCollected', expectMessage: '숫자를 찾지 못했습니다' },
  { id: 'T_NUM_NOCMD', name: '숫자: 없는 명령(127)', spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: 'Get-OpsBoxNoSuchCommand', warning: 1, critical: 2 }, expect: 'NotCollected', expectMessage: '실행할 수 없습니다' },
  { id: 'T_NUM_EXIT', name: '숫자: 네이티브 종료 코드 3', spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: 'cmd /c "echo 5 & exit 3"', warning: 1, critical: 2 }, expect: 'NotCollected', expectMessage: '종료 코드 3' },
  { id: 'T_NUM_TIMEOUT', name: '숫자: 시간 초과(OPSBOX_CB_TIMEOUT=3)', spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: 'Start-Sleep -Seconds 10; 1', warning: 1, critical: 2 }, expect: 'NotCollected', expectMessage: '초과했습니다' },
  { id: 'T_NUM_TRICKY', name: '숫자: 따옴표·$·백틱이 든 명령', spec: { version: 1, type: 'COMMAND_NUMBER', presetId: null, command: `$a = 'it''s'; $b = "x\`$y"; Write-Output ("{0} {1} 7" -f $a, $b)`, warning: 70, critical: 90 }, expect: 'Healthy' },
  // 명령 결과 문구 확인 (한글 출력 인코딩 포함)
  { id: 'T_TXT_KO', name: '문구: 한글 정상 문구', spec: { version: 1, type: 'COMMAND_TEXT', presetId: null, command: "Write-Output '서비스 상태: 정상 동작'", badPhrases: ['중지'], goodPhrases: ['정상 동작'] }, expect: 'Healthy' },
  { id: 'T_TXT_BAD', name: '문구: 한글 비정상 문구', spec: { version: 1, type: 'COMMAND_TEXT', presetId: null, command: "Write-Output '서비스 상태: 중지됨'", badPhrases: ['중지'], level: 'Warning' }, expect: 'Warning', expectMessage: '중지' },
  { id: 'T_TXT_NOGOOD', name: '문구: 정상 문구 없음', spec: { version: 1, type: 'COMMAND_TEXT', presetId: null, command: "Write-Output 'unknown'", badPhrases: ['FAIL'], goodPhrases: ['OK'] }, expect: 'Warning', expectMessage: '정상 문구' },
  { id: 'T_TXT_SVC', name: '문구: Get-Service 출력', spec: { version: 1, type: 'COMMAND_TEXT', presetId: null, command: '(Get-Service -Name EventLog).Status', badPhrases: ['Stopped'], goodPhrases: ['Running'] }, expect: 'Healthy' },
  // 설정값 비교 (레지스트리)
  { id: 'T_SET_GE', name: '설정: CurrentBuild >= 9200 (2012 이상)', spec: { version: 1, type: 'SETTING_VALUE', presetId: null, settingPath: 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', settingName: 'CurrentBuild', comparator: '>=', expected: '9200' }, expect: 'Healthy' },
  { id: 'T_SET_NE', name: '설정: 문자열 다름 확인', spec: { version: 1, type: 'SETTING_VALUE', presetId: null, settingPath: 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', settingName: 'ProductName', comparator: '=', expected: 'OpsBox Not A Product', level: 'Warning' }, expect: 'Warning', expectMessage: '기대값과 다릅니다' },
  { id: 'T_SET_MISSING', name: '설정: 없는 값', spec: { version: 1, type: 'SETTING_VALUE', presetId: null, settingPath: 'HKLM:\\SOFTWARE\\OpsBoxNoSuchKey', settingName: 'Nothing', comparator: '=', expected: '1' }, expect: 'NotCollected', expectMessage: '읽을 수 없습니다' },
  // 원격 포트 접속
  { id: 'T_PORT', name: '포트: 열림·닫힘·형식 오류', spec: { version: 1, type: 'REMOTE_PORT', presetId: null, timeoutSeconds: 2, level: 'Warning' }, inputs: { targets: '127.0.0.1:135\n127.0.0.1:1\nbad-format' }, expect: 'Warning' },
  { id: 'T_PORT_EMPTY', name: '포트: 대상 미입력', spec: { version: 1, type: 'REMOTE_PORT', presetId: null, timeoutSeconds: 2 }, expect: 'NotCollected', expectMessage: '입력하세요' },
  // 파일 최신 여부 (준비 단계에서 만든 임시 파일)
  { id: 'T_FILE', name: '파일: 최신 + 없는 파일', spec: { version: 1, type: 'FILE_FRESHNESS', presetId: null, maxAgeHours: 24, missingLevel: 'Warning' }, inputs: { paths: '@@TEMP@@\\fresh.txt;@@TEMP@@\\missing.txt' }, expect: 'Warning' },
  { id: 'T_FILE_OLD', name: '파일: 오래된 파일', spec: { version: 1, type: 'FILE_FRESHNESS', presetId: null, maxAgeHours: 24 }, inputs: { paths: '@@TEMP@@\\old.txt' }, expect: 'Warning' },
  // 로그 문구 검색 (한글 로그 포함)
  { id: 'T_LOG', name: '로그: 문구 3건(주의 3/위험 5, UTF-8 BOM 없는 한글 포함)', spec: { version: 1, type: 'LOG_PATTERN', presetId: null, phrases: ['ERROR', '오류'], periodDays: 7, warning: 3, critical: 5 }, inputs: { paths: '@@TEMP@@\\logs' }, expect: 'Warning' },
  { id: 'T_LOG_NOPATH', name: '로그: 없는 경로', spec: { version: 1, type: 'LOG_PATTERN', presetId: null, phrases: ['ERROR'], periodDays: 7, warning: 1, critical: 5 }, inputs: { paths: '@@TEMP@@\\nope' }, expect: 'NotCollected', expectMessage: '로그 경로가 없습니다' },
  // Windows 준비된 점검 전체 (판정은 서버마다 다름)
  ...presetsFor('Windows').map((preset): Case => ({
    id: `P_${preset.id.replace(/\W/g, '_').toUpperCase()}`,
    name: `준비된 점검: ${preset.name}`,
    spec: preset.type === 'SETTING_VALUE'
      ? { version: 1, type: preset.type, presetId: preset.id, settingPath: 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', settingName: 'CurrentBuild', comparator: '>=', expected: '9200' }
      : { version: 1, type: preset.type, presetId: preset.id },
  })),
];

const config = { checks: { rolePolicySettings: Object.fromEntries(cases.map((c) => [c.id, { inputs: c.inputs ?? {} }])) } };
const expectations = cases.map((c) => `  @{ id = ${psLiteral(c.id)}; name = ${psLiteral(c.name)}; expect = ${psLiteral(c.expect ?? '')}; message = ${psLiteral(c.expectMessage ?? '')} }`);

const script = [
  '# OpsBox 점검 만들기 Windows 실기 검증 (scripts/build-windows-check-test.ts 로 생성)',
  '# 실행: powershell -ExecutionPolicy Bypass -File .\\opsbox-check-builder-test.ps1',
  '# 읽기 전용 조회만 합니다. %TEMP%\\opsbox-cb-test 에 시험용 파일을 만들고 끝나면 지웁니다.',
  "$ErrorActionPreference = 'Continue'",
  '$cbTestDir = Join-Path $env:TEMP \'opsbox-cb-test\'',
  'Remove-Item -LiteralPath $cbTestDir -Recurse -Force -ErrorAction SilentlyContinue',
  'New-Item -ItemType Directory -Path (Join-Path $cbTestDir \'logs\') -Force | Out-Null',
  "Set-Content -LiteralPath (Join-Path $cbTestDir 'fresh.txt') -Value 'fresh'",
  "Set-Content -LiteralPath (Join-Path $cbTestDir 'old.txt') -Value 'old'",
  "(Get-Item -LiteralPath (Join-Path $cbTestDir 'old.txt')).LastWriteTime = (Get-Date).AddDays(-3)",
  `[IO.File]::WriteAllText((Join-Path $cbTestDir 'logs\\app.log'), ${psLiteral('INFO start\r\nERROR disk\r\n디스크 오류 발생\r\nINFO ok\r\nERROR again\r\n')}, (New-Object Text.UTF8Encoding $false))`,
  '$env:OPSBOX_CB_TIMEOUT = $null',
  `$cbConfigJson = ${psLiteral(JSON.stringify(config))}.Replace('@@TEMP@@', $cbTestDir.Replace('\\', '\\\\'))`,
  '$opsboxConfig = $cbConfigJson | ConvertFrom-Json',
  '$script:rolePolicyResults = @()',
  '$cbLog = @()',
  'function Write-OpsBoxLog { param([string]$Message) $script:cbLog += ((Get-Date).ToString(\'HH:mm:ss\') + \' \' + $Message); Write-Host $Message }',
  '$cbStarted = Get-Date',
  ...cases.map((c) => {
    const part = generateWindowsPart({ itemId: c.id, itemName: c.name, role: 'BASIC', spec: c.spec });
    return c.id === 'T_NUM_TIMEOUT' ? `$env:OPSBOX_CB_TIMEOUT = '3'\n${part}\n$env:OPSBOX_CB_TIMEOUT = $null` : part;
  }),
  '$cbExpectations = @(',
  expectations.join(',\n'),
  ')',
  '$cbSummary = @()',
  'foreach ($cbE in $cbExpectations) {',
  '  $cbR = @($script:rolePolicyResults | Where-Object { $_.item -eq $cbE.id }) | Select-Object -First 1',
  "  $cbVerdict = 'PASS'; $cbWhy = ''",
  "  if ($null -eq $cbR) { $cbVerdict = 'FAIL'; $cbWhy = '결과 없음' }",
  "  elseif (([string]$cbR.detail.message).StartsWith('점검 중 오류')) { $cbVerdict = 'FAIL'; $cbWhy = $cbR.detail.message }",
  "  elseif ($cbE.expect -and $cbR.status -ne $cbE.expect) { $cbVerdict = 'FAIL'; $cbWhy = \"기대 $($cbE.expect), 실제 $($cbR.status)\" }",
  "  elseif ($cbE.message -and ([string]$cbR.detail.message).IndexOf($cbE.message) -lt 0) { $cbVerdict = 'FAIL'; $cbWhy = \"메시지에 '$($cbE.message)' 없음\" }",
  "  elseif (-not $cbE.expect) { $cbVerdict = 'INFO' }",
  '  $cbSummary += New-Object PSObject -Property ([ordered]@{ verdict = $cbVerdict; id = $cbE.id; name = $cbE.name; status = $(if ($cbR) { $cbR.status } else { \'\' }); message = $(if ($cbR) { [string]$cbR.detail.message } else { \'\' }); why = $cbWhy })',
  '}',
  "$cbSummary | Format-Table verdict, id, status, message, why -AutoSize -Wrap | Out-String -Width 220 | Write-Host",
  "$cbFail = @($cbSummary | Where-Object { $_.verdict -eq 'FAIL' }).Count",
  'Write-Host ("FAIL {0} / 전체 {1}" -f $cbFail, $cbSummary.Count)',
  '$cbOs = Get-WmiObject Win32_OperatingSystem',
  '$cbReport = [ordered]@{',
  "  generatedAt = (Get-Date).ToString('o'); elapsedSeconds = [math]::Round(((Get-Date) - $cbStarted).TotalSeconds, 1)",
  '  psVersion = $PSVersionTable.PSVersion.ToString(); clrVersion = $PSVersionTable.CLRVersion.ToString()',
  '  os = $cbOs.Caption; osVersion = $cbOs.Version; culture = (Get-Culture).Name; outputEncoding = [Console]::OutputEncoding.WebName',
  '  failCount = $cbFail; summary = $cbSummary; results = $script:rolePolicyResults; log = $cbLog',
  '}',
  "$cbOut = Join-Path $(if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }) 'opsbox-check-builder-test-result.json'",
  '[IO.File]::WriteAllText($cbOut, ($cbReport | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding $false))',
  'Remove-Item -LiteralPath $cbTestDir -Recurse -Force -ErrorAction SilentlyContinue',
  'Write-Host "결과 파일: $cbOut"',
].join('\r\n');

const out = process.argv[2] ?? 'opsbox-check-builder-test.ps1';
// Windows PowerShell 5.1 이하가 한글을 읽도록 UTF-8 BOM
writeFileSync(out, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(script.replace(/\r?\n/g, '\r\n'), 'utf8')]));
console.log(`${out} (${cases.length}개 사례)`);
