import { getServer } from './serverService';
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
  return `
#!/bin/bash

echo "Linux Generator TODO"

`;
}

function generateWindowsScript(server: Server): string {
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
  lines.push('$diskInfo = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID=\'C:\'"');
  lines.push('$disk = [math]::Round((($diskInfo.Size - $diskInfo.FreeSpace) / $diskInfo.Size) * 100, 0)');
  lines.push('');
  lines.push('$processes = @()');
  lines.push('$directories = @()');
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

  lines.push('$result = @{');
  lines.push('  hostname = $hostname');
  lines.push('  checkDate = $checkDate');
  lines.push('  uptimeMinutes = $uptimeMinutes');
  lines.push('  cpu = [math]::Round($cpu, 0)');
  lines.push('  memory = $memory');
  lines.push('  disk = $disk');
  lines.push('  processes = $processes');
  lines.push('  directories = $directories');
  lines.push('}');
  lines.push('');
  lines.push('$result | ConvertTo-Json -Depth 10');

  return lines.join('\n');
}
