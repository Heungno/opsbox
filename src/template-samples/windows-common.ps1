$ErrorActionPreference = 'SilentlyContinue'
$hostname = $env:COMPUTERNAME
$checkDate = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$os = Get-CimInstance Win32_OperatingSystem
$uptimeMinutes = [math]::Round((New-TimeSpan -Start $os.LastBootUpTime -End (Get-Date)).TotalMinutes, 0)
$cpu = [math]::Round((Get-Counter '\Processor(_Total)\% Processor Time').CounterSamples[0].CookedValue, 0)
$memory = if ($os.TotalVisibleMemorySize -gt 0) { [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 0) } else { 0 }
$disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
  $usage = if ($_.Size -gt 0) { [math]::Round((($_.Size - $_.FreeSpace) / $_.Size) * 100, 0) } else { 0 }
  $status = if ($usage -ge 90) { 'Critical' } elseif ($usage -ge 70) { 'Warning' } else { 'Healthy' }
  [ordered]@{ device = $_.DeviceID; mountPoint = $_.DeviceID; totalGB = [math]::Round($_.Size / 1GB, 2); usedGB = [math]::Round(($_.Size - $_.FreeSpace) / 1GB, 2); freeGB = [math]::Round($_.FreeSpace / 1GB, 2); usagePercent = $usage; status = $status }
})
$disk = 0
foreach ($diskInfo in $disks) {
  $usage = [double]$diskInfo['usagePercent']
  if ($usage -gt $disk) { $disk = $usage }
}
$roles = @('{{ROLES}}'.Split(','))
$products = ConvertFrom-Json '{{PRODUCTS_JSON}}'
$product = ''
if ($products.PSObject.Properties[$roles[0]]) { $product = $products.PSObject.Properties[$roles[0]].Value }
$result = @{
  server = '{{SERVER_ID}}'; serverType = $roles[0]; serverTypes = $roles
  hostname = $hostname; checkDate = $checkDate; uptimeMinutes = $uptimeMinutes
  cpu = $cpu; memory = $memory; disk = $disk; disks = $disks
  network = 'NotChecked'; processes = @(); directories = @(); fileChecks = @(); ports = @(); httpChecks = @()
  wasChecks = @(); webtobCheck = $null; databaseChecks = $null; products = $products; product = $product
}
$result | ConvertTo-Json -Depth 8
