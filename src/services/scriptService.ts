import { getServer, getServerProduct, getServerRoles } from './serverService';
import { Server } from '../types/server';

export function generateScript(serverId: string): string {
  const server = getServer(serverId);

  if (!server) {
    throw new Error(`Server not found: ${serverId}`);
  }

  if (server.os === 'Windows') {
    return generateWindowsScript(server);
  }

  return generateLinuxScript(server);
}

function generateLinuxScript(server: Server): string {
  const roles = getServerRoles(server);
  const products = Object.fromEntries(roles.map((role) => [role, getServerProduct(server, role)]).filter(([, product]) => product));
  return `
#!/bin/bash
set +e

hostname=$(hostname)
checkDate=$(date '+%Y-%m-%d %H:%M:%S')
uptimeMinutes=$(awk '{printf "%d", $1/60}' /proc/uptime)
cpu_before=$(awk '/^cpu / {idle=$5+$6; total=0; for(i=2;i<=NF;i++) total+=$i; print total, idle}' /proc/stat)
sleep 1
cpu_after=$(awk '/^cpu / {idle=$5+$6; total=0; for(i=2;i<=NF;i++) total+=$i; print total, idle}' /proc/stat)
cpu=$(awk -v before="$cpu_before" -v after="$cpu_after" 'BEGIN{split(before,b); split(after,a); total=a[1]-b[1]; idle=a[2]-b[2]; if(total>0) printf "%d", ((total-idle)/total)*100; else print 0}')
memory=$(awk '/MemTotal:/ {total=$2} /MemAvailable:/ {available=$2} END{if(total>0) printf "%d", ((total-available)/total)*100; else print 0}' /proc/meminfo)
json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\\\"/g'; }
port_is_listening() {
  local hex_port protocol file
  printf -v hex_port '%04X' "$1"
  protocol=$2
  if [ "$protocol" = "TCP" ]; then files="/proc/net/tcp /proc/net/tcp6"; else files="/proc/net/udp /proc/net/udp6"; fi
  for file in $files; do
    [ -r "$file" ] || continue
    if awk -v p="$hex_port" -v proto="$protocol" 'NR > 1 { split($2, a, ":"); if (toupper(a[length(a)]) == p && (proto == "UDP" || $4 == "0A")) found=1 } END { exit !found }' "$file"; then return 0; fi
  done
  return 1
}
disks='['
disk=0
disk_index=0
while read -r filesystem blocks used available percent mountPoint; do
  [ "$filesystem" = "Filesystem" ] && continue
  usage=\${percent%%%}
  case "$usage" in ''|*[!0-9]*) continue ;; esac
  [ "$disk_index" -gt 0 ] && disks+=','
  deviceJson=$(json_escape "$filesystem")
  mountJson=$(json_escape "$mountPoint")
  if [ "$usage" -ge 90 ]; then status=Critical; elif [ "$usage" -ge 70 ]; then status=Warning; else status=Healthy; fi
  disks+="{\"device\":\"$deviceJson\",\"mountPoint\":\"$mountJson\",\"totalGB\":$(awk -v n=$blocks 'BEGIN{printf \"%.2f\",n/1048576}'),\"usedGB\":$(awk -v n=$used 'BEGIN{printf \"%.2f\",n/1048576}'),\"freeGB\":$(awk -v n=$available 'BEGIN{printf \"%.2f\",n/1048576}'),\"usagePercent\":$usage,\"status\":\"$status\"}"
  [ "$usage" -gt "$disk" ] && disk=$usage
  disk_index=$((disk_index + 1))
done < <(df -P -l -x tmpfs -x devtmpfs 2>/dev/null)
disks+=']'
processes='['
directories='['
fileChecks='['
portChecks='['
databaseChecks='null'

${(server.processes ?? []).map((process, index) => {
    const name = process.name.replace(/'/g, "'\\''");
    const comma = index ? ',' : '';
    return `processes+="${comma}{\\\"name\\\":\\\"${name}\\\",\\\"running\\\":$(pgrep -x -- '${name.replace(/'/g, "'\\''")} >/dev/null 2>&1 && printf true || printf false)},"`;
  }).join('\n')}

${(server.directories ?? []).map((directory, index) => {
    const path = directory.path.replace(/'/g, "'\\''");
    const comma = index ? ',' : '';
    return `if [ -d '${path}' ]; then size=$(du -sb -- '${path}' 2>/dev/null | awk '{print $1+0}'); usage=$(df -P -- '${path}' 2>/dev/null | awk 'NR==2 {gsub(\"%\", \"\", $5); print $5+0}'); exists=true; else size=0; usage=0; exists=false; fi; total=$(df -P -- '${path}' 2>/dev/null | awk 'NR==2 {print $2+0}'); used=$(df -P -- '${path}' 2>/dev/null | awk 'NR==2 {print $3+0}'); free=$(df -P -- '${path}' 2>/dev/null | awk 'NR==2 {print $4+0}'); p=$(json_escape '${path}'); directories+="${comma}{\\\"path\\\":\\\"$p\\\",\\\"exists\\\":$exists,\\\"sizeGB\\\":$(awk -v n=$size 'BEGIN{printf \"%.2f\",n/1073741824}'),\\\"usedGB\\\":$(awk -v n=$used 'BEGIN{printf \"%.2f\",n/1048576}'),\\\"freeGB\\\":$(awk -v n=$free 'BEGIN{printf \"%.2f\",n/1048576}'),\\\"totalGB\\\":$(awk -v n=$total 'BEGIN{printf \"%.2f\",n/1048576}'),\\\"usagePercent\\\":$usage},"`;
  }).join('\n')}

${(server.fileChecks ?? []).map((file, index) => {
    const path = file.path.replace(/'/g, "'\\''");
    const comma = index ? ',' : '';
    return `if [ -f '${path}' ]; then bytes=$(stat -c %s -- '${path}' 2>/dev/null || echo 0); size=$(awk -v n=$bytes 'BEGIN{printf \"%.2f\",n/1048576}'); if awk -v n=$bytes -v c=${file.criticalSizeMB} 'BEGIN{exit !(n>=c*1048576)}'; then status=Critical; elif awk -v n=$bytes -v w=${file.warningSizeMB} 'BEGIN{exit !(n>=w*1048576)}'; then status=Warning; else status=Healthy; fi; exists=true; else bytes=0; size=0; status=Critical; exists=false; fi; p=$(json_escape '${path}'); fileChecks+="${comma}{\\\"path\\\":\\\"$p\\\",\\\"exists\\\":$exists,\\\"sizeBytes\\\":$bytes,\\\"sizeMB\\\":$size,\\\"status\\\":\\\"$status\\\"},"`;
  }).join('\n')}

${(server.ports ?? []).map((port, index) => {
    const description = (port.description ?? '').replace(/'/g, "'\\''");
    const comma = index ? ',' : '';
    const protocol = (port.protocol ?? 'TCP').toUpperCase();
    return `if port_is_listening ${port.port} '${protocol}'; then listening=true; else listening=false; fi; description=$(json_escape '${description}'); portChecks+="${comma}{\\\"port\\\":${port.port},\\\"protocol\\\":\\\"${protocol}\\\",\\\"description\\\":\\\"$description\\\",\\\"listening\\\":$listening},"`;
  }).join('\n')}

if [ "${roles.includes('DB')}" = "true" ]; then databaseChecks='{"product":"${getServerProduct(server, 'DB') ?? ''}","status":"NotCollected","message":"Linux DB client collector is not included in this Windows-first phase."}'; fi
processes="${'${processes%,}'}]"
directories="${'${directories%,}'}]"
fileChecks="${'${fileChecks%,}'}]"
portChecks="${'${portChecks%,}'}]"
printf '{"server":"${server.id}","serverType":"${server.type}","serverTypes":${JSON.stringify(roles)},"products":${JSON.stringify(products)},"product":"${server.product ?? ''}","hostname":"%s","checkDate":"%s","uptimeMinutes":%s,"cpu":%s,"memory":%s,"disk":%s,"network":"NotChecked","disks":%s,"processes":%s,"directories":%s,"fileChecks":%s,"ports":%s,"databaseChecks":%s}\n' "$hostname" "$checkDate" "$uptimeMinutes" "$cpu" "$memory" "$disk" "$disks" "$processes" "$directories" "$fileChecks" "$portChecks" "$databaseChecks"

`;
}

function generateWindowsScript(server: Server): string {
  const roles = getServerRoles(server);
  const webProduct = getServerProduct(server, 'WEB');
  const wasProduct = getServerProduct(server, 'WAS');
  const dbProduct = getServerProduct(server, 'DB');
  const products = Object.fromEntries(roles.map((role) => [role, getServerProduct(server, role)]).filter(([, product]) => product));
  const lines: string[] = [];
  lines.push('$ErrorActionPreference = "SilentlyContinue"');
  lines.push('');
  lines.push('$hostname = $env:COMPUTERNAME');
  lines.push('$checkDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"');
  lines.push('');
  lines.push('$os = Get-CimInstance Win32_OperatingSystem');
  lines.push('');
  lines.push(
    '$uptimeMinutes = [math]::Round((New-TimeSpan -Start $os.LastBootUpTime -End (Get-Date)).TotalMinutes, 0)',
  );
  lines.push('');
  lines.push('$cpu = (Get-Counter "\\Processor(_Total)\\% Processor Time").CounterSamples[0].CookedValue');
  lines.push('');
  lines.push(
    '$memory = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 0)',
  );
  lines.push('');
  lines.push('$disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {');
  lines.push('  $usagePercent = if ($_.Size -gt 0) { [math]::Round((($_.Size - $_.FreeSpace) / $_.Size) * 100, 0) } else { 0 }');
  lines.push('  $status = if ($usagePercent -ge 90) { "Critical" } elseif ($usagePercent -ge 70) { "Warning" } else { "Healthy" }');
  lines.push('  [ordered]@{ device = $_.DeviceID; mountPoint = $_.DeviceID; volumeName = $_.VolumeName; totalGB = [math]::Round($_.Size / 1GB, 2); usedGB = [math]::Round(($_.Size - $_.FreeSpace) / 1GB, 2); freeGB = [math]::Round($_.FreeSpace / 1GB, 2); usagePercent = $usagePercent; status = $status }');
  lines.push('})');
  lines.push('$disk = 0');
  lines.push('foreach ($diskInfo in $disks) { $usage = [double]$diskInfo["usagePercent"]; if ($usage -gt $disk) { $disk = $usage } }');
  lines.push('');
  lines.push('$processes = @()');
  lines.push('$directories = @()');
  lines.push('$fileChecks = @()');
  lines.push('$portChecks = @()');
  lines.push('$httpChecks = @()');
  lines.push('$wasChecks = @()');
  lines.push('$webtobCheck = $null');
  lines.push('$databaseChecks = $null');
  lines.push('');

  for (const process of server.processes ?? []) {
    lines.push(
      '$proc = Get-Process -Name "' + process.name + '" -ErrorAction SilentlyContinue | Select-Object -First 1',
    );
    lines.push('if ($proc)');
    lines.push('{');
    lines.push('  $procUptime = [math]::Round((New-TimeSpan -Start $proc.StartTime -End (Get-Date)).TotalMinutes, 0)');
    lines.push('  $processes += @{');
    lines.push('    name = "' + process.name + '"');
    lines.push('    running = $true');
    lines.push('    cpu = $proc.CPU');
    lines.push('    memoryMB = [math]::Round($proc.WorkingSet64 / 1MB, 2)');
    lines.push('    uptimeMinutes = $procUptime');
    lines.push('  }');
    lines.push('}');
    lines.push('else');
    lines.push('{');
    lines.push('  $processes += @{');
    lines.push('    name = "' + process.name + '"');
    lines.push('    running = $false');
    lines.push('    cpu = 0');
    lines.push('    memoryMB = 0');
    lines.push('    uptimeMinutes = 0');
    lines.push('  }');
    lines.push('}');
    lines.push('');
  }

  for (const directory of server.directories ?? []) {
    lines.push('if (Test-Path "' + directory.path + '")');
    lines.push('{');
    lines.push(
      '  $size = (Get-ChildItem "' +
        directory.path +
        '" -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum',
    );
    lines.push('  $driveLetter = (Split-Path "' + directory.path + '" -Qualifier).Replace(":","")');
    lines.push('  $drive = Get-PSDrive -Name $driveLetter');
    lines.push('  $usedGB = [math]::Round($drive.Used / 1GB, 2)');
    lines.push('  $freeGB = [math]::Round($drive.Free / 1GB, 2)');
    lines.push('  $totalGB = [math]::Round(($drive.Used + $drive.Free) / 1GB, 2)');
    lines.push('  $usagePercent = [math]::Round(($drive.Used / ($drive.Used + $drive.Free)) * 100, 0)');
    lines.push('  $directories += @{');
    lines.push('    path = "' + directory.path + '"');
    lines.push('    exists = $true');
    lines.push('    sizeGB = [math]::Round($size / 1GB, 2)');
    lines.push('    usedGB = $usedGB');
    lines.push('    freeGB = $freeGB');
    lines.push('    totalGB = $totalGB');
    lines.push('    usagePercent = $usagePercent');
    lines.push('  }');
    lines.push('}');
    lines.push('else');
    lines.push('{');
    lines.push('  $directories += @{');
    lines.push('    path = "' + directory.path + '"');
    lines.push('    exists = $false');
    lines.push('    sizeGB = 0');
    lines.push('    usedGB = 0');
    lines.push('    freeGB = 0');
    lines.push('    totalGB = 0');
    lines.push('    usagePercent = 0');
    lines.push('  }');
    lines.push('}');
    lines.push('');
  }

  for (const file of server.fileChecks ?? []) {
    const safePath = file.path.replace(/`/g, '``').replace(/"/g, '`"');
    lines.push(`$filePath = "${safePath}"`);
    lines.push('if (Test-Path -LiteralPath $filePath -PathType Leaf)');
    lines.push('{');
    lines.push('  $sizeBytes = (Get-Item -LiteralPath $filePath).Length');
    lines.push('  $sizeMB = [math]::Round($sizeBytes / 1MB, 2)');
    lines.push(`  $status = if ($sizeBytes -ge (${file.criticalSizeMB} * 1MB)) { "Critical" } elseif ($sizeBytes -ge (${file.warningSizeMB} * 1MB)) { "Warning" } else { "Healthy" }`);
    lines.push('  $fileChecks += @{ path = $filePath; exists = $true; sizeBytes = $sizeBytes; sizeMB = $sizeMB; status = $status }');
    lines.push('}');
    lines.push('else');
    lines.push('{');
    lines.push('  $fileChecks += @{ path = $filePath; exists = $false; sizeBytes = 0; sizeMB = 0; status = "Critical" }');
    lines.push('}');
  }

  for (const port of server.ports ?? []) {
    const protocol = (port.protocol ?? 'TCP').toUpperCase();
    const description = (port.description ?? '').replace(/`/g, '``').replace(/"/g, '`"');
    lines.push(`$portNumber = ${port.port}`);
    lines.push(`$protocol = "${protocol}"`);
    lines.push('$endpoint = $null');
    lines.push('$processName = $null');
    lines.push('if ($protocol -eq "TCP")');
    lines.push('{');
    lines.push('  $endpoint = Get-NetTCPConnection -LocalPort $portNumber -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1');
    lines.push('}');
    lines.push('else');
    lines.push('{');
    lines.push('  $endpoint = Get-NetUDPEndpoint -LocalPort $portNumber -ErrorAction SilentlyContinue | Select-Object -First 1');
    lines.push('}');
    lines.push('if ($endpoint -and $endpoint.OwningProcess) { $processName = (Get-Process -Id $endpoint.OwningProcess -ErrorAction SilentlyContinue).ProcessName }');
    lines.push(`$portChecks += @{ port = $portNumber; protocol = $protocol; description = "${description}"; listening = ($null -ne $endpoint); processName = $processName }`);
  }

  if (server.os === 'Windows') for (const check of server.httpChecks ?? []) {
    const safeName = check.name.replace(/`/g, '``').replace(/"/g, '`"');
    const safeUrl = check.url.replace(/`/g, '``').replace(/"/g, '`"');
    const expected = check.expectedStatus ?? 200;
    lines.push(`$httpUrl = "${safeUrl}"`);
    lines.push(`$expectedStatus = ${expected}`);
    lines.push('$timer = [System.Diagnostics.Stopwatch]::StartNew()');
    lines.push('$statusCode = $null; $success = $false; $errorKind = $null');
    lines.push('try { $response = Invoke-WebRequest -Uri $httpUrl -Method Get -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop; $statusCode = [int]$response.StatusCode; $success = ($statusCode -eq $expectedStatus) }');
    lines.push('catch { if ($_.Exception.Response) { try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {} }; $errorKind = "RequestFailed" }');
    lines.push('$timer.Stop()');
    lines.push(`$httpChecks += @{ name = "${safeName}"; url = $httpUrl; expectedStatus = $expectedStatus; statusCode = $statusCode; responseTimeMs = $timer.ElapsedMilliseconds; success = $success; error = $errorKind }`);
  }

  if (roles.includes('WAS') && wasProduct !== 'Node.js') {
    lines.push('$javaProcesses = @(Get-CimInstance Win32_Process -Filter "Name = \'java.exe\'" -ErrorAction SilentlyContinue)');
    lines.push('$pathJstat = Get-Command jstat.exe -ErrorAction SilentlyContinue');
    lines.push('foreach ($javaProcess in $javaProcesses) {');
    lines.push('  $jstatPath = $null');
    lines.push('  if ($javaProcess.ExecutablePath) { $candidate = Join-Path (Split-Path $javaProcess.ExecutablePath -Parent) "jstat.exe"; if (Test-Path -LiteralPath $candidate) { $jstatPath = $candidate } }');
    lines.push('  if (-not $jstatPath -and $pathJstat) { $jstatPath = $pathJstat.Source }');
    lines.push('  if (-not $jstatPath) { $wasChecks += @{ processId = $javaProcess.ProcessId; processName = "java"; status = "NotCollected"; message = "jstat.exe not found" }; continue }');
    lines.push('  $jstatOutput = @(& $jstatPath -gc $javaProcess.ProcessId 2>$null)');
    lines.push('  if ($jstatOutput.Count -lt 2) { $wasChecks += @{ processId = $javaProcess.ProcessId; processName = "java"; status = "NotCollected"; message = "JVM attach failed or jstat output unavailable" }; continue }');
    lines.push('  $headers = @($jstatOutput[0].Trim() -split "\\s+")');
    lines.push('  $values = @($jstatOutput[-1].Trim() -split "\\s+")');
    lines.push('  $heapCapacityKB = 0.0; $heapUsedKB = 0.0');
    lines.push('  for ($i = 0; $i -lt $headers.Count -and $i -lt $values.Count; $i++) { $number = 0.0; if ([double]::TryParse($values[$i], [ref]$number)) { if ($headers[$i] -in @("S0C", "S1C", "EC", "OC", "PC")) { $heapCapacityKB += $number }; if ($headers[$i] -in @("S0U", "S1U", "EU", "OU", "PU")) { $heapUsedKB += $number } } }');
    lines.push('  if ($heapCapacityKB -le 0) { $wasChecks += @{ processId = $javaProcess.ProcessId; processName = "java"; status = "NotCollected"; message = "JVM heap columns unavailable" }; continue }');
    lines.push('  $heapPercent = [math]::Round(($heapUsedKB / $heapCapacityKB) * 100, 1)');
    lines.push('  $heapStatus = if ($heapPercent -ge 90) { "Critical" } elseif ($heapPercent -ge 70) { "Warning" } else { "Healthy" }');
    lines.push('  $wasChecks += @{ processId = $javaProcess.ProcessId; processName = "java"; heapUsedMB = [math]::Round($heapUsedKB / 1024, 1); heapCapacityMB = [math]::Round($heapCapacityKB / 1024, 1); heapUsagePercent = $heapPercent; status = $heapStatus; message = $null }');
    lines.push('}');
    lines.push('if ($javaProcesses.Count -eq 0) { $wasChecks += @{ processId = 0; processName = "java"; status = "NotCollected"; message = "Java process not found" } }');
  } else if (roles.includes('WAS')) {
    lines.push('$wasChecks += @{ processId = 0; processName = "node"; status = "NotCollected"; message = "Node.js runtime metrics require an application-specific collector" }');
  }

  if (roles.includes('WEB') && webProduct === 'WebtoB') {
    lines.push('$wsadmin = Get-Command wsadmin.exe -ErrorAction SilentlyContinue');
    lines.push('if (-not $wsadmin) { $wsadmin = Get-Command wsadmin -ErrorAction SilentlyContinue }');
    lines.push('if (-not $wsadmin) { $webtobCheck = @{ status = "NotCollected"; command = "wsadmin: wi, ci -s, st -v, st -s"; message = "wsadmin was not found on PATH." } }');
    lines.push('else {');
    lines.push('  try {');
    lines.push('    $psi = New-Object System.Diagnostics.ProcessStartInfo');
    lines.push('    $psi.FileName = $wsadmin.Source; $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true; $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true');
    lines.push('    $proc = New-Object System.Diagnostics.Process; $proc.StartInfo = $psi; [void]$proc.Start()');
    lines.push('    $stdoutTask = $proc.StandardOutput.ReadToEndAsync(); $stderrTask = $proc.StandardError.ReadToEndAsync()');
    lines.push('    @("wi", "ci -s", "st -v", "st -s", "quit") | ForEach-Object { $proc.StandardInput.WriteLine($_) }; $proc.StandardInput.Close()');
    lines.push('    if (-not $proc.WaitForExit(20000)) { $proc.Kill(); $webtobCheck = @{ status = "NotCollected"; command = "wsadmin: wi, ci -s, st -v, st -s"; message = "wsadmin timed out after 20 seconds." } }');
    lines.push('    else { $output = ($stdoutTask.Result + "`n" + $stderrTask.Result).Trim(); $hasRunningServer = $output -match "(?i)\\bRDY\\b"; $hasBadServer = $output -match "(?i)\\b(NRDY|BLK|DOWN|STOPPED)\\b"; $state = if ($hasBadServer) { "Critical" } elseif ($hasRunningServer) { "Healthy" } else { "NotCollected" }; $webtobCheck = @{ status = $state; command = "wsadmin: wi, ci -s, st -v, st -s"; output = $output.Substring(0, [math]::Min(12000, $output.Length)); message = if ($state -eq "NotCollected") { "No recognizable WebtoB server status was returned." } else { $null } } }');
    lines.push('  } catch { $webtobCheck = @{ status = "NotCollected"; command = "wsadmin: wi, ci -s, st -v, st -s"; message = $_.Exception.Message } }');
    lines.push('}');
  }

  if (roles.includes('DB')) {
    const safeIp = server.ip.replace(/'/g, "''");
    const sqlPort = server.ports?.find((port) => (port.protocol ?? 'TCP').toUpperCase() === 'TCP' && port.port === 1433)?.port ?? 1433;
    lines.push(`$databaseChecks = @{ product = "${dbProduct ?? ''}"; status = "NotCollected"; message = "DB collector has not run." }`);
    if (dbProduct === 'MSSQL') {
      lines.push('$sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue');
      lines.push('if (-not $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }');
      lines.push('if (-not $sqlcmd) { $databaseChecks.message = "sqlcmd was not found on PATH." }');
      lines.push('else {');
      lines.push(`  $sqlTarget = if ($env:OPSBOX_MSSQL_TARGET) { $env:OPSBOX_MSSQL_TARGET } else { "${safeIp},${sqlPort}" }`);
      lines.push(`  $dbQuery = "SET NOCOUNT ON; SELECT 'SERVER|' + ISNULL(CONVERT(nvarchar(256), SERVERPROPERTY('ServerName')), N'') + '|' + ISNULL(CONVERT(nvarchar(64), SERVERPROPERTY('ProductVersion')), N'') + '|' + ISNULL(CONVERT(nvarchar(256), SERVERPROPERTY('Edition')), N''); SELECT 'DATABASE|' + d.name + '|' + d.state_desc + '|' + d.recovery_model_desc + '|' + CONVERT(nvarchar(32), CAST(ISNULL(SUM(CASE WHEN mf.type = 0 THEN CAST(mf.size AS bigint) ELSE 0 END), 0) * 8.0 / 1024 AS decimal(18,2))) FROM sys.databases d LEFT JOIN sys.master_files mf ON mf.database_id = d.database_id GROUP BY d.database_id, d.name, d.state_desc, d.recovery_model_desc"`);
      lines.push('  $dbOutput = @(& $sqlcmd.Source -S $sqlTarget -d master -E -l 5 -t 10 -Q $dbQuery -h -1 -W -s "|" -w 65535 -b 2>&1); $sqlExitCode = $LASTEXITCODE');
      lines.push('  $databaseRows = @(); $sqlServerInfo = $null');
      lines.push('  foreach ($outputLine in $dbOutput) { $text = "$outputLine".Trim(); if ($text.StartsWith("SERVER|")) { $parts = $text -split "\\|", 4; if ($parts.Count -ge 4) { $sqlServerInfo = @{ serverName = $parts[1]; version = $parts[2]; edition = $parts[3] } } } elseif ($text.StartsWith("DATABASE|")) { $parts = $text -split "\\|", 5; if ($parts.Count -ge 5) { $sizeMB = 0.0; [void][double]::TryParse($parts[4], [ref]$sizeMB); $dbState = $parts[2].ToUpperInvariant(); $dbStatus = if ($dbState -in @("OFFLINE", "SUSPECT", "RECOVERY_PENDING", "EMERGENCY")) { "Critical" } elseif ($dbState -ne "ONLINE") { "Warning" } else { "Healthy" }; $databaseRows += @{ name = $parts[1]; state = $parts[2]; recoveryModel = $parts[3]; sizeMB = $sizeMB; status = $dbStatus } } } }');
      lines.push('  $offlineCount = @($databaseRows | Where-Object { $_.status -eq "Critical" }).Count; $warningCount = @($databaseRows | Where-Object { $_.status -eq "Warning" }).Count');
      lines.push('  if ($sqlExitCode -eq 0 -and $sqlServerInfo) { $dbStatus = if ($offlineCount -gt 0) { "Critical" } elseif ($warningCount -gt 0 -or $databaseRows.Count -eq 0) { "Warning" } else { "Healthy" }; $dbMessage = if ($databaseRows.Count -eq 0) { "Connected, but no database metadata was returned. Check SQL metadata visibility." } else { $null }; $databaseChecks = @{ product = "MSSQL"; status = $dbStatus; serverName = $sqlServerInfo.serverName; version = $sqlServerInfo.version; edition = $sqlServerInfo.edition; databaseCount = $databaseRows.Count; offlineCount = $offlineCount; databases = $databaseRows; message = $dbMessage } } else { $dbMessage = ($dbOutput | ForEach-Object { "$($_)" }) -join " "; $databaseChecks = @{ product = "MSSQL"; status = "Critical"; serverName = $sqlTarget; message = $dbMessage.Substring(0, [math]::Min(1000, $dbMessage.Length)) } }');
      lines.push('}');
    } else {
      lines.push(`$databaseChecks.message = "${dbProduct ?? 'DB'} Windows SQL client collection is not configured in this phase."`);
    }
  }

  lines.push('$result = @{');
  lines.push('  server = "' + server.id.replace(/`/g, '``').replace(/"/g, '`"') + '"');
  lines.push('  serverType = "' + server.type + '"');
  lines.push('  serverTypes = @(' + roles.map((role) => '"' + role + '"').join(', ') + ')');
  lines.push('  hostname = $hostname');
  lines.push('  checkDate = $checkDate');
  lines.push('  uptimeMinutes = $uptimeMinutes');
  lines.push('  cpu = [math]::Round($cpu, 0)');
  lines.push('  memory = $memory');
  lines.push('  disk = $disk');
  lines.push('  disks = $disks');
  lines.push('  processes = $processes');
  lines.push('  directories = $directories');
  lines.push('  fileChecks = $fileChecks');
  lines.push('  ports = $portChecks');
  lines.push('  httpChecks = $httpChecks');
  lines.push('  wasChecks = $wasChecks');
  lines.push('  webtobCheck = $webtobCheck');
  lines.push('  databaseChecks = $databaseChecks');
  lines.push('  products = @{ ' + Object.entries(products).map(([role, product]) => `${role} = "${product}"`).join('; ') + ' }');
  lines.push('  product = "' + (server.product ?? '').replace(/`/g, '``').replace(/"/g, '`"') + '"');
  lines.push('}');
  lines.push('');
  lines.push('$result | ConvertTo-Json -Depth 10');

  return lines.join('\n');
}
