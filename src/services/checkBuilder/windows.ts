import type { GenerateArgs } from './linux';
import { assertItemId, commentText, GENERATOR_VERSION, psLiteral } from './literal';
import { builderInputs, resolveSpec } from './spec';
import { LIMITS, type BuilderSpec } from './types';

/*
 * 점검 만들기: Windows(PowerShell 3.0+) 스크립트 조각 생성
 *
 * 조각 하나 = 공통 함수(생성기 버전이 이름에 들어감) + 항목 함수 1개 + 호출.
 * 폼 값은 psLiteral(UTF-8 base64 문자열 식)로만 들어가고, 서버별 값은 $opsboxConfig.checks.rolePolicySettings 에서 읽습니다.
 * 결과는 $script:rolePolicyResults 에 @{ role; item; status; detail } 로 남기고 SAVE 조각이 모읍니다.
 * PowerShell 3.0 호환: ::new(), -in, class, using 을 쓰지 않습니다.
 */

const P = `OpsBoxCb${GENERATOR_VERSION}`;

const HELPERS = `
function ${P}-Truncate {
  param([string]$Text, [int]$Max)
  if ($null -eq $Text) { return '' }
  if ($Text.Length -le $Max) { return $Text }
  return $Text.Substring(0, $Max)
}
# 명령 실행: 자식 PowerShell(UTF-8 출력), 시간 제한 OPSBOX_CB_TIMEOUT(기본 ${LIMITS.commandTimeoutSeconds}초). 반환 @{ rc; output }, 시간 초과는 rc 124
function ${P}-Run {
  param([string]$Command, [hashtable]$Environment)
  $cbTimeout = ${LIMITS.commandTimeoutSeconds}
  if ($env:OPSBOX_CB_TIMEOUT) { $cbTimeout = [int]$env:OPSBOX_CB_TIMEOUT }
  $script = "$" + "ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [Text.Encoding]::UTF8" + [Environment]::NewLine + $Command
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = Join-Path $PSHOME 'powershell.exe'
  $psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
  $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
  if ($Environment) { foreach ($key in @($Environment.Keys)) { $psi.EnvironmentVariables[$key] = [string]$Environment[$key] } }
  $process = [System.Diagnostics.Process]::Start($psi)
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit($cbTimeout * 1000)) {
    try { $process.Kill() } catch { }
    return @{ rc = 124; output = ''; timeout = $cbTimeout }
  }
  $process.WaitForExit()
  $output = ($stdoutTask.Result + [Environment]::NewLine + $stderrTask.Result).Trim()
  return @{ rc = $process.ExitCode; output = (${P}-Truncate $output ${LIMITS.outputLength}); timeout = $cbTimeout }
}
# 정책 항목의 서버별 입력 값 (없으면 빈 문자열)
function ${P}-Input {
  param([string]$Item, [string]$Key)
  $setting = $opsboxConfig.checks.rolePolicySettings.$Item
  if ($null -eq $setting -or $null -eq $setting.inputs) { return '' }
  $value = $setting.inputs.$Key
  if ($null -eq $value) { return '' }
  return [string]$value
}
# 목록 입력: 줄바꿈 또는 ; 구분, 빈 줄 제외
function ${P}-Lines {
  param([string]$Text)
  return @(@($Text -split "[;\`r\`n]+") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}
function ${P}-Contains {
  param([string]$Text, [string]$Needle)
  return ([string]$Text).IndexOf($Needle, [StringComparison]::OrdinalIgnoreCase) -ge 0
}
function ${P}-Worst {
  param([object[]]$Statuses)
  if ($Statuses -contains 'Critical') { return 'Critical' }
  if ($Statuses -contains 'Warning') { return 'Warning' }
  if ($Statuses -contains 'Healthy') { return 'Healthy' }
  return 'NotCollected'
}
function ${P}-Number {
  param([string]$Text)
  $value = 0.0
  if ([double]::TryParse(([string]$Text).Trim(), [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$value)) { return $value }
  return $null
}
function ${P}-Judge {
  param([double]$Value, [string]$Direction, [double]$Warning, [double]$Critical)
  if ($Direction -eq 'LOWER_IS_WORSE') {
    if ($Value -le $Critical) { return 'Critical' } elseif ($Value -le $Warning) { return 'Warning' } else { return 'Healthy' }
  }
  if ($Value -ge $Critical) { return 'Critical' } elseif ($Value -ge $Warning) { return 'Warning' } else { return 'Healthy' }
}
function ${P}-Row {
  param([string]$Target, [string]$Value, [string]$Threshold, [string]$Status, [string]$Message)
  return @{ target = $Target; value = $Value; threshold = $Threshold; status = $Status; message = $Message }
}
# 명령 실행 결과가 시간 초과·실행 불가면 메시지, 아니면 $null
function ${P}-Failure {
  param([hashtable]$Result)
  if ($Result.rc -eq 124) { return "명령 실행 시간이 $($Result.timeout)초를 초과했습니다." }
  if ($Result.rc -eq 126 -or $Result.rc -eq 127) { return "명령을 실행할 수 없습니다: $(@(([string]$Result.output) -split "\`r?\`n")[0])" }
  return $null
}`.trim();

const fmt = (value: number | undefined) => String(value ?? '');
const list = (values: string[] | undefined) => `@(${(values ?? []).map(psLiteral).join(', ')})`;

function thresholdText(spec: BuilderSpec): string {
  const unit = spec.unit ?? '';
  switch (spec.type) {
    case 'COMMAND_NUMBER': {
      const op = spec.direction === 'LOWER_IS_WORSE' ? '≤' : '≥';
      return `주의 ${op} ${fmt(spec.warning)}${unit} / 위험 ${op} ${fmt(spec.critical)}${unit}`;
    }
    case 'COMMAND_TEXT':
      return [`비정상 문구: ${(spec.badPhrases ?? []).join(', ')}`, ...(spec.goodPhrases?.length ? [`정상 문구: ${spec.goodPhrases.join(', ')}`] : [])].join(' / ');
    case 'SETTING_VALUE':
      return `${spec.comparator} ${spec.expected}`;
    case 'REMOTE_PORT':
      return `접속 제한 ${spec.timeoutSeconds}초`;
    case 'FILE_FRESHNESS':
      return `${spec.maxAgeHours}시간 이내 수정`;
    case 'LOG_PATTERN':
      return `주의 ≥ ${fmt(spec.warning)}건 / 위험 ≥ ${fmt(spec.critical)}건 (최근 ${spec.periodDays}일)`;
  }
}

/** 준비된 점검의 서버별 입력은 OPSBOX_INPUT_<KEY> 환경 변수로 자식 명령에 전달 */
function environmentLines(spec: BuilderSpec): string[] {
  const inputs = builderInputs(spec).filter((input) => input.type !== 'TARGET_LIST' && input.type !== 'PATH_LIST');
  return [
    '    $cbEnvironment = @{}',
    ...inputs.map((input) => `    $cbEnvironment[${psLiteral(`OPSBOX_INPUT_${input.key.toUpperCase()}`)}] = ${P}-Input $cbItem ${psLiteral(input.key)}`),
  ];
}

/** 필수 목록 입력: 비어 있으면 미수집 + 안내 */
function requireList(key: string, label: string, body: string[]): string[] {
  return [
    `    $cbList = @(${P}-Lines (${P}-Input $cbItem ${psLiteral(key)}))`,
    '    if ($cbList.Count -eq 0) {',
    `      $cbMessage = ${psLiteral(`서버 상세에서 '${label}'을 입력하세요.`)}`,
    '    } else {',
    ...body.map((line) => `  ${line}`),
    '    }',
  ];
}

function body(spec: BuilderSpec & { command?: string }): string[] {
  const inputs = builderInputs(spec);
  const label = (key: string) => inputs.find((input) => input.key === key)?.label ?? key;
  switch (spec.type) {
    case 'COMMAND_NUMBER':
      return [
        ...environmentLines(spec),
        `    $cbRun = ${P}-Run ${psLiteral(spec.command ?? '')} $cbEnvironment`,
        '    $cbOutput = $cbRun.output',
        `    $cbMessage = ${P}-Failure $cbRun`,
        "    $cbValue = ''",
        '    if (-not $cbMessage) {',
        "      $cbMatch = [regex]::Match([string]$cbOutput, '-?[0-9]+(\\.[0-9]+)?')",
        "      if (-not $cbMatch.Success) { $cbMessage = '명령 출력에서 숫자를 찾지 못했습니다.' }",
        `      else { $cbValue = $cbMatch.Value; $cbStatus = ${P}-Judge (${P}-Number $cbValue) ${psLiteral(spec.direction ?? 'HIGHER_IS_WORSE')} (${P}-Number ${psLiteral(fmt(spec.warning))}) (${P}-Number ${psLiteral(fmt(spec.critical))}) }`,
        '    }',
        `    $cbRows += ${P}-Row '이 서버' $cbValue $cbThreshold $cbStatus $cbMessage`,
      ];
    case 'COMMAND_TEXT':
      return [
        ...environmentLines(spec),
        `    $cbRun = ${P}-Run ${psLiteral(spec.command ?? '')} $cbEnvironment`,
        '    $cbOutput = $cbRun.output',
        `    $cbMessage = ${P}-Failure $cbRun`,
        '    $cbFound = @()',
        '    if (-not $cbMessage) {',
        `      $cbGood = ${list(spec.goodPhrases)}`,
        `      foreach ($cbPhrase in ${list(spec.badPhrases)}) { if (${P}-Contains $cbOutput $cbPhrase) { $cbFound += $cbPhrase } }`,
        `      $cbGoodHit = @($cbGood | Where-Object { ${P}-Contains $cbOutput $_ }).Count -gt 0`,
        `      if ($cbFound.Count -gt 0) { $cbStatus = ${psLiteral(spec.level ?? 'Critical')}; $cbMessage = '비정상 문구 발견: ' + ($cbFound -join ', ') }`,
        "      elseif ($cbGood.Count -gt 0 -and -not $cbGoodHit) { $cbStatus = 'Warning'; $cbMessage = '정상 문구가 출력에 없습니다.' }",
        "      else { $cbStatus = 'Healthy' }",
        '    }',
        "    $cbFoundText = if ($cbFound.Count -gt 0) { $cbFound -join ', ' } else { '없음' }",
        `    $cbRows += ${P}-Row '이 서버' $cbFoundText $cbThreshold $cbStatus $cbMessage`,
      ];
    case 'SETTING_VALUE':
      return [
        `    $cbPath = ${psLiteral(spec.settingPath ?? '')}`,
        `    $cbName = ${psLiteral(spec.settingName ?? '')}`,
        `    $cbExpected = (${psLiteral(spec.expected ?? '')} -replace '\\s+', ' ').Trim()`,
        `    $cbCompare = ${psLiteral(spec.comparator ?? '=')}`,
        "    $cbActual = ''",
        '    try {',
        '      $cbProperty = Get-ItemProperty -LiteralPath $cbPath -Name $cbName -ErrorAction Stop',
        "      $cbActual = (@($cbProperty.$cbName) -join ' ' -replace '\\s+', ' ').Trim()",
        '      $cbOk = $null',
        "      if ($cbCompare -eq '=') { $cbOk = $cbActual -ceq $cbExpected }",
        "      elseif ($cbCompare -eq '!=') { $cbOk = $cbActual -cne $cbExpected }",
        '      else {',
        `        $cbA = ${P}-Number $cbActual; $cbE = ${P}-Number $cbExpected`,
        "        if ($null -ne $cbA -and $null -ne $cbE) { $cbOk = if ($cbCompare -eq '>=') { $cbA -ge $cbE } else { $cbA -le $cbE } }",
        '      }',
        "      if ($null -eq $cbOk) { $cbMessage = '숫자가 아니어서 크기를 비교할 수 없습니다.' }",
        "      elseif ($cbOk) { $cbStatus = 'Healthy' }",
        `      else { $cbStatus = ${psLiteral(spec.level ?? 'Critical')}; $cbMessage = '기대값과 다릅니다.' }`,
        '    } catch {',
        '      $cbMessage = "설정값을 읽을 수 없습니다: $($_.Exception.Message)"',
        '    }',
        `    $cbRows += ${P}-Row ($cbPath + '\\' + $cbName) $cbActual $cbThreshold $cbStatus $cbMessage`,
      ];
    case 'REMOTE_PORT':
      return requireList('targets', label('targets'), [
        '    foreach ($cbLine in $cbList) {',
        "      $cbIndex = $cbLine.LastIndexOf(':')",
        "      $cbHost = if ($cbIndex -gt 0) { $cbLine.Substring(0, $cbIndex).Trim('[', ']') } else { '' }",
        "      $cbPortText = if ($cbIndex -gt 0) { $cbLine.Substring($cbIndex + 1) } else { '' }",
        '      $cbPort = 0',
        "      if (-not $cbHost -or -not [int]::TryParse($cbPortText, [ref]$cbPort) -or $cbPort -lt 1 -or $cbPort -gt 65535) {",
        `        $cbRows += ${P}-Row $cbLine '' $cbThreshold 'NotCollected' '형식이 올바르지 않습니다. (호스트:포트)'`,
        '        continue',
        '      }',
        '      $cbClient = New-Object System.Net.Sockets.TcpClient',
        '      $cbConnected = $false',
        '      try {',
        '        $cbAsync = $cbClient.BeginConnect($cbHost, $cbPort, $null, $null)',
        `        if ($cbAsync.AsyncWaitHandle.WaitOne(${Number(spec.timeoutSeconds ?? 3) * 1000}, $false) -and $cbClient.Connected) { $cbClient.EndConnect($cbAsync); $cbConnected = $true }`,
        '      } catch { $cbConnected = $false } finally { $cbClient.Close() }',
        `      if ($cbConnected) { $cbRows += ${P}-Row $cbLine '성공' $cbThreshold 'Healthy' '접속 성공' }`,
        `      else { $cbRows += ${P}-Row $cbLine '실패' $cbThreshold ${psLiteral(spec.level ?? 'Critical')} ${psLiteral(`접속 실패 (${spec.timeoutSeconds ?? 3}초 안에 응답 없음)`)} }`,
        '    }',
        `    $cbStatus = ${P}-Worst @($cbRows | ForEach-Object { $_.status })`,
      ]);
    case 'FILE_FRESHNESS':
      return requireList('paths', label('paths'), [
        `    $cbMaxHours = ${P}-Number ${psLiteral(fmt(spec.maxAgeHours))}`,
        '    foreach ($cbLine in $cbList) {',
        '      if (Test-Path -LiteralPath $cbLine) {',
        '        $cbModified = (Get-Item -LiteralPath $cbLine -Force).LastWriteTime',
        '        $cbHours = [math]::Round(((Get-Date) - $cbModified).TotalHours, 1)',
        "        $cbRowStatus = if ($cbHours -gt $cbMaxHours) { 'Warning' } else { 'Healthy' }",
        `        $cbRows += ${P}-Row $cbLine ($cbModified.ToString('yyyy-MM-dd HH:mm:ss')) $cbThreshold $cbRowStatus ("$cbHours" + '시간 전 수정')`,
        `      } else { $cbRows += ${P}-Row $cbLine '' $cbThreshold ${psLiteral(spec.missingLevel ?? 'Critical')} '파일이 없습니다.' }`,
        '    }',
        `    $cbStatus = ${P}-Worst @($cbRows | ForEach-Object { $_.status })`,
      ]);
    case 'LOG_PATTERN':
      return requireList('paths', label('paths'), [
        `    $cbPhrases = ${list(spec.phrases)}`,
        `    $cbCutoff = (Get-Date).AddDays(-1 * (${P}-Number ${psLiteral(fmt(spec.periodDays))}))`,
        `    $cbWarning = ${P}-Number ${psLiteral(fmt(spec.warning))}; $cbCritical = ${P}-Number ${psLiteral(fmt(spec.critical))}`,
        '    $cbTotal = 0; $cbFoundPath = $false; $cbSamples = @()',
        '    foreach ($cbLine in $cbList) {',
        `      if (-not (Test-Path -LiteralPath $cbLine)) { $cbRows += ${P}-Row $cbLine '' $cbThreshold 'NotCollected' '경로가 없습니다.'; continue }`,
        '      $cbFoundPath = $true',
        '      $cbFiles = @(Get-ChildItem -LiteralPath $cbLine -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -ge $cbCutoff })',
        '      $cbCount = 0',
        '      foreach ($cbFile in $cbFiles) {',
        '        $cbMatches = @(Select-String -LiteralPath $cbFile.FullName -Pattern $cbPhrases -SimpleMatch -ErrorAction SilentlyContinue)',
        '        $cbCount += $cbMatches.Count',
        `        foreach ($cbHit in $cbMatches) { if ($cbSamples.Count -lt ${LIMITS.sampleLines}) { $cbSamples += @{ path = $cbFile.FullName; timestamp = ''; text = (${P}-Truncate $cbHit.Line 500) } } }`,
        '      }',
        '      $cbTotal += $cbCount',
        `      $cbRows += ${P}-Row $cbLine "$cbCount" $cbThreshold (${P}-Judge $cbCount 'HIGHER_IS_WORSE' $cbWarning $cbCritical) ("파일 " + $cbFiles.Count + "개 확인")`,
        '    }',
        `    if ($cbFoundPath) { $cbStatus = ${P}-Judge $cbTotal 'HIGHER_IS_WORSE' $cbWarning $cbCritical } else { $cbMessage = '확인할 수 있는 로그 경로가 없습니다.' }`,
        '    $cbDetailExtra.samples = @($cbSamples)',
      ]);
  }
}

export function generateWindowsPart({ itemId, itemName, role, spec }: GenerateArgs): string {
  assertItemId(itemId);
  const resolved = resolveSpec(spec);
  const fn = `${P}-Item-${itemId}`;
  return [
    `# 점검 만들기 · ${commentText(itemName)} (자동 생성, 생성기 v${GENERATOR_VERSION}) — 직접 고치면 폼 변경이 반영되지 않습니다`,
    HELPERS,
    `function ${fn} {`,
    `  $cbItem = ${psLiteral(itemId)}`,
    `  $cbRole = ${psLiteral(role)}`,
    `  $cbItemName = ${psLiteral(itemName)}`,
    `  $cbThreshold = ${psLiteral(thresholdText(resolved))}`,
    "  $cbStatus = 'NotCollected'; $cbMessage = $null; $cbRows = @(); $cbOutput = $null; $cbDetailExtra = @{}",
    '  Write-OpsBoxLog "점검 만들기 시작: $cbItemName"',
    '  try {',
    ...body(resolved),
    '  } catch {',
    "    $cbStatus = 'NotCollected'",
    '    $cbMessage = "점검 중 오류: $($_.Exception.Message)"',
    '  }',
    '  $cbDetail = @{ status = $cbStatus; message = $cbMessage; rows = @($cbRows) }',
    '  if ($null -ne $cbOutput) { $cbDetail.output = $cbOutput }',
    '  foreach ($cbKey in @($cbDetailExtra.Keys)) { $cbDetail[$cbKey] = $cbDetailExtra[$cbKey] }',
    '  $script:rolePolicyResults += @{ role = $cbRole; item = $cbItem; status = $cbStatus; detail = $cbDetail }',
    '  Write-OpsBoxLog "점검 만들기 완료: $cbItemName ($cbStatus)"',
    '}',
    fn,
  ].join('\n');
}
