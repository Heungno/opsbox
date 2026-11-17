param(
    [Parameter(Mandatory = $true)]
    [string]$ServerId,

    [Parameter(Mandatory = $true)]
    [string]$ResultPath,

    [Parameter(Mandatory = $false)]
    [string]$ServerType = "WEB"
)

Write-Host ""
Write-Host "===================================="
Write-Host "OpsBox Server Check"
Write-Host "===================================="
Write-Host ""
Write-Host "Server ID  : $ServerId"
Write-Host "ResultPath : $ResultPath"
Write-Host ""

try {

    # CPU 사용률
    $CpuInfo =
        Get-CimInstance Win32_Processor

    $CpuUsage =
        (
            $CpuInfo |
            Measure-Object `
                -Property LoadPercentage `
                -Average
        ).Average

    $CpuUsage =
        [Math]::Round(
            $CpuUsage,
            0
        )

    # MEMORY 사용률
    $OsInfo =
        Get-CimInstance `
        Win32_OperatingSystem

    $MemoryUsage =
        (
            (
                $OsInfo.TotalVisibleMemorySize -
                $OsInfo.FreePhysicalMemory
            ) /
            $OsInfo.TotalVisibleMemorySize
        ) * 100

    $MemoryUsage =
        [Math]::Round(
            $MemoryUsage,
            0
        )

    # DISK 사용률(C:)
    $DiskInfo =
        Get-CimInstance `
        Win32_LogicalDisk |
        Where-Object {
            $_.DeviceID -eq "C:"
        }

    $DiskUsage =
        (
            (
                $DiskInfo.Size -
                $DiskInfo.FreeSpace
            ) /
            $DiskInfo.Size
        ) * 100

    $DiskUsage =
        [Math]::Round(
            $DiskUsage,
            0
        )

    # 결과 데이터
    $Result = @{
        server     = $ServerId
        serverType = $ServerType
        hostname   = $env:COMPUTERNAME

        checkDate  =
            (
                Get-Date
            ).ToString(
                "yyyy-MM-dd HH:mm:ss"
            )

        cpu        = $CpuUsage
        memory     = $MemoryUsage
        disk       = $DiskUsage

        network    = "UP"
        logError   = $false
    }

    #
    # results
    # └ 2026
    #    └ WEB01
    #       └ 20261116_150000.json
    #

    $Year =
        (
            Get-Date
        ).ToString(
            "yyyy"
        )

    $YearFolder =
        Join-Path `
        $ResultPath `
        $Year

    $ServerFolder =
        Join-Path `
        $YearFolder `
        $ServerId

    if (
        !(
            Test-Path `
            $ServerFolder
        )
    ) {

        New-Item `
            -ItemType Directory `
            -Path $ServerFolder `
            -Force |
        Out-Null

    }

    $FileName =
        (
            Get-Date
        ).ToString(
            "yyyyMMdd_HHmmss"
        ) + ".json"

    $OutputFile =
        Join-Path `
        $ServerFolder `
        $FileName

    #
    # JSON 저장
    # UTF8 No BOM
    #

    $Json =
        $Result |
        ConvertTo-Json `
            -Depth 5

    [System.IO.File]::WriteAllText(
        $OutputFile,
        $Json,
        (
            New-Object `
            System.Text.UTF8Encoding(
                $false
            )
        )
    )

    Write-Host ""
    Write-Host "===================================="
    Write-Host "Check Completed"
    Write-Host "===================================="
    Write-Host ""

    Write-Host "CPU     : $CpuUsage %"
    Write-Host "Memory  : $MemoryUsage %"
    Write-Host "Disk    : $DiskUsage %"

    Write-Host ""
    Write-Host "Result File:"
    Write-Host $OutputFile
    Write-Host ""

}
catch {

    Write-Host ""
    Write-Host "===================================="
    Write-Host "ERROR"
    Write-Host "===================================="
    Write-Host ""

    Write-Host `
        $_.Exception.Message

    exit 1

}