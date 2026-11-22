/* 서버 상세 › 점검 스크립트: 실행 명령과 설명 문구 */

/** 서버에서 실행할 명령 (서버 ID는 셸·PowerShell 따옴표로 감쌈) */
export function scriptCommand(server) {
  const scriptFileName = server.os.toLowerCase() === 'windows' ? `${server.id}.ps1` : `${server.id}.sh`;
  // 서버 ID를 셸 인자로 쓰므로 작은따옴표로 감쌉니다 (예전에 등록된 ID에 특수문자가 있어도 명령으로 실행되지 않게)
  const quoteShell = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;
  const linuxScriptPath = quoteShell(`./${scriptFileName}`);
  
  const quotePowerShell = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const scriptFilter = quotePowerShell(`${server.id}*.ps1`);
  const command = server.os.toLowerCase() === 'windows'
    ? `$resultDirectory = ''; $script = Get-ChildItem -File -Filter ${scriptFilter} | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName; if (-not $script) { throw '점검 스크립트를 찾을 수 없습니다. 스크립트 폴더에서 실행하세요.' }; $scriptArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $script); if (-not [string]::IsNullOrWhiteSpace($resultDirectory)) { $scriptArgs += @('-ResultDirectory', $resultDirectory) }; powershell.exe @scriptArgs`
    : `# 결과를 기본 정보의 결과 저장 경로(없으면 스크립트 폴더)에 저장\nbash ${linuxScriptPath}\n\n# 결과 폴더를 직접 지정 (예: /mnt/opsbox/results)\nbash ${linuxScriptPath} /mnt/opsbox/results`;
  return command;
}

/** OS별 실행 안내 */
export function scriptDescription(server) {
  return server.os === 'Windows'
    ? '정책에 연결된 점검 스크립트를 조립합니다. 실행 명령의 $resultDirectory에 경로를 입력하면 그곳에 저장하고, 비워 두면 기본 정보의 결과 저장 경로를 사용합니다. 수신함이 아닌 곳에 저장됐으면 파일을 수신함에 넣거나 [결과 파일 올리기]로 올리세요.'
    : '스크립트 파일이 있는 폴더에서 bash로 실행하세요. 결과 폴더를 인자로 주면 그곳에, 없으면 기본 정보의 결과 저장 경로에, 그것도 없거나 쓸 수 없으면 스크립트 폴더에 결과 JSON을 저장합니다. 수신함이 아닌 곳에 저장됐으면 파일을 수신함에 넣거나 [결과 파일 올리기]로 올리세요.';
}
