Import-Module WebAdministration

$iis =
Get-Service W3SVC

$result = @{
  server      =
    $env:COMPUTERNAME

  serviceName =
    "IIS"

  status      =
    $iis.Status

  checkDate   =
    (
      Get-Date
    ).ToString(
      "yyyy-MM-dd HH:mm:ss"
    )
}

$result |
ConvertTo-Json |
Out-File `
  ".\iis_result.json" `
  -Encoding UTF8

Write-Host
"iis_result.json 생성 완료"