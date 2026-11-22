param([string]$ResultDirectory)

# 지원 범위: Windows Server 2012 이상, Windows PowerShell 3.0 이상(5.1 권장)
if ($PSVersionTable.PSVersion.Major -lt 3) {
  Write-Host "[OpsBox] 이 점검 스크립트는 Windows PowerShell 3.0 이상이 필요합니다. 현재 버전: $($PSVersionTable.PSVersion)"
  Write-Host '[OpsBox] Windows Management Framework를 업데이트한 뒤 다시 실행하세요. 결과 파일은 만들지 않았습니다.'
  exit 1
}

$ErrorActionPreference = 'Continue'
$configJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('eyJzZXJ2ZXIiOnsiaWQiOiJXQVMtMDEiLCJuYW1lIjoi64yA66+8IO2PrO2EuCBXQVMgIzEiLCJpcCI6IjEwLjEwLjIuMjEiLCJyZXN1bHREaXJlY3RvcnkiOiJcXFxcZmlsZXNlcnZlclxcb3BzYm94XFxyZXN1bHRzIiwidHlwZSI6IldBUyIsInByb2R1Y3QiOiJKRVVTIiwicm9sZXMiOlsiV0FTIl0sInByb2R1Y3RzIjp7IldBUyI6IkpFVVMifX0sImNoZWNrcyI6eyJwcm9jZXNzZXMiOlt7Im5hbWUiOiJqYXZhIn1dLCJkaXJlY3RvcmllcyI6W3sicGF0aCI6IkU6XFxqZXVzXFxsb2dzIn1dLCJmaWxlQ2hlY2tzIjpbXSwicG9ydHMiOlt7InBvcnQiOjk3MzYsInByb3RvY29sIjoiVENQIiwiZGVzY3JpcHRpb24iOiJKRVVTIOq0gOumrCJ9LHsicG9ydCI6ODA4OCwicHJvdG9jb2wiOiJUQ1AiLCJkZXNjcmlwdGlvbiI6IkpFVVMgSFRUUCJ9XSwiaHR0cENoZWNrcyI6W3sibmFtZSI6IuyXheustCBBUEkiLCJ1cmwiOiJodHRwOi8vMTAuMTAuMi4yMTo4MDg4L2FwaS9oZWFsdGgiLCJleHBlY3RlZFN0YXR1cyI6MjAwfV0sInJvbGVQb2xpY2llcyI6eyJXRUIiOltdLCJXQVMiOlt7Iml0ZW0iOiJXQVNfSlZNX0hFQVAiLCJuYW1lIjoiSlZNIEhlYXAg7IKs7Jqp66WgIiwicmVzdWx0Ijp7ImNvbXBvbmVudHMiOlt7InR5cGUiOiJTVU1NQVJZIn0seyJ0eXBlIjoiVEFCTEUiLCJjb2x1bW5zIjpbeyJrZXkiOiJwcm9jZXNzTmFtZSIsImxhYmVsIjoi7ZSE66Gc7IS47IqkIn0seyJrZXkiOiJwcm9jZXNzSWQiLCJsYWJlbCI6IlBJRCJ9LHsia2V5IjoiaGVhcFVzZWRNQiIsImxhYmVsIjoi7IKs7JqpIEhlYXAoTUIpIn0seyJrZXkiOiJoZWFwQ2FwYWNpdHlNQiIsImxhYmVsIjoi7KCE7LK0IEhlYXAoTUIpIn0seyJrZXkiOiJoZWFwVXNhZ2VQZXJjZW50IiwibGFiZWwiOiLsgqzsmqnrpaAoJSkifSx7ImtleSI6InN0YXR1cyIsImxhYmVsIjoi7IOB7YOcIn0seyJrZXkiOiJtZXNzYWdlIiwibGFiZWwiOiLsiJjsp5Eg66mU7Iuc7KeAIn1dfV0sInN0YXR1c0ZpZWxkIjoic3RhdHVzIiwic3RhdHVzUnVsZXMiOnsiaGVhbHRoeSI6IkhlYWx0aHkiLCJ3YXJuaW5nIjoiV2FybmluZyIsImNyaXRpY2FsIjoiQ3JpdGljYWwiLCJub3RDb2xsZWN0ZWQiOiJOb3RDb2xsZWN0ZWQiLCJ3YXJuaW5nUGVyY2VudCI6NzAsImNyaXRpY2FsUGVyY2VudCI6OTB9fSwiZXhlY3V0b3JUeXBlIjoiU0NSSVBUIn0seyJpdGVtIjoiV0FTX1RIUkVBRF9QT09MIiwibmFtZSI6IlRocmVhZCBQb29sIOyCrOyaqeuloCIsInJlc3VsdCI6eyJjb21wb25lbnRzIjpbeyJ0eXBlIjoiU1VNTUFSWSJ9LHsidHlwZSI6IlRBQkxFIiwiY29sdW1ucyI6W3sia2V5Ijoic3RhdHVzIiwibGFiZWwiOiLsg4Htg5wifSx7ImtleSI6InByb2R1Y3QiLCJsYWJlbCI6IuygnO2SiCJ9LHsia2V5IjoicG9vbE5hbWUiLCJsYWJlbCI6IlBvb2wifSx7ImtleSI6ImFjdGl2ZUNvdW50IiwibGFiZWwiOiLsgqzsmqkg7KSRIn0seyJrZXkiOiJtYXhDb3VudCIsImxhYmVsIjoi7LWc64yAIn0seyJrZXkiOiJ1c2FnZVBlcmNlbnQiLCJsYWJlbCI6IuyCrOyaqeuloCglKSJ9LHsia2V5IjoibWVzc2FnZSIsImxhYmVsIjoi6rKw6rO8In1dfV0sInN0YXR1c0ZpZWxkIjoic3RhdHVzIiwic3RhdHVzUnVsZXMiOnsiaGVhbHRoeSI6IkhlYWx0aHkiLCJ3YXJuaW5nIjoiV2FybmluZyIsImNyaXRpY2FsIjoiQ3JpdGljYWwiLCJub3RDb2xsZWN0ZWQiOiJOb3RDb2xsZWN0ZWQifX0sImV4ZWN1dG9yVHlwZSI6IlNDUklQVCJ9LHsiaXRlbSI6IldBU19MT05HX1JVTk5JTkdfVEhSRUFEIiwibmFtZSI6Iuyepeq4sCDsiJjtlokgVGhyZWFkIiwicmVzdWx0Ijp7ImNvbXBvbmVudHMiOlt7InR5cGUiOiJTVU1NQVJZIn0seyJ0eXBlIjoiVEFCTEUiLCJjb2x1bW5zIjpbeyJrZXkiOiJzdGF0dXMiLCJsYWJlbCI6IuyDge2DnCJ9LHsia2V5IjoicHJvY2Vzc0lkIiwibGFiZWwiOiJQSUQifSx7ImtleSI6InRocmVhZE5hbWUiLCJsYWJlbCI6IlRocmVhZCJ9LHsia2V5IjoiZWxhcHNlZFNlY29uZHMiLCJsYWJlbCI6IuyImO2WiSDsi5zqsIQo7LSIKSJ9LHsia2V5IjoibWVzc2FnZSIsImxhYmVsIjoi6rKw6rO8In1dfV0sInN0YXR1c0ZpZWxkIjoic3RhdHVzIiwic3RhdHVzUnVsZXMiOnsiaGVhbHRoeSI6IkhlYWx0aHkiLCJ3YXJuaW5nIjoiV2FybmluZyIsImNyaXRpY2FsIjoiQ3JpdGljYWwiLCJub3RDb2xsZWN0ZWQiOiJOb3RDb2xsZWN0ZWQifX0sImV4ZWN1dG9yVHlwZSI6IlNDUklQVCJ9LHsiaXRlbSI6IldBU19EQl9DT05ORUNUSU9OX1BPT0wiLCJuYW1lIjoiREIgQ29ubmVjdGlvbiBQb29sIOyDge2DnCIsInJlc3VsdCI6eyJjb21wb25lbnRzIjpbeyJ0eXBlIjoiU1VNTUFSWSJ9LHsidHlwZSI6IlRBQkxFIiwiY29sdW1ucyI6W3sia2V5Ijoic3RhdHVzIiwibGFiZWwiOiLsg4Htg5wifSx7ImtleSI6InByb2R1Y3QiLCJsYWJlbCI6IuygnO2SiCJ9LHsia2V5IjoicG9vbE5hbWUiLCJsYWJlbCI6IlBvb2wifSx7ImtleSI6ImFjdGl2ZUNvdW50IiwibGFiZWwiOiLsgqzsmqkg7KSRIn0seyJrZXkiOiJtYXhDb3VudCIsImxhYmVsIjoi7LWc64yAIn0seyJrZXkiOiJ1c2FnZVBlcmNlbnQiLCJsYWJlbCI6IuyCrOyaqeuloCglKSJ9LHsia2V5IjoibWVzc2FnZSIsImxhYmVsIjoi6rKw6rO8In1dfV0sInN0YXR1c0ZpZWxkIjoic3RhdHVzIiwic3RhdHVzUnVsZXMiOnsiaGVhbHRoeSI6IkhlYWx0aHkiLCJ3YXJuaW5nIjoiV2FybmluZyIsImNyaXRpY2FsIjoiQ3JpdGljYWwiLCJub3RDb2xsZWN0ZWQiOiJOb3RDb2xsZWN0ZWQifX0sImV4ZWN1dG9yVHlwZSI6IlNDUklQVCJ9LHsiaXRlbSI6IldBU19ERVBMT1lNRU5UIiwibmFtZSI6IuyVoO2UjOumrOy8gOydtOyFmCDrsLDtj6wg7IOB7YOcIiwicmVzdWx0Ijp7ImNvbXBvbmVudHMiOlt7InR5cGUiOiJTVU1NQVJZIn0seyJ0eXBlIjoiVEFCTEUiLCJjb2x1bW5zIjpbeyJrZXkiOiJzdGF0dXMiLCJsYWJlbCI6IuyDge2DnCJ9LHsia2V5IjoicHJvZHVjdCIsImxhYmVsIjoi7KCc7ZKIIn0seyJrZXkiOiJwcm9jZXNzQ291bnQiLCJsYWJlbCI6Iu2UhOuhnOyEuOyKpCDsiJgifSx7ImtleSI6InByb2Nlc3NlcyIsImxhYmVsIjoi7ZSE66Gc7IS47IqkIn0seyJrZXkiOiJtZXNzYWdlIiwibGFiZWwiOiLqsrDqs7wifV19XSwic3RhdHVzRmllbGQiOiJzdGF0dXMiLCJzdGF0dXNSdWxlcyI6eyJoZWFsdGh5IjoiSGVhbHRoeSIsIndhcm5pbmciOiJXYXJuaW5nIiwiY3JpdGljYWwiOiJDcml0aWNhbCIsIm5vdENvbGxlY3RlZCI6Ik5vdENvbGxlY3RlZCJ9fSwiZXhlY3V0b3JUeXBlIjoiU0NSSVBUIn0seyJpdGVtIjoiV0FTX0hFQVBfRFVNUCIsIm5hbWUiOiJIZWFwIER1bXAg7YyM7J28IOyDge2DnCIsInJlc3VsdCI6eyJjb21wb25lbnRzIjpbeyJ0eXBlIjoiU1VNTUFSWSJ9LHsidHlwZSI6IlRBQkxFIiwiY29sdW1ucyI6W3sia2V5Ijoic3RhdHVzIiwibGFiZWwiOiLsg4Htg5wifSx7ImtleSI6ImphdmFQcm9jZXNzQ291bnQiLCJsYWJlbCI6IkphdmEg7ZSE66Gc7IS47IqkIOyImCJ9LHsia2V5IjoiZXhpc3RpbmdGaWxlQ291bnQiLCJsYWJlbCI6Iu2MjOydvCDsiJgifSx7ImtleSI6ImZpbGVzIiwibGFiZWwiOiJIZWFwIER1bXAg7YyM7J28In0seyJrZXkiOiJtZXNzYWdlIiwibGFiZWwiOiLqsrDqs7wifV19XSwic3RhdHVzRmllbGQiOiJzdGF0dXMiLCJzdGF0dXNSdWxlcyI6eyJoZWFsdGh5IjoiSGVhbHRoeSIsIndhcm5pbmciOiJXYXJuaW5nIiwiY3JpdGljYWwiOiJDcml0aWNhbCIsIm5vdENvbGxlY3RlZCI6Ik5vdENvbGxlY3RlZCJ9fSwiZXhlY3V0b3JUeXBlIjoiU0NSSVBUIn0seyJpdGVtIjoiV0FTX1NUQVJUVVBfU0NSSVBUIiwibmFtZSI6Iuq4sOuPmSDsiqTtgazrpr3tirgg67OA6rK9IOyDge2DnCIsInJlc3VsdCI6eyJjb21wb25lbnRzIjpbeyJ0eXBlIjoiU1VNTUFSWSJ9LHsidHlwZSI6IlRBQkxFIiwiY29sdW1ucyI6W3sia2V5Ijoic3RhdHVzIiwibGFiZWwiOiLsg4Htg5wifSx7ImtleSI6InByb2R1Y3QiLCJsYWJlbCI6IuygnO2SiCJ9LHsia2V5IjoicHJvY2Vzc0NvdW50IiwibGFiZWwiOiLtlITroZzshLjsiqQg7IiYIn0seyJrZXkiOiJwcm9jZXNzZXMiLCJsYWJlbCI6Iu2UhOuhnOyEuOyKpMK36rK966GcIn0seyJrZXkiOiJtZXNzYWdlIiwibGFiZWwiOiLqsrDqs7wifV19XSwic3RhdHVzRmllbGQiOiJzdGF0dXMiLCJzdGF0dXNSdWxlcyI6eyJoZWFsdGh5IjoiSGVhbHRoeSIsIndhcm5pbmciOiJXYXJuaW5nIiwiY3JpdGljYWwiOiJDcml0aWNhbCIsIm5vdENvbGxlY3RlZCI6Ik5vdENvbGxlY3RlZCJ9fSwiZXhlY3V0b3JUeXBlIjoiU0NSSVBUIn0seyJpdGVtIjoiV0FTX0xPRyIsIm5hbWUiOiJXQVMg66Gc6re4IOyDge2DnCIsInJlc3VsdCI6eyJjb21wb25lbnRzIjpbeyJ0eXBlIjoiU1VNTUFSWSJ9LHsidHlwZSI6IkxPR19UQUJMRSIsImNvbHVtbnMiOlt7ImtleSI6InRpbWVzdGFtcCIsImxhYmVsIjoi7Iuc6rCBIn0seyJrZXkiOiJwYXRoIiwibGFiZWwiOiLtjIzsnbwg6rK966GcIn0seyJrZXkiOiJ0ZXh0IiwibGFiZWwiOiLroZzqt7gg64K07JqpIn1dfV0sInN0YXR1c0ZpZWxkIjoic3RhdHVzIiwic3RhdHVzUnVsZXMiOnsiaGVhbHRoeSI6IkhlYWx0aHkiLCJ3YXJuaW5nIjoiV2FybmluZyIsImNyaXRpY2FsIjoiQ3JpdGljYWwiLCJub3RDb2xsZWN0ZWQiOiJOb3RDb2xsZWN0ZWQifX0sImV4ZWN1dG9yVHlwZSI6IkxPR19BTkFMWVNJUyJ9XSwiREIiOltdfSwiYmFzaWNQb2xpY3lJdGVtcyI6W3siaXRlbSI6IkNVU1RPTV9ERU1PX0RCUE9SVCIsIm5hbWUiOiLtj6zthLggREIg7Y+s7Yq4IOygkeyGjSIsInJlc3VsdCI6eyJjb21wb25lbnRzIjpbeyJ0eXBlIjoiU1VNTUFSWSJ9LHsidHlwZSI6IlRBQkxFIiwiY29sdW1ucyI6W3sia2V5IjoidGFyZ2V0IiwibGFiZWwiOiLrjIDsg4EifSx7ImtleSI6InZhbHVlIiwibGFiZWwiOiLqsJIifSx7ImtleSI6InRocmVzaG9sZCIsImxhYmVsIjoi6riw7KSAIn0seyJrZXkiOiJzdGF0dXMiLCJsYWJlbCI6IuyDge2DnCJ9LHsia2V5IjoibWVzc2FnZSIsImxhYmVsIjoi66mU7Iuc7KeAIn1dfV0sInN0YXR1c0ZpZWxkIjoic3RhdHVzIn0sImV4ZWN1dG9yVHlwZSI6IkNIRUNLX0JVSUxERVIiLCJpbnB1dHMiOlt7ImtleSI6InRhcmdldHMiLCJsYWJlbCI6IuygkeyGjSDrjIDsg4EgKO2YuOyKpO2KuDrtj6ztirgsIO2VnCDspITsl5Ag7ZWY64KYKSIsInR5cGUiOiJUQVJHRVRfTElTVCIsInNjb3BlIjoiU0VSVkVSIiwicmVxdWlyZWQiOnRydWV9XX1dLCJwb2xpY3lJdGVtcyI6eyJIT1NUX0lORk8iOnsiaWQiOiJIT1NUX0lORk8iLCJuYW1lIjoi7ISc67KEIOq4sOuzuOygleuztCIsImVuYWJsZWQiOnRydWUsImV4ZWN1dG9yIjp7InR5cGUiOiJTQ1JJUFQiLCJ0ZW1wbGF0ZUlkIjoiV0lORE9XUy1QQVJULUhPU1RfSU5GTyIsIm9wdGlvbnMiOnt9fSwiaW5wdXRzIjpbXSwicmVzdWx0Ijp7ImNvbXBvbmVudHMiOlt7InR5cGUiOiJTVU1NQVJZIn0seyJ0eXBlIjoiVEFCTEUiLCJjb2x1bW5zIjpbeyJrZXkiOiJob3N0bmFtZSIsImxhYmVsIjoi7Zi47Iqk7Yq466qFIn0seyJrZXkiOiJvc05hbWUiLCJsYWJlbCI6IuyatOyYgeyytOygnCJ9LHsia2V5Ijoib3NWZXJzaW9uIiwibGFiZWwiOiJPUyDrsoTsoIQifSx7ImtleSI6InN0YXR1cyIsImxhYmVsIjoi7IOB7YOcIn1dfV0sInN0YXR1c0ZpZWxkIjoic3RhdHVzIiwic3RhdHVzUnVsZXMiOnsiaGVhbHRoeSI6IkhlYWx0aHkiLCJ3YXJuaW5nIjoiV2FybmluZyIsImNyaXRpY2FsIjoiQ3JpdGljYWwiLCJub3RDb2xsZWN0ZWQiOiJOb3RDb2xsZWN0ZWQifX19LCJDUFUiOnsiaWQiOiJDUFUiLCJuYW1lIjoiQ1BVIOyCrOyaqeuloCIsImVuYWJsZWQiOnRydWUsImV4ZWN1dG9yIjp7InR5cGUiOiJTQ1JJUFQiLCJ0ZW1wbGF0ZUlkIjoiV0lORE9XUy1QQVJULUNQVSIsIm9wdGlvbnMiOnsid2FybmluZ1BlcmNlbnQiOjcwLCJjcml0aWNhbFBlcmNlbnQiOjkwfX0sImlucHV0cyI6W10sInJlc3VsdCI6eyJjb21wb25lbnRzIjpbeyJ0eXBlIjoiU1VNTUFSWSJ9LHsidHlwZSI6Ik1FVFJJQyJ9XSwic3RhdHVzRmllbGQiOiJzdGF0dXMiLCJzdGF0dXNSdWxlcyI6eyJoZWFsdGh5IjoiSGVhbHRoeSIsIndhcm5pbmciOiJXYXJuaW5nIiwiY3JpdGljYWwiOiJDcml0aWNhbCIsIm5vdENvbGxlY3RlZCI6Ik5vdENvbGxlY3RlZCIsIndhcm5pbmdQZXJjZW50Ijo3MCwiY3JpdGljYWxQZXJjZW50Ijo5MH19fSwiTUVNT1JZIjp7ImlkIjoiTUVNT1JZIiwibmFtZSI6IuuplOuqqOumrCDsgqzsmqnrpaAiLCJlbmFibGVkIjp0cnVlLCJleGVjdXRvciI6eyJ0eXBlIjoiU0NSSVBUIiwidGVtcGxhdGVJZCI6IldJTkRPV1MtUEFSVC1NRU1PUlkiLCJvcHRpb25zIjp7Indhcm5pbmdQZXJjZW50Ijo3MCwiY3JpdGljYWxQZXJjZW50Ijo5MH19LCJpbnB1dHMiOltdLCJyZXN1bHQiOnsiY29tcG9uZW50cyI6W3sidHlwZSI6IlNVTU1BUlkifSx7InR5cGUiOiJNRVRSSUMifV0sInN0YXR1c0ZpZWxkIjoic3RhdHVzIiwic3RhdHVzUnVsZXMiOnsiaGVhbHRoeSI6IkhlYWx0aHkiLCJ3YXJuaW5nIjoiV2FybmluZyIsImNyaXRpY2FsIjoiQ3JpdGljYWwiLCJub3RDb2xsZWN0ZWQiOiJOb3RDb2xsZWN0ZWQiLCJ3YXJuaW5nUGVyY2VudCI6NzAsImNyaXRpY2FsUGVyY2VudCI6OTB9fX0sIlVQVElNRSI6eyJpZCI6IlVQVElNRSIsIm5hbWUiOiLqsIDrj5nsi5zqsIQiLCJlbmFibGVkIjp0cnVlLCJleGVjdXRvciI6eyJ0eXBlIjoiU0NSSVBUIiwidGVtcGxhdGVJZCI6IldJTkRPV1MtUEFSVC1VUFRJTUUiLCJvcHRpb25zIjp7fX0sImlucHV0cyI6W10sInJlc3VsdCI6eyJjb21wb25lbnRzIjpbeyJ0eXBlIjoiU1VNTUFSWSJ9LHsidHlwZSI6Ik1FVFJJQyJ9XSwic3RhdHVzRmllbGQiOiJzdGF0dXMiLCJzdGF0dXNSdWxlcyI6eyJoZWFsdGh5IjoiSGVhbHRoeSIsIndhcm5pbmciOiJXYXJuaW5nIiwiY3JpdGljYWwiOiJDcml0aWNhbCIsIm5vdENvbGxlY3RlZCI6Ik5vdENvbGxlY3RlZCJ9fX0sIkRJU0siOnsiaWQiOiJESVNLIiwibmFtZSI6IuuUlOyKpO2BrCDsgqzsmqnrn4kiLCJlbmFibGVkIjp0cnVlLCJleGVjdXRvciI6eyJ0eXBlIjoiRklMRVNZU1RFTV9DSEVDSyIsIm9wdGlvbnMiOnsid2FybmluZ1BlcmNlbnQiOjcwLCJjcml0aWNhbFBlcmNlbnQiOjkwfSwidGVtcGxhdGVJZCI6IldJTkRPV1MtUEFSVC1ESVNLIn0sImlucHV0cyI6W10sInJlc3VsdCI6eyJjb21wb25lbnRzIjpbeyJ0eXBlIjoiU1VNTUFSWSJ9LHsidHlwZSI6Ik1FVFJJQyJ9LHsidHlwZSI6IlRBQkxFIiwiY29sdW1ucyI6W3sia2V5IjoiZGV2aWNlIiwibGFiZWwiOiLrk5zrnbzsnbTruIwifSx7ImtleSI6InZvbHVtZU5hbWUiLCJsYWJlbCI6IuuzvOulqOuqhSJ9LHsia2V5IjoidG90YWxHQiIsImxhYmVsIjoi7KCE7LK0KEdCKSJ9LHsia2V5IjoidXNlZEdCIiwibGFiZWwiOiLsgqzsmqkoR0IpIn0seyJrZXkiOiJmcmVlR0IiLCJsYWJlbCI6IuyXrOycoChHQikifSx7ImtleSI6InVzYWdlUGVyY2VudCIsImxhYmVsIjoi7IKs7Jqp66WgKCUpIn0seyJrZXkiOiJzdGF0dXMiLCJsYWJlbCI6IuyDge2DnCJ9XX1dLCJzdGF0dXNGaWVsZCI6InN0YXR1cyIsInN0YXR1c1J1bGVzIjp7ImhlYWx0aHkiOiJIZWFsdGh5Iiwid2FybmluZyI6Ildhcm5pbmciLCJjcml0aWNhbCI6IkNyaXRpY2FsIiwibm90Q29sbGVjdGVkIjoiTm90Q29sbGVjdGVkIiwid2FybmluZ1BlcmNlbnQiOjcwLCJjcml0aWNhbFBlcmNlbnQiOjkwfX19LCJQUk9DRVNTIjp7ImlkIjoiUFJPQ0VTUyIsIm5hbWUiOiLtlITroZzshLjsiqQiLCJlbmFibGVkIjp0cnVlLCJleGVjdXRvciI6eyJ0eXBlIjoiRklMRVNZU1RFTV9DSEVDSyIsInRlbXBsYXRlSWQiOiJXSU5ET1dTLVBBUlQtUFJPQ0VTUyIsIm9wdGlvbnMiOnt9fSwiaW5wdXRzIjpbXSwicmVzdWx0Ijp7ImNvbXBvbmVudHMiOlt7InR5cGUiOiJTVU1NQVJZIn0seyJ0eXBlIjoiVEFCTEUiLCJjb2x1bW5zIjpbeyJrZXkiOiJuYW1lIiwibGFiZWwiOiLtlITroZzshLjsiqQifSx7ImtleSI6InByb2Nlc3NJZCIsImxhYmVsIjoiUElEIn0seyJrZXkiOiJydW5uaW5nIiwibGFiZWwiOiLsi6Ttlokg7KSRIn0seyJrZXkiOiJjcHVTZWNvbmRzIiwibGFiZWwiOiJDUFUo7LSIKSJ9LHsia2V5IjoibWVtb3J5TUIiLCJsYWJlbCI6IuuplOuqqOumrChNQikifSx7ImtleSI6InVwdGltZU1pbnV0ZXMiLCJsYWJlbCI6IuqwgOuPmSjrtoQpIn0seyJrZXkiOiJzdGF0dXMiLCJsYWJlbCI6IuyDge2DnCJ9XX1dLCJzdGF0dXNGaWVsZCI6InN0YXR1cyIsInN0YXR1c1J1bGVzIjp7ImhlYWx0aHkiOiJIZWFsdGh5Iiwid2FybmluZyI6Ildhcm5pbmciLCJjcml0aWNhbCI6IkNyaXRpY2FsIiwibm90Q29sbGVjdGVkIjoiTm90Q29sbGVjdGVkIn19fSwiRElSRUNUT1JZIjp7ImlkIjoiRElSRUNUT1JZIiwibmFtZSI6IuuUlOugie2EsOumrCDsgqzsmqnrn4kiLCJlbmFibGVkIjp0cnVlLCJleGVjdXRvciI6eyJ0eXBlIjoiRklMRVNZU1RFTV9DSEVDSyIsInRlbXBsYXRlSWQiOiJXSU5ET1dTLVBBUlQtRElSRUNUT1JZIiwib3B0aW9ucyI6e319LCJpbnB1dHMiOltdLCJyZXN1bHQiOnsiY29tcG9uZW50cyI6W3sidHlwZSI6IlNVTU1BUlkifSx7InR5cGUiOiJUQUJMRSIsImNvbHVtbnMiOlt7ImtleSI6InBhdGgiLCJsYWJlbCI6IuqyveuhnCJ9LHsia2V5IjoiZXhpc3RzIiwibGFiZWwiOiLsobTsnqwifSx7ImtleSI6InNpemVHQiIsImxhYmVsIjoi7YGs6riwKEdCKSJ9LHsia2V5IjoidXNlZEdCIiwibGFiZWwiOiLsgqzsmqkoR0IpIn0seyJrZXkiOiJmcmVlR0IiLCJsYWJlbCI6IuyXrOycoChHQikifSx7ImtleSI6InRvdGFsR0IiLCJsYWJlbCI6IuyghOyytChHQikifSx7ImtleSI6InVzYWdlUGVyY2VudCIsImxhYmVsIjoi7IKs7Jqp66WgKCUpIn0seyJrZXkiOiJzdGF0dXMiLCJsYWJlbCI6IuyDge2DnCJ9LHsia2V5IjoibWVzc2FnZSIsImxhYmVsIjoi66mU7Iuc7KeAIn1dfV0sInN0YXR1c0ZpZWxkIjoic3RhdHVzIiwic3RhdHVzUnVsZXMiOnsiaGVhbHRoeSI6IkhlYWx0aHkiLCJ3YXJuaW5nIjoiV2FybmluZyIsImNyaXRpY2FsIjoiQ3JpdGljYWwiLCJub3RDb2xsZWN0ZWQiOiJOb3RDb2xsZWN0ZWQifX19LCJGSUxFX1NJWkUiOnsiaWQiOiJGSUxFX1NJWkUiLCJuYW1lIjoi7YyM7J28IO2BrOq4sCIsImVuYWJsZWQiOnRydWUsImV4ZWN1dG9yIjp7InR5cGUiOiJGSUxFU1lTVEVNX0NIRUNLIiwidGVtcGxhdGVJZCI6IldJTkRPV1MtUEFSVC1GSUxFX1NJWkUiLCJvcHRpb25zIjp7fX0sImlucHV0cyI6W10sInJlc3VsdCI6eyJjb21wb25lbnRzIjpbeyJ0eXBlIjoiU1VNTUFSWSJ9LHsidHlwZSI6IlRBQkxFIiwiY29sdW1ucyI6W3sia2V5IjoicGF0aCIsImxhYmVsIjoi7YyM7J28IOqyveuhnCJ9LHsia2V5IjoiZXhpc3RzIiwibGFiZWwiOiLsobTsnqwifSx7ImtleSI6InNpemVNQiIsImxhYmVsIjoi7YGs6riwKE1CKSJ9LHsia2V5Ijoic3RhdHVzIiwibGFiZWwiOiLsg4Htg5wifSx7ImtleSI6Im1lc3NhZ2UiLCJsYWJlbCI6IuuplOyLnOyngCJ9XX1dLCJzdGF0dXNGaWVsZCI6InN0YXR1cyIsInN0YXR1c1J1bGVzIjp7ImhlYWx0aHkiOiJIZWFsdGh5Iiwid2FybmluZyI6Ildhcm5pbmciLCJjcml0aWNhbCI6IkNyaXRpY2FsIiwibm90Q29sbGVjdGVkIjoiTm90Q29sbGVjdGVkIn19fSwiUE9SVCI6eyJpZCI6IlBPUlQiLCJuYW1lIjoi7Y+s7Yq4IOumrOyKpOuLnSIsImVuYWJsZWQiOnRydWUsImV4ZWN1dG9yIjp7InR5cGUiOiJUQ1BfQ0hFQ0siLCJ0ZW1wbGF0ZUlkIjoiV0lORE9XUy1QQVJULVBPUlQiLCJvcHRpb25zIjp7fX0sImlucHV0cyI6W10sInJlc3VsdCI6eyJjb21wb25lbnRzIjpbeyJ0eXBlIjoiU1VNTUFSWSJ9LHsidHlwZSI6IlRBQkxFIiwiY29sdW1ucyI6W3sia2V5IjoicG9ydCIsImxhYmVsIjoi7Y+s7Yq4In0seyJrZXkiOiJwcm90b2NvbCIsImxhYmVsIjoi7ZSE66Gc7Yag7L2cIn0seyJrZXkiOiJkZXNjcmlwdGlvbiIsImxhYmVsIjoi7ISk66qFIn0seyJrZXkiOiJsaXN0ZW5pbmciLCJsYWJlbCI6IuyImOyLoCDspJEifSx7ImtleSI6InByb2Nlc3NOYW1lIiwibGFiZWwiOiLtlITroZzshLjsiqQifV19XSwic3RhdHVzRmllbGQiOiJzdGF0dXMiLCJzdGF0dXNSdWxlcyI6eyJoZWFsdGh5IjoiSGVhbHRoeSIsIndhcm5pbmciOiJXYXJuaW5nIiwiY3JpdGljYWwiOiJDcml0aWNhbCIsIm5vdENvbGxlY3RlZCI6Ik5vdENvbGxlY3RlZCJ9fX0sIkhUVFAiOnsiaWQiOiJIVFRQIiwibmFtZSI6IkhUVFAg7J2R64u1IiwiZW5hYmxlZCI6dHJ1ZSwiZXhlY3V0b3IiOnsidHlwZSI6IkhUVFBfQ0hFQ0siLCJ0ZW1wbGF0ZUlkIjoiV0lORE9XUy1QQVJULUhUVFAiLCJvcHRpb25zIjp7fX0sImlucHV0cyI6W10sInJlc3VsdCI6eyJjb21wb25lbnRzIjpbeyJ0eXBlIjoiU1VNTUFSWSJ9LHsidHlwZSI6IlRBQkxFIiwiY29sdW1ucyI6W3sia2V5IjoibmFtZSIsImxhYmVsIjoi7KCQ6rKA66qFIn0seyJrZXkiOiJ1cmwiLCJsYWJlbCI6IlVSTCJ9LHsia2V5IjoiZXhwZWN0ZWRTdGF0dXMiLCJsYWJlbCI6Iuq4sOuMgCDsvZTrk5wifSx7ImtleSI6InN0YXR1c0NvZGUiLCJsYWJlbCI6IuydkeuLtSDsvZTrk5wifSx7ImtleSI6InJlc3BvbnNlVGltZU1zIiwibGFiZWwiOiLsnZHri7Ug7Iuc6rCEKG1zKSJ9LHsia2V5Ijoic3VjY2VzcyIsImxhYmVsIjoi7ISx6rO1In0seyJrZXkiOiJlcnJvciIsImxhYmVsIjoi7Jik66WYIn1dfV0sInN0YXR1c0ZpZWxkIjoic3RhdHVzIiwic3RhdHVzUnVsZXMiOnsiaGVhbHRoeSI6IkhlYWx0aHkiLCJ3YXJuaW5nIjoiV2FybmluZyIsImNyaXRpY2FsIjoiQ3JpdGljYWwiLCJub3RDb2xsZWN0ZWQiOiJOb3RDb2xsZWN0ZWQifX19LCJDVVNUT01fREVNT19EQlBPUlQiOnsiaWQiOiJDVVNUT01fREVNT19EQlBPUlQiLCJuYW1lIjoi7Y+s7YS4IERCIO2PrO2KuCDsoJHsho0iLCJlbmFibGVkIjp0cnVlLCJleGVjdXRvciI6eyJ0eXBlIjoiQ0hFQ0tfQlVJTERFUiIsIm9wdGlvbnMiOnsiYnVpbGRlciI6eyJ2ZXJzaW9uIjoxLCJ0eXBlIjoiUkVNT1RFX1BPUlQiLCJwcmVzZXRJZCI6bnVsbCwidGltZW91dFNlY29uZHMiOjN9fSwidGVtcGxhdGVJZCI6IkdFTi1DVVNUT01fREVNT19EQlBPUlQtV0lORE9XUyJ9LCJpbnB1dHMiOlt7ImtleSI6InRhcmdldHMiLCJsYWJlbCI6IuygkeyGjSDrjIDsg4EgKO2YuOyKpO2KuDrtj6ztirgsIO2VnCDspITsl5Ag7ZWY64KYKSIsInR5cGUiOiJUQVJHRVRfTElTVCIsInNjb3BlIjoiU0VSVkVSIiwicmVxdWlyZWQiOnRydWV9XSwicmVzdWx0Ijp7ImNvbXBvbmVudHMiOlt7InR5cGUiOiJTVU1NQVJZIn0seyJ0eXBlIjoiVEFCTEUiLCJjb2x1bW5zIjpbeyJrZXkiOiJ0YXJnZXQiLCJsYWJlbCI6IuuMgOyDgSJ9LHsia2V5IjoidmFsdWUiLCJsYWJlbCI6IuqwkiJ9LHsia2V5IjoidGhyZXNob2xkIiwibGFiZWwiOiLquLDspIAifSx7ImtleSI6InN0YXR1cyIsImxhYmVsIjoi7IOB7YOcIn0seyJrZXkiOiJtZXNzYWdlIiwibGFiZWwiOiLrqZTsi5zsp4AifV19XSwic3RhdHVzRmllbGQiOiJzdGF0dXMifX0sIldBU19KVk1fSEVBUCI6eyJpZCI6IldBU19KVk1fSEVBUCIsIm5hbWUiOiJKVk0gSGVhcCDsgqzsmqnrpaAiLCJlbmFibGVkIjp0cnVlLCJleGVjdXRvciI6eyJ0eXBlIjoiU0NSSVBUIiwidGVtcGxhdGVJZCI6IldJTkRPV1MtUEFSVC1XQVNfSlZNX0hFQVAiLCJvcHRpb25zIjp7Indhcm5pbmdQZXJjZW50Ijo3MCwiY3JpdGljYWxQZXJjZW50Ijo5MH19LCJpbnB1dHMiOltdLCJyZXN1bHQiOnsiY29tcG9uZW50cyI6W3sidHlwZSI6IlNVTU1BUlkifSx7InR5cGUiOiJUQUJMRSIsImNvbHVtbnMiOlt7ImtleSI6InByb2Nlc3NOYW1lIiwibGFiZWwiOiLtlITroZzshLjsiqQifSx7ImtleSI6InByb2Nlc3NJZCIsImxhYmVsIjoiUElEIn0seyJrZXkiOiJoZWFwVXNlZE1CIiwibGFiZWwiOiLsgqzsmqkgSGVhcChNQikifSx7ImtleSI6ImhlYXBDYXBhY2l0eU1CIiwibGFiZWwiOiLsoITssrQgSGVhcChNQikifSx7ImtleSI6ImhlYXBVc2FnZVBlcmNlbnQiLCJsYWJlbCI6IuyCrOyaqeuloCglKSJ9LHsia2V5Ijoic3RhdHVzIiwibGFiZWwiOiLsg4Htg5wifSx7ImtleSI6Im1lc3NhZ2UiLCJsYWJlbCI6IuyImOynkSDrqZTsi5zsp4AifV19XSwic3RhdHVzRmllbGQiOiJzdGF0dXMiLCJzdGF0dXNSdWxlcyI6eyJoZWFsdGh5IjoiSGVhbHRoeSIsIndhcm5pbmciOiJXYXJuaW5nIiwiY3JpdGljYWwiOiJDcml0aWNhbCIsIm5vdENvbGxlY3RlZCI6Ik5vdENvbGxlY3RlZCIsIndhcm5pbmdQZXJjZW50Ijo3MCwiY3JpdGljYWxQZXJjZW50Ijo5MH19fSwiV0FTX1RIUkVBRF9QT09MIjp7ImlkIjoiV0FTX1RIUkVBRF9QT09MIiwibmFtZSI6IlRocmVhZCBQb29sIOyCrOyaqeuloCIsImVuYWJsZWQiOnRydWUsImV4ZWN1dG9yIjp7InR5cGUiOiJTQ1JJUFQiLCJ0ZW1wbGF0ZUlkIjoiV0lORE9XUy1QQVJULVdBU19USFJFQURfUE9PTCIsIm9wdGlvbnMiOnt9fSwiaW5wdXRzIjpbXSwicmVzdWx0Ijp7ImNvbXBvbmVudHMiOlt7InR5cGUiOiJTVU1NQVJZIn0seyJ0eXBlIjoiVEFCTEUiLCJjb2x1bW5zIjpbeyJrZXkiOiJzdGF0dXMiLCJsYWJlbCI6IuyDge2DnCJ9LHsia2V5IjoicHJvZHVjdCIsImxhYmVsIjoi7KCc7ZKIIn0seyJrZXkiOiJwb29sTmFtZSIsImxhYmVsIjoiUG9vbCJ9LHsia2V5IjoiYWN0aXZlQ291bnQiLCJsYWJlbCI6IuyCrOyaqSDspJEifSx7ImtleSI6Im1heENvdW50IiwibGFiZWwiOiLstZzrjIAifSx7ImtleSI6InVzYWdlUGVyY2VudCIsImxhYmVsIjoi7IKs7Jqp66WgKCUpIn0seyJrZXkiOiJtZXNzYWdlIiwibGFiZWwiOiLqsrDqs7wifV19XSwic3RhdHVzRmllbGQiOiJzdGF0dXMiLCJzdGF0dXNSdWxlcyI6eyJoZWFsdGh5IjoiSGVhbHRoeSIsIndhcm5pbmciOiJXYXJuaW5nIiwiY3JpdGljYWwiOiJDcml0aWNhbCIsIm5vdENvbGxlY3RlZCI6Ik5vdENvbGxlY3RlZCJ9fX0sIldBU19MT05HX1JVTk5JTkdfVEhSRUFEIjp7ImlkIjoiV0FTX0xPTkdfUlVOTklOR19USFJFQUQiLCJuYW1lIjoi7J6l6riwIOyImO2WiSBUaHJlYWQiLCJlbmFibGVkIjp0cnVlLCJleGVjdXRvciI6eyJ0eXBlIjoiU0NSSVBUIiwidGVtcGxhdGVJZCI6IldJTkRPV1MtUEFSVC1XQVNfTE9OR19SVU5OSU5HX1RIUkVBRCIsIm9wdGlvbnMiOnt9fSwiaW5wdXRzIjpbXSwicmVzdWx0Ijp7ImNvbXBvbmVudHMiOlt7InR5cGUiOiJTVU1NQVJZIn0seyJ0eXBlIjoiVEFCTEUiLCJjb2x1bW5zIjpbeyJrZXkiOiJzdGF0dXMiLCJsYWJlbCI6IuyDge2DnCJ9LHsia2V5IjoicHJvY2Vzc0lkIiwibGFiZWwiOiJQSUQifSx7ImtleSI6InRocmVhZE5hbWUiLCJsYWJlbCI6IlRocmVhZCJ9LHsia2V5IjoiZWxhcHNlZFNlY29uZHMiLCJsYWJlbCI6IuyImO2WiSDsi5zqsIQo7LSIKSJ9LHsia2V5IjoibWVzc2FnZSIsImxhYmVsIjoi6rKw6rO8In1dfV0sInN0YXR1c0ZpZWxkIjoic3RhdHVzIiwic3RhdHVzUnVsZXMiOnsiaGVhbHRoeSI6IkhlYWx0aHkiLCJ3YXJuaW5nIjoiV2FybmluZyIsImNyaXRpY2FsIjoiQ3JpdGljYWwiLCJub3RDb2xsZWN0ZWQiOiJOb3RDb2xsZWN0ZWQifX19LCJXQVNfREJfQ09OTkVDVElPTl9QT09MIjp7ImlkIjoiV0FTX0RCX0NPTk5FQ1RJT05fUE9PTCIsIm5hbWUiOiJEQiBDb25uZWN0aW9uIFBvb2wg7IOB7YOcIiwiZW5hYmxlZCI6dHJ1ZSwiZXhlY3V0b3IiOnsidHlwZSI6IlNDUklQVCIsInRlbXBsYXRlSWQiOiJXSU5ET1dTLVBBUlQtV0FTX0RCX0NPTk5FQ1RJT05fUE9PTCIsIm9wdGlvbnMiOnt9fSwiaW5wdXRzIjpbXSwicmVzdWx0Ijp7ImNvbXBvbmVudHMiOlt7InR5cGUiOiJTVU1NQVJZIn0seyJ0eXBlIjoiVEFCTEUiLCJjb2x1bW5zIjpbeyJrZXkiOiJzdGF0dXMiLCJsYWJlbCI6IuyDge2DnCJ9LHsia2V5IjoicHJvZHVjdCIsImxhYmVsIjoi7KCc7ZKIIn0seyJrZXkiOiJwb29sTmFtZSIsImxhYmVsIjoiUG9vbCJ9LHsia2V5IjoiYWN0aXZlQ291bnQiLCJsYWJlbCI6IuyCrOyaqSDspJEifSx7ImtleSI6Im1heENvdW50IiwibGFiZWwiOiLstZzrjIAifSx7ImtleSI6InVzYWdlUGVyY2VudCIsImxhYmVsIjoi7IKs7Jqp66WgKCUpIn0seyJrZXkiOiJtZXNzYWdlIiwibGFiZWwiOiLqsrDqs7wifV19XSwic3RhdHVzRmllbGQiOiJzdGF0dXMiLCJzdGF0dXNSdWxlcyI6eyJoZWFsdGh5IjoiSGVhbHRoeSIsIndhcm5pbmciOiJXYXJuaW5nIiwiY3JpdGljYWwiOiJDcml0aWNhbCIsIm5vdENvbGxlY3RlZCI6Ik5vdENvbGxlY3RlZCJ9fX0sIldBU19ERVBMT1lNRU5UIjp7ImlkIjoiV0FTX0RFUExPWU1FTlQiLCJuYW1lIjoi7JWg7ZSM66as7LyA7J207IWYIOuwsO2PrCDsg4Htg5wiLCJlbmFibGVkIjp0cnVlLCJleGVjdXRvciI6eyJ0eXBlIjoiU0NSSVBUIiwidGVtcGxhdGVJZCI6IldJTkRPV1MtUEFSVC1XQVNfREVQTE9ZTUVOVCIsIm9wdGlvbnMiOnt9fSwiaW5wdXRzIjpbXSwicmVzdWx0Ijp7ImNvbXBvbmVudHMiOlt7InR5cGUiOiJTVU1NQVJZIn0seyJ0eXBlIjoiVEFCTEUiLCJjb2x1bW5zIjpbeyJrZXkiOiJzdGF0dXMiLCJsYWJlbCI6IuyDge2DnCJ9LHsia2V5IjoicHJvZHVjdCIsImxhYmVsIjoi7KCc7ZKIIn0seyJrZXkiOiJwcm9jZXNzQ291bnQiLCJsYWJlbCI6Iu2UhOuhnOyEuOyKpCDsiJgifSx7ImtleSI6InByb2Nlc3NlcyIsImxhYmVsIjoi7ZSE66Gc7IS47IqkIn0seyJrZXkiOiJtZXNzYWdlIiwibGFiZWwiOiLqsrDqs7wifV19XSwic3RhdHVzRmllbGQiOiJzdGF0dXMiLCJzdGF0dXNSdWxlcyI6eyJoZWFsdGh5IjoiSGVhbHRoeSIsIndhcm5pbmciOiJXYXJuaW5nIiwiY3JpdGljYWwiOiJDcml0aWNhbCIsIm5vdENvbGxlY3RlZCI6Ik5vdENvbGxlY3RlZCJ9fX0sIldBU19IRUFQX0RVTVAiOnsiaWQiOiJXQVNfSEVBUF9EVU1QIiwibmFtZSI6IkhlYXAgRHVtcCDtjIzsnbwg7IOB7YOcIiwiZW5hYmxlZCI6dHJ1ZSwiZXhlY3V0b3IiOnsidHlwZSI6IlNDUklQVCIsInRlbXBsYXRlSWQiOiJXSU5ET1dTLVBBUlQtV0FTX0hFQVBfRFVNUCIsIm9wdGlvbnMiOnt9fSwiaW5wdXRzIjpbXSwicmVzdWx0Ijp7ImNvbXBvbmVudHMiOlt7InR5cGUiOiJTVU1NQVJZIn0seyJ0eXBlIjoiVEFCTEUiLCJjb2x1bW5zIjpbeyJrZXkiOiJzdGF0dXMiLCJsYWJlbCI6IuyDge2DnCJ9LHsia2V5IjoiamF2YVByb2Nlc3NDb3VudCIsImxhYmVsIjoiSmF2YSDtlITroZzshLjsiqQg7IiYIn0seyJrZXkiOiJleGlzdGluZ0ZpbGVDb3VudCIsImxhYmVsIjoi7YyM7J28IOyImCJ9LHsia2V5IjoiZmlsZXMiLCJsYWJlbCI6IkhlYXAgRHVtcCDtjIzsnbwifSx7ImtleSI6Im1lc3NhZ2UiLCJsYWJlbCI6IuqysOqzvCJ9XX1dLCJzdGF0dXNGaWVsZCI6InN0YXR1cyIsInN0YXR1c1J1bGVzIjp7ImhlYWx0aHkiOiJIZWFsdGh5Iiwid2FybmluZyI6Ildhcm5pbmciLCJjcml0aWNhbCI6IkNyaXRpY2FsIiwibm90Q29sbGVjdGVkIjoiTm90Q29sbGVjdGVkIn19fSwiV0FTX1NUQVJUVVBfU0NSSVBUIjp7ImlkIjoiV0FTX1NUQVJUVVBfU0NSSVBUIiwibmFtZSI6Iuq4sOuPmSDsiqTtgazrpr3tirgg67OA6rK9IOyDge2DnCIsImVuYWJsZWQiOnRydWUsImV4ZWN1dG9yIjp7InR5cGUiOiJTQ1JJUFQiLCJ0ZW1wbGF0ZUlkIjoiV0lORE9XUy1QQVJULVdBU19TVEFSVFVQX1NDUklQVCIsIm9wdGlvbnMiOnt9fSwiaW5wdXRzIjpbXSwicmVzdWx0Ijp7ImNvbXBvbmVudHMiOlt7InR5cGUiOiJTVU1NQVJZIn0seyJ0eXBlIjoiVEFCTEUiLCJjb2x1bW5zIjpbeyJrZXkiOiJzdGF0dXMiLCJsYWJlbCI6IuyDge2DnCJ9LHsia2V5IjoicHJvZHVjdCIsImxhYmVsIjoi7KCc7ZKIIn0seyJrZXkiOiJwcm9jZXNzQ291bnQiLCJsYWJlbCI6Iu2UhOuhnOyEuOyKpCDsiJgifSx7ImtleSI6InByb2Nlc3NlcyIsImxhYmVsIjoi7ZSE66Gc7IS47Iqkwrfqsr3roZwifSx7ImtleSI6Im1lc3NhZ2UiLCJsYWJlbCI6IuqysOqzvCJ9XX1dLCJzdGF0dXNGaWVsZCI6InN0YXR1cyIsInN0YXR1c1J1bGVzIjp7ImhlYWx0aHkiOiJIZWFsdGh5Iiwid2FybmluZyI6Ildhcm5pbmciLCJjcml0aWNhbCI6IkNyaXRpY2FsIiwibm90Q29sbGVjdGVkIjoiTm90Q29sbGVjdGVkIn19fSwiV0FTX0xPRyI6eyJpZCI6IldBU19MT0ciLCJuYW1lIjoiV0FTIOuhnOq3uCDsg4Htg5wiLCJlbmFibGVkIjp0cnVlLCJleGVjdXRvciI6eyJ0eXBlIjoiTE9HX0FOQUxZU0lTIiwidGVtcGxhdGVJZCI6IldJTkRPV1MtUEFSVC1XQVNfTE9HIiwib3B0aW9ucyI6e319LCJpbnB1dHMiOltdLCJyZXN1bHQiOnsiY29tcG9uZW50cyI6W3sidHlwZSI6IlNVTU1BUlkifSx7InR5cGUiOiJMT0dfVEFCTEUiLCJjb2x1bW5zIjpbeyJrZXkiOiJ0aW1lc3RhbXAiLCJsYWJlbCI6IuyLnOqwgSJ9LHsia2V5IjoicGF0aCIsImxhYmVsIjoi7YyM7J28IOqyveuhnCJ9LHsia2V5IjoidGV4dCIsImxhYmVsIjoi66Gc6re4IOuCtOyaqSJ9XX1dLCJzdGF0dXNGaWVsZCI6InN0YXR1cyIsInN0YXR1c1J1bGVzIjp7ImhlYWx0aHkiOiJIZWFsdGh5Iiwid2FybmluZyI6Ildhcm5pbmciLCJjcml0aWNhbCI6IkNyaXRpY2FsIiwibm90Q29sbGVjdGVkIjoiTm90Q29sbGVjdGVkIn19fX0sInJvbGVQb2xpY3lTZXR0aW5ncyI6eyJDVVNUT01fREVNT19EQlBPUlQiOnsiaW5wdXRzIjp7InRhcmdldHMiOiIxMC4xMC40LjQxOjE0MzMifX0sIldBU19MT0ciOnsibG9nRGlyZWN0b3JpZXMiOlsiRTpcXGpldXNcXGxvZ3MiXSwicGVyaW9kRGF5cyI6N319fSwiZGF0YWJhc2UiOnsicG9saWN5UXVlcmllcyI6W10sImN1c3RvbVF1ZXJpZXMiOltdfX0='))
$opsboxConfig = ConvertFrom-Json -InputObject $configJson -ErrorAction Stop
$opsboxRunStamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss-fff'
# 결과 폴더: 매개변수 → OpsBox에서 정한 결과 저장 경로 → 스크립트 폴더 (하위 폴더를 만들지 않고 바로 아래에 저장)
$opsboxResultDirectory = if (-not [string]::IsNullOrWhiteSpace($ResultDirectory)) { $ResultDirectory.Trim() } elseif (-not [string]::IsNullOrWhiteSpace([string]$opsboxConfig.server.resultDirectory)) { [string]$opsboxConfig.server.resultDirectory } else { $PSScriptRoot }
$opsboxResultPath = Join-Path $opsboxResultDirectory "$($opsboxConfig.server.id)_$opsboxRunStamp.json"
$opsboxResultDirectoryReady = $true
try { New-Item -ItemType Directory -Path $opsboxResultDirectory -Force -ErrorAction Stop | Out-Null } catch { $opsboxResultDirectoryReady = $false }
function Write-OpsBoxLog {
  param([string]$Message)
  $logLine = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Write-Host $logLine
}

Write-OpsBoxLog '점검 스크립트 시작'
Write-OpsBoxLog "결과 폴더: $opsboxResultDirectory (접근 가능=$opsboxResultDirectoryReady)"
$hostname = $env:COMPUTERNAME
$osName = $null
$osVersion = $null
$checkDate = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$hostInfoStatus = 'NotCollected'
$uptimeMinutes = $null
$uptimeParts = $null
$uptimeStatus = 'NotCollected'
$cpu = $null
$cpuStatus = 'NotCollected'
$memory = $null
$memoryStatus = 'NotCollected'
$disk = $null
$diskStatus = 'NotCollected'
$disks = @()
$processes = @()
$directories = @()
$fileChecks = @()
$portChecks = @()
$httpChecks = @()
$wasChecks = @()
$webCheck = $null
$databaseChecks = $null
$rolePolicyResults = @()


Write-OpsBoxLog '서버 기본정보 점검 시작'
try {
  $osInfo = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $hostname = if ($osInfo.CSName) { $osInfo.CSName } else { $env:COMPUTERNAME }
  $osName = $osInfo.Caption
  $osVersion = $osInfo.Version
  $hostInfoStatus = 'Healthy'
} catch {
  $hostInfoStatus = 'NotCollected'
  Write-OpsBoxLog "서버 기본정보 수집 오류: $($_.Exception.Message)"
}
Write-OpsBoxLog "서버 기본정보 점검 완료: $hostInfoStatus"


Write-OpsBoxLog 'CPU 점검 시작'
try {
  $processor = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name = '_Total'" -ErrorAction Stop
  if ($null -eq $processor.PercentProcessorTime) { throw 'CPU 사용률 값을 읽을 수 없습니다.' }
  $cpu = [math]::Round([double]$processor.PercentProcessorTime, 0)
  $cpuOptions = $opsboxConfig.checks.policyItems.CPU.executor.options
  $warningPercent = if ($null -ne $cpuOptions.warningPercent) { [double]$cpuOptions.warningPercent } else { 70 }
  $criticalPercent = if ($null -ne $cpuOptions.criticalPercent) { [double]$cpuOptions.criticalPercent } else { 90 }
  $cpuStatus = if ($cpu -ge $criticalPercent) { 'Critical' } elseif ($cpu -ge $warningPercent) { 'Warning' } else { 'Healthy' }
} catch {
  $cpu = $null
  $cpuStatus = 'NotCollected'
  Write-OpsBoxLog "CPU 수집 오류: $($_.Exception.Message)"
}
Write-OpsBoxLog "CPU 점검 완료: $cpuStatus ($cpu%)"


Write-OpsBoxLog '메모리 점검 시작'
try {
  $memoryInfo = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  if ($memoryInfo.TotalVisibleMemorySize -gt 0) {
    $memory = [math]::Round((($memoryInfo.TotalVisibleMemorySize - $memoryInfo.FreePhysicalMemory) / $memoryInfo.TotalVisibleMemorySize) * 100, 0)
    $memoryOptions = $opsboxConfig.checks.policyItems.MEMORY.executor.options
    $warningPercent = if ($null -ne $memoryOptions.warningPercent) { [double]$memoryOptions.warningPercent } else { 70 }
    $criticalPercent = if ($null -ne $memoryOptions.criticalPercent) { [double]$memoryOptions.criticalPercent } else { 90 }
    $memoryStatus = if ($memory -ge $criticalPercent) { 'Critical' } elseif ($memory -ge $warningPercent) { 'Warning' } else { 'Healthy' }
  } else { throw '총 메모리 용량이 0입니다.' }
} catch {
  $memory = $null
  $memoryStatus = 'NotCollected'
  Write-OpsBoxLog "메모리 수집 오류: $($_.Exception.Message)"
}
Write-OpsBoxLog "메모리 점검 완료: $memoryStatus ($memory%)"


Write-OpsBoxLog '가동시간 점검 시작'
try {
  $uptimeInfo = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $now = Get-Date
  $bootTime = [datetime]$uptimeInfo.LastBootUpTime
  $uptimeMinutes = [math]::Floor(($now - $bootTime).TotalMinutes)
  $years = [math]::Max(0, $now.Year - $bootTime.Year)
  while ($years -gt 0 -and $bootTime.AddYears($years) -gt $now) { $years-- }
  $cursor = $bootTime.AddYears($years)
  $months = [math]::Max(0, (($now.Year - $cursor.Year) * 12) + $now.Month - $cursor.Month)
  while ($months -gt 0 -and $cursor.AddMonths($months) -gt $now) { $months-- }
  $remaining = $now - $cursor.AddMonths($months)
  $uptimeParts = @{ years = $years; months = $months; days = $remaining.Days; hours = $remaining.Hours; minutes = $remaining.Minutes }
  $uptimeStatus = 'Healthy'
} catch {
  $uptimeMinutes = $null
  $uptimeParts = $null
  $uptimeStatus = 'NotCollected'
  Write-OpsBoxLog "가동시간 수집 오류: $($_.Exception.Message)"
}
Write-OpsBoxLog "가동시간 점검 완료: $uptimeStatus ($($uptimeParts.years)년 $($uptimeParts.months)개월 $($uptimeParts.days)일 $($uptimeParts.hours)시간 $($uptimeParts.minutes)분)"


Write-OpsBoxLog '디스크 점검 시작'
try {
  $disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' -ErrorAction Stop | ForEach-Object {
    $usage = if ($_.Size -gt 0) { [math]::Round((($_.Size - $_.FreeSpace) / $_.Size) * 100, 0) } else { 0 }
    $diskOptions = $opsboxConfig.checks.policyItems.DISK.executor.options
    $warningPercent = if ($null -ne $diskOptions.warningPercent) { [double]$diskOptions.warningPercent } else { 70 }
    $criticalPercent = if ($null -ne $diskOptions.criticalPercent) { [double]$diskOptions.criticalPercent } else { 90 }
    $status = if ($usage -ge $criticalPercent) { 'Critical' } elseif ($usage -ge $warningPercent) { 'Warning' } else { 'Healthy' }
    [ordered]@{ device = $_.DeviceID; mountPoint = $_.DeviceID; volumeName = $_.VolumeName; totalGB = [math]::Round($_.Size / 1GB, 2); usedGB = [math]::Round(($_.Size - $_.FreeSpace) / 1GB, 2); freeGB = [math]::Round($_.FreeSpace / 1GB, 2); usagePercent = $usage; status = $status }
  })
  $usageValues = @($disks | ForEach-Object { [double]$_['usagePercent'] })
  $diskStatuses = @($disks | ForEach-Object { [string]$_['status'] })
  $disk = if ($usageValues.Count) { ($usageValues | Measure-Object -Maximum).Maximum } else { $null }
  $diskStatus = if (-not $disks.Count) { 'NotCollected' } elseif ($diskStatuses -contains 'Critical') { 'Critical' } elseif ($diskStatuses -contains 'Warning') { 'Warning' } else { 'Healthy' }
} catch {
  $disks = @()
  $disk = $null
  $diskStatus = 'NotCollected'
  Write-OpsBoxLog "디스크 수집 오류: $($_.Exception.Message)"
}
Write-OpsBoxLog "디스크 점검 완료: $($disks.Count)개, 최대 사용률 $disk%, 상태=$diskStatus"


Write-OpsBoxLog "프로세스 점검 시작: $($opsboxConfig.checks.processes.Count)개 대상"
foreach ($item in $opsboxConfig.checks.processes) {
  $processName = [System.IO.Path]::GetFileNameWithoutExtension([string]$item.name)
  Write-OpsBoxLog "프로세스 확인: $processName"
  $proc = Get-Process -Name $processName -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($proc) {
    $procUptime = $null
    try { $procUptime = [math]::Floor((New-TimeSpan -Start $proc.StartTime -End (Get-Date)).TotalMinutes) } catch {}
    $processes += @{ name = $item.name; processId = $proc.Id; running = $true; cpuSeconds = $proc.CPU; memoryMB = [math]::Round($proc.WorkingSet64 / 1MB, 2); uptimeMinutes = $procUptime; status = 'Healthy' }
  } else { $processes += @{ name = $item.name; running = $false; cpuSeconds = 0; memoryMB = 0; uptimeMinutes = 0; status = 'Critical' } }
}
Write-OpsBoxLog '프로세스 점검 완료'


Write-OpsBoxLog "디렉터리 점검 시작: $($opsboxConfig.checks.directories.Count)개 대상"
foreach ($item in $opsboxConfig.checks.directories) {
  $path = $item.path
  try {
    if (-not (Test-Path -LiteralPath $path -PathType Container -ErrorAction Stop)) { throw '디렉터리가 없습니다.' }
    $files = @(Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction Stop)
    $size = ($files | Measure-Object Length -Sum).Sum
    $driveName = (Split-Path -LiteralPath $path -Qualifier).TrimEnd(':')
    $drive = Get-PSDrive -Name $driveName -ErrorAction Stop
    $total = $drive.Used + $drive.Free
    $usage = if ($total -gt 0) { [math]::Round(($drive.Used / $total) * 100, 1) } else { $null }
    $warningPercent = if ($item.warningPercent) { [double]$item.warningPercent } else { 80 }
    $criticalPercent = if ($item.criticalPercent) { [double]$item.criticalPercent } else { 90 }
    $status = if ($null -eq $usage) { 'NotCollected' } elseif ($usage -ge $criticalPercent) { 'Critical' } elseif ($usage -ge $warningPercent) { 'Warning' } else { 'Healthy' }
    $directories += @{ path = $path; exists = $true; sizeBytes = [long]$size; sizeGB = [math]::Round(($size / 1GB), 2); usedGB = [math]::Round($drive.Used / 1GB, 2); freeGB = [math]::Round($drive.Free / 1GB, 2); totalGB = [math]::Round($total / 1GB, 2); usagePercent = $usage; status = $status }
  } catch { $directories += @{ path = $path; exists = (Test-Path -LiteralPath $path -PathType Container); sizeBytes = $null; sizeGB = $null; usagePercent = $null; status = 'NotCollected'; message = $_.Exception.Message } }
  Write-OpsBoxLog "디렉터리 확인: $path (존재=$($directories[-1].exists))"
}


Write-OpsBoxLog "파일 크기 점검 시작: $($opsboxConfig.checks.fileChecks.Count)개 대상"
foreach ($item in $opsboxConfig.checks.fileChecks) {
  try {
    if (-not (Test-Path -LiteralPath $item.path -PathType Leaf -ErrorAction Stop)) { throw '파일이 없습니다.' }
    $file = Get-Item -LiteralPath $item.path -ErrorAction Stop
    $status = if ($file.Length -ge ($item.criticalSizeMB * 1MB)) { 'Critical' } elseif ($file.Length -ge ($item.warningSizeMB * 1MB)) { 'Warning' } else { 'Healthy' }
    $fileChecks += @{ path = $item.path; exists = $true; sizeBytes = $file.Length; sizeMB = [math]::Round($file.Length / 1MB, 2); status = $status }
  } catch { $fileChecks += @{ path = $item.path; exists = $false; sizeBytes = $null; sizeMB = $null; status = 'Critical'; message = $_.Exception.Message } }
  Write-OpsBoxLog "파일 확인: $($item.path) (상태=$($fileChecks[-1].status))"
}


Write-OpsBoxLog "포트 점검 시작: $($opsboxConfig.checks.ports.Count)개 대상"
foreach ($item in $opsboxConfig.checks.ports) {
  $protocol = if ($item.protocol) { $item.protocol.ToUpperInvariant() } else { 'TCP' }
  $endpoint = $null
  $netstatLines = @()
  if ($protocol -eq 'UDP') {
    try { $endpoint = Get-NetUDPEndpoint -LocalPort $item.port -ErrorAction Stop | Select-Object -First 1 } catch {
      $netstatLines = @(netstat.exe -ano -p UDP 2>$null | ForEach-Object { $columns = ([string]$_).Trim() -split '\s+'; if ($columns.Count -ge 4 -and $columns[1] -match ":$($item.port)$") { ,$columns } })
      if ($netstatLines.Count -gt 0) { $endpoint = @{ OwningProcess = [int]$netstatLines[0][-1] } }
    }
  } else {
    try { $endpoint = Get-NetTCPConnection -LocalPort $item.port -State Listen -ErrorAction Stop | Select-Object -First 1 } catch {
      $netstatLines = @(netstat.exe -ano -p TCP 2>$null | Select-String -Pattern ":$($item.port)\s+.*LISTENING")
      if ($netstatLines.Count -gt 0) { $columns = ($netstatLines[0].Line.Trim() -split '\s+'); if ($columns.Count -ge 5) { $endpoint = @{ OwningProcess = [int]$columns[-1] } } }
    }
  }
  $processName = $null
  if ($endpoint -and $endpoint.OwningProcess) { $processName = (Get-Process -Id $endpoint.OwningProcess -ErrorAction SilentlyContinue).ProcessName }
  $portChecks += @{ port = $item.port; protocol = $protocol; description = $item.description; listening = ($null -ne $endpoint); processName = $processName }
  Write-OpsBoxLog "포트 확인: $protocol/$($item.port) (수신=$($portChecks[-1].listening))"
}


Write-OpsBoxLog "HTTP 점검 시작: $($opsboxConfig.checks.httpChecks.Count)개 대상"
foreach ($item in $opsboxConfig.checks.httpChecks) {
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  $statusCode = $null
  $success = $false
  $errorMessage = $null
  try {
    $response = Invoke-WebRequest -Uri $item.url -Method Get -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $statusCode = [int]$response.StatusCode
    $success = ($statusCode -eq $item.expectedStatus)
  } catch {
    $errorMessage = $_.Exception.Message
    if ($_.Exception.Response) { try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {} }
  }
  $timer.Stop()
  $httpChecks += @{ name = $item.name; url = $item.url; expectedStatus = $item.expectedStatus; statusCode = $statusCode; responseTimeMs = $timer.ElapsedMilliseconds; success = $success; error = $errorMessage }
  Write-OpsBoxLog "HTTP 확인: $($item.name) (성공=$success, 상태=$statusCode)"
}


# 점검 만들기 · 포털 DB 포트 접속 (자동 생성, 생성기 v1) — 직접 고치면 폼 변경이 반영되지 않습니다
function OpsBoxCb1-Truncate {
  param([string]$Text, [int]$Max)
  if ($null -eq $Text) { return '' }
  if ($Text.Length -le $Max) { return $Text }
  return $Text.Substring(0, $Max)
}
# 명령 실행: 자식 PowerShell(UTF-8 출력), 시간 제한 OPSBOX_CB_TIMEOUT(기본 30초). 반환 @{ rc; full; output }, 시간 초과는 rc 124
function OpsBoxCb1-Run {
  param([string]$Command, [hashtable]$Environment)
  $cbTimeout = 30
  if ($env:OPSBOX_CB_TIMEOUT) { $cbTimeout = [int]$env:OPSBOX_CB_TIMEOUT }
  # 명령 없음은 127, 그 밖의 오류는 1, 네이티브 명령 실패는 그 종료 코드로 끝나게 감쌉니다.
  $prefix = '$ProgressPreference = ''SilentlyContinue''; [Console]::OutputEncoding = [Text.Encoding]::UTF8; $ErrorActionPreference = ''Stop''' + [Environment]::NewLine + 'try {'
  $suffix = '} catch [System.Management.Automation.CommandNotFoundException] { [Console]::Error.WriteLine($_.Exception.Message); exit 127 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }' + [Environment]::NewLine + 'if ($LASTEXITCODE) { exit $LASTEXITCODE }'
  $script = $prefix + [Environment]::NewLine + $Command + [Environment]::NewLine + $suffix
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
  # 판정은 전체 출력(최대 1048576자), 보관은 2000자
  $full = OpsBoxCb1-Truncate ($stdoutTask.Result + [Environment]::NewLine + $stderrTask.Result).Trim() 1048576
  return @{ rc = $process.ExitCode; full = $full; output = (OpsBoxCb1-Truncate $full 2000); timeout = $cbTimeout }
}
# 정책 항목의 서버별 입력 값 (없으면 빈 문자열)
function OpsBoxCb1-Input {
  param([string]$Item, [string]$Key)
  $setting = $opsboxConfig.checks.rolePolicySettings.$Item
  if ($null -eq $setting -or $null -eq $setting.inputs) { return '' }
  $value = $setting.inputs.$Key
  if ($null -eq $value) { return '' }
  return [string]$value
}
# 목록 입력: 줄바꿈 또는 ; 구분, 빈 줄 제외
function OpsBoxCb1-Lines {
  param([string]$Text)
  return @(@($Text -split "[;`r`n]+") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}
function OpsBoxCb1-Contains {
  param([string]$Text, [string]$Needle)
  return ([string]$Text).IndexOf($Needle, [StringComparison]::OrdinalIgnoreCase) -ge 0
}
function OpsBoxCb1-Worst {
  param([object[]]$Statuses)
  if ($Statuses -contains 'Critical') { return 'Critical' }
  if ($Statuses -contains 'Warning') { return 'Warning' }
  if ($Statuses -contains 'Healthy') { return 'Healthy' }
  return 'NotCollected'
}
function OpsBoxCb1-Number {
  param([string]$Text)
  $value = 0.0
  if ([double]::TryParse(([string]$Text).Trim(), [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$value)) { return $value }
  return $null
}
function OpsBoxCb1-Judge {
  param([double]$Value, [string]$Direction, [double]$Warning, [double]$Critical)
  if ($Direction -eq 'LOWER_IS_WORSE') {
    if ($Value -le $Critical) { return 'Critical' } elseif ($Value -le $Warning) { return 'Warning' } else { return 'Healthy' }
  }
  if ($Value -ge $Critical) { return 'Critical' } elseif ($Value -ge $Warning) { return 'Warning' } else { return 'Healthy' }
}
function OpsBoxCb1-Row {
  param([string]$Target, [string]$Value, [string]$Threshold, [string]$Status, [string]$Message)
  return @{ target = $Target; value = $Value; threshold = $Threshold; status = $Status; message = $Message }
}
# 명령 실행이 실패했으면(시간 초과·실행 불가·0이 아닌 종료 코드) 메시지, 아니면 $null
function OpsBoxCb1-Failure {
  param([hashtable]$Result)
  if ($Result.rc -eq 124) { return "명령 실행 시간이 $($Result.timeout)초를 초과했습니다." }
  if ($Result.rc -eq 126 -or $Result.rc -eq 127) { return "명령을 실행할 수 없습니다: $(@(([string]$Result.output) -split "`r?`n")[0])" }
  # 그 밖의 실패는 출력이 정상처럼 보여도 판정하지 않습니다(예: 오류 메시지의 줄 번호를 값으로 읽는 일 방지).
  if ($Result.rc -ne 0) { return "명령이 종료 코드 $($Result.rc)(으)로 끝나 판정하지 않았습니다: $(@(([string]$Result.output) -split "`r?`n")[0])" }
  return $null
}
function OpsBoxCb1-Item-CUSTOM_DEMO_DBPORT {
  $cbItem = ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('Q1VTVE9NX0RFTU9fREJQT1JU')))
  $cbRole = ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('QkFTSUM=')))
  $cbItemName = ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('7Y+s7YS4IERCIO2PrO2KuCDsoJHsho0=')))
  $cbThreshold = ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('7KCR7IaNIOygnO2VnCAz7LSI')))
  $cbStatus = 'NotCollected'; $cbMessage = $null; $cbRows = @(); $cbOutput = $null; $cbDetailExtra = @{}
  Write-OpsBoxLog "점검 만들기 시작: $cbItemName"
  try {
    $cbList = @(OpsBoxCb1-Lines (OpsBoxCb1-Input $cbItem ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('dGFyZ2V0cw==')))))
    if ($cbList.Count -eq 0) {
      $cbMessage = ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('7ISc67KEIOyDgeyEuOyXkOyEnCAn7KCR7IaNIOuMgOyDgSAo7Zi47Iqk7Yq4Ou2PrO2KuCwg7ZWcIOykhOyXkCDtlZjrgpgpJ+ydhCDsnoXroKXtlZjshLjsmpQu')))
    } else {
      foreach ($cbLine in $cbList) {
        $cbIndex = $cbLine.LastIndexOf(':')
        $cbHost = if ($cbIndex -gt 0) { $cbLine.Substring(0, $cbIndex).Trim('[', ']') } else { '' }
        $cbPortText = if ($cbIndex -gt 0) { $cbLine.Substring($cbIndex + 1) } else { '' }
        $cbPort = 0
        if (-not $cbHost -or -not [int]::TryParse($cbPortText, [ref]$cbPort) -or $cbPort -lt 1 -or $cbPort -gt 65535) {
          $cbRows += OpsBoxCb1-Row $cbLine '' $cbThreshold 'NotCollected' '형식이 올바르지 않습니다. (호스트:포트)'
          continue
        }
        $cbClient = New-Object System.Net.Sockets.TcpClient
        $cbConnected = $false
        try {
          $cbAsync = $cbClient.BeginConnect($cbHost, $cbPort, $null, $null)
          if ($cbAsync.AsyncWaitHandle.WaitOne(3000, $false) -and $cbClient.Connected) { $cbClient.EndConnect($cbAsync); $cbConnected = $true }
        } catch { $cbConnected = $false } finally { $cbClient.Close() }
        if ($cbConnected) { $cbRows += OpsBoxCb1-Row $cbLine '성공' $cbThreshold 'Healthy' '접속 성공' }
        else { $cbRows += OpsBoxCb1-Row $cbLine '실패' $cbThreshold ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('Q3JpdGljYWw='))) ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('7KCR7IaNIOyLpO2MqCAoM+y0iCDslYjsl5Ag7J2R64u1IOyXhuydjCk='))) }
      }
      $cbStatus = OpsBoxCb1-Worst @($cbRows | ForEach-Object { $_.status })
    }
  } catch {
    $cbStatus = 'NotCollected'
    $cbMessage = "점검 중 오류: $($_.Exception.Message)"
  }
  $cbDetail = @{ status = $cbStatus; message = $cbMessage; rows = @($cbRows) }
  if ($null -ne $cbOutput) { $cbDetail.output = $cbOutput }
  foreach ($cbKey in @($cbDetailExtra.Keys)) { $cbDetail[$cbKey] = $cbDetailExtra[$cbKey] }
  $script:rolePolicyResults += @{ role = $cbRole; item = $cbItem; status = $cbStatus; detail = $cbDetail }
  Write-OpsBoxLog "점검 만들기 완료: $cbItemName ($cbStatus)"
}
OpsBoxCb1-Item-CUSTOM_DEMO_DBPORT

Write-OpsBoxLog "WAS 점검 시작: $($opsboxConfig.server.products.WAS)"
if ($opsboxConfig.server.products.WAS -eq 'Node.js') {
  $wasChecks += @{ processId = 0; processName = 'node'; status = 'NotCollected'; message = 'Node.js 상세 런타임 수집기는 별도 설정이 필요합니다.' }
} else {
  $wasOptions = $opsboxConfig.checks.policyItems.WAS_JVM_HEAP.executor.options
  $warningPercent = if ($null -ne $wasOptions.warningPercent) { [double]$wasOptions.warningPercent } else { 70 }
  $criticalPercent = if ($null -ne $wasOptions.criticalPercent) { [double]$wasOptions.criticalPercent } else { 90 }
  $javaProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" -ErrorAction SilentlyContinue)
  $pathJstat = Get-Command jstat.exe -ErrorAction SilentlyContinue
  foreach ($javaProcess in $javaProcesses) {
    $jstatPath = $null
    if ($javaProcess.ExecutablePath) { $candidate = Join-Path (Split-Path $javaProcess.ExecutablePath -Parent) 'jstat.exe'; if (Test-Path -LiteralPath $candidate) { $jstatPath = $candidate } }
    if (-not $jstatPath -and $pathJstat) { $jstatPath = $pathJstat.Source }
    if (-not $jstatPath) { $wasChecks += @{ processId = $javaProcess.ProcessId; processName = 'java'; status = 'NotCollected'; message = 'jstat.exe를 찾을 수 없습니다.' }; continue }
    $jstatOutput = @(& $jstatPath -gc $javaProcess.ProcessId 2>$null)
    if ($jstatOutput.Count -lt 2) { $wasChecks += @{ processId = $javaProcess.ProcessId; processName = 'java'; status = 'NotCollected'; message = 'JVM attach 또는 jstat 결과 수집에 실패했습니다.' }; continue }
    $headers = @($jstatOutput[0].Trim() -split '\s+')
    $values = @($jstatOutput[-1].Trim() -split '\s+')
    $heapCapacityKB = 0.0; $heapUsedKB = 0.0
    for ($i = 0; $i -lt $headers.Count -and $i -lt $values.Count; $i++) {
      $number = 0.0
      if ([double]::TryParse($values[$i], [ref]$number)) {
        if (@('S0C', 'S1C', 'EC', 'OC', 'PC') -contains $headers[$i]) { $heapCapacityKB += $number }
        if (@('S0U', 'S1U', 'EU', 'OU', 'PU') -contains $headers[$i]) { $heapUsedKB += $number }
      }
    }
    if ($heapCapacityKB -le 0) { $wasChecks += @{ processId = $javaProcess.ProcessId; processName = 'java'; status = 'NotCollected'; message = 'JVM Heap 컬럼을 찾을 수 없습니다.' }; continue }
    $heapPercent = [math]::Round(($heapUsedKB / $heapCapacityKB) * 100, 1)
    $status = if ($heapPercent -ge $criticalPercent) { 'Critical' } elseif ($heapPercent -ge $warningPercent) { 'Warning' } else { 'Healthy' }
    $wasChecks += @{ processId = $javaProcess.ProcessId; processName = 'java'; heapUsedMB = [math]::Round($heapUsedKB / 1024, 1); heapCapacityMB = [math]::Round($heapCapacityKB / 1024, 1); heapUsagePercent = $heapPercent; status = $status }
  }
  if ($javaProcesses.Count -eq 0) { $wasChecks += @{ processId = 0; processName = 'java'; status = 'NotCollected'; message = 'Java 프로세스를 찾을 수 없습니다.' } }
}
Write-OpsBoxLog "WAS 점검 완료: $($wasChecks.Count)개 결과"
$wasPolicyStatus = if (@($wasChecks | Where-Object { $_.status -eq 'Critical' }).Count -gt 0) { 'Critical' } elseif (@($wasChecks | Where-Object { $_.status -eq 'Warning' }).Count -gt 0) { 'Warning' } elseif ($wasChecks.Count -gt 0 -and @($wasChecks | Where-Object { $_.status -ne 'NotCollected' }).Count -eq 0) { 'NotCollected' } else { 'Healthy' }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_JVM_HEAP'; status = $wasPolicyStatus; detail = @($wasChecks) }


Write-OpsBoxLog 'WAS Thread Pool 점검 시작'
$detail = @{ product = $opsboxConfig.server.products.WAS; status = 'NotCollected'; message = 'Thread Pool 사용량은 JEUS/JMX 관리 주소와 인증 설정이 필요합니다. 서버별 관리 접속 정보를 등록한 뒤 수집할 수 있습니다.' }
$wasChecks += @{ processId = 0; processName = 'WAS Thread Pool'; status = $detail.status; message = $detail.message }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_THREAD_POOL'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WAS Thread Pool 점검 완료: $($detail.status)"


Write-OpsBoxLog 'WAS 장기 수행 Thread 점검 시작'
$detail = @{ product = $opsboxConfig.server.products.WAS; status = 'NotCollected'; message = '장기 수행 Thread 판별에는 JEUS/JMX의 Thread Dump 수집과 기준 시간이 필요합니다.' }
$wasChecks += @{ processId = 0; processName = '장기 수행 Thread'; status = $detail.status; message = $detail.message }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_LONG_RUNNING_THREAD'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WAS 장기 수행 Thread 점검 완료: $($detail.status)"


Write-OpsBoxLog 'WAS DB Connection Pool 점검 시작'
$detail = @{ product = $opsboxConfig.server.products.WAS; status = 'NotCollected'; message = 'DB Connection Pool 수집에는 JEUS/JMX 관리 주소와 인증 설정이 필요합니다.' }
$wasChecks += @{ processId = 0; processName = 'DB Connection Pool'; status = $detail.status; message = $detail.message }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_DB_CONNECTION_POOL'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WAS DB Connection Pool 점검 완료: $($detail.status)"


Write-OpsBoxLog "WAS 배포·기동 점검 시작: $($opsboxConfig.server.products.WAS)"
$product = [string]$opsboxConfig.server.products.WAS
$processNames = switch -Regex ($product) {
  'Node\.js' { @('node'); break }
  default { @('java') }
}
$running = @(Get-Process -Name $processNames -ErrorAction SilentlyContinue | Select-Object ProcessName, Id, StartTime)
$status = if ($running.Count -gt 0) { 'Healthy' } else { 'Critical' }
$detail = @{ product = $product; status = $status; processCount = $running.Count; processes = @($running | ForEach-Object { @{ processName = $_.ProcessName; processId = $_.Id; startedAt = $_.StartTime } }); message = if ($running.Count -eq 0) { '제품 실행 프로세스를 찾지 못했습니다.' } else { '프로세스 기동 상태를 확인했습니다. 애플리케이션 배포 상태는 관리 콘솔에서 별도 확인해야 합니다.' } }
$wasChecks += @($running | ForEach-Object { @{ processId = $_.Id; processName = $_.ProcessName; status = $status } })
if ($running.Count -eq 0) { $wasChecks += @{ processId = 0; processName = $product; status = $status; message = $detail.message } }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_DEPLOYMENT'; status = $status; detail = $detail }
Write-OpsBoxLog "WAS 배포·기동 점검 완료: $status, 프로세스=$($running.Count)"


Write-OpsBoxLog 'WAS Heap Dump 파일 점검 시작'
$javaProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" -ErrorAction SilentlyContinue)
$configuredPaths = @()
foreach ($process in $javaProcesses) {
  if ($process.CommandLine -match '(?i)-XX:HeapDumpPath=("?)([^\s"]+)') { $configuredPaths += $Matches[2] }
}
$existing = @($configuredPaths | ForEach-Object { Get-Item -LiteralPath $_ -ErrorAction SilentlyContinue })
$detail = if ($configuredPaths.Count -eq 0) {
  @{ status = 'NotCollected'; message = 'JVM 실행 옵션에서 HeapDumpPath를 찾지 못했습니다.'; javaProcessCount = $javaProcesses.Count }
} else {
  $status = if ($existing.Count -gt 0) { 'Warning' } else { 'Healthy' }
  @{ status = $status; configuredPaths = $configuredPaths; existingFileCount = $existing.Count; files = @($existing | ForEach-Object { @{ path = $_.FullName; sizeMB = [math]::Round($_.Length / 1MB, 2); modifiedAt = $_.LastWriteTime } }) }
}
$wasChecks += @{ processId = 0; processName = 'Heap Dump'; status = $detail.status; message = $detail.message }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_HEAP_DUMP'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WAS Heap Dump 점검 완료: $($detail.status), 설정경로=$($configuredPaths.Count)"


Write-OpsBoxLog 'WAS 기동 스크립트 변경 점검 시작'
$product = [string]$opsboxConfig.server.products.WAS
$javaProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" -ErrorAction SilentlyContinue | Select-Object ProcessId, ExecutablePath, CommandLine)
$detail = @{ product = $product; status = 'NotCollected'; message = '비교할 기준 파일 또는 체크섬이 정책에 등록되지 않아 변경 여부를 판정할 수 없습니다.'; processCount = $javaProcesses.Count; processes = @($javaProcesses | ForEach-Object { @{ processId = $_.ProcessId; executablePath = $_.ExecutablePath; commandLine = $_.CommandLine } }) }
$wasChecks += @{ processId = 0; processName = '기동 스크립트'; status = $detail.status; message = $detail.message }
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_STARTUP_SCRIPT'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WAS 기동 스크립트 변경 점검 완료: $($detail.status)"


Write-OpsBoxLog 'WAS 로그 점검 시작'
$setting = $opsboxConfig.checks.rolePolicySettings.WAS_LOG
$logRoots = @($setting.logDirectories | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
$periodDays = 7
if ($setting.periodDays -and [int]::TryParse([string]$setting.periodDays, [ref]$periodDays)) { $periodDays = [math]::Max(1, [math]::Min(90, $periodDays)) }
$cutoff = (Get-Date).AddDays(-$periodDays)
$logFiles = @(); $missingRoots = @()
foreach ($root in $logRoots) {
  if (-not (Test-Path -LiteralPath $root -PathType Container)) { $missingRoots += $root; continue }
  $logFiles += @(Get-ChildItem -LiteralPath $root -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $cutoff -and (@('.log', '.txt', '.out', '.err') -contains $_.Extension -or -not $_.Extension) } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 500)
}

if ($logRoots.Count -eq 0) {
  $detail = @{ status = 'NotCollected'; message = '서버 정책에서 WAS 로그 폴더를 지정하세요.'; categories = @{}; periodDays = $periodDays }
} elseif ($logFiles.Count -eq 0) {
  $message = if ($missingRoots.Count -gt 0) { '지정된 로그 폴더 중 존재하지 않는 경로가 있습니다.' } else { "최근 $periodDays 일 내 수정된 로그 파일이 없습니다." }
  $detail = @{ status = 'NotCollected'; message = $message; checkedPaths = $logRoots; missingPaths = $missingRoots; categories = @{}; periodDays = $periodDays }
} else {
  $counts = [ordered]@{ fatal = 0; errorException = 0; warning = 0; http5xx = 0; http4xx = 0 }
  $samples = @(); $matchedLines = 0; $readErrors = @(); $scannedLines = 0
  foreach ($file in $logFiles) {
    $reader = $null; $fileStream = $null
    try {
      $fileStream = New-Object System.IO.FileStream -ArgumentList $file.FullName, ([System.IO.FileMode]::Open), ([System.IO.FileAccess]::Read), ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete)
      $reader = New-Object System.IO.StreamReader -ArgumentList $fileStream, $true
      while (($line = $reader.ReadLine()) -ne $null) {
        $scannedLines++
        $lineTime = $null
        $iso = [regex]::Match($line, '(?<!\d)(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?')
        if ($iso.Success) {
          $parsed = [datetime]::MinValue
          if ([datetime]::TryParse($iso.Groups[1].Value, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeLocal, [ref]$parsed)) { $lineTime = $parsed }
        } else {
          $apache = [regex]::Match($line, '\[(\d{2}/[A-Za-z]{3}/\d{4}:\d{2}:\d{2}:\d{2})(?: ([+-]\d{4}))?\]')
          if ($apache.Success) {
            $dateText = $apache.Groups[1].Value
            if ($apache.Groups[2].Success) { $dateText += ' ' + $apache.Groups[2].Value.Insert(3, ':') }
            $formats = if ($apache.Groups[2].Success) { @('dd/MMM/yyyy:HH:mm:ss zzz') } else { @('dd/MMM/yyyy:HH:mm:ss') }
            $parsed = [datetime]::MinValue
            if ([datetime]::TryParseExact($dateText, $formats, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeLocal, [ref]$parsed)) { $lineTime = $parsed }
          }
        }
        if ($lineTime -and $lineTime -lt $cutoff) { continue }
        $lineMatch = $false
        if ($line -match '(?i)\b(FATAL|CRITICAL|EMERGENCY)\b') { $counts.fatal++; $lineMatch = $true }
        if ($line -match '(?i)\b(ERROR|ERR|EXCEPTION|SEVERE)\b') { $counts.errorException++; $lineMatch = $true }
        if ($line -match '(?i)\b(WARN|WARNING)\b') { $counts.warning++; $lineMatch = $true }
        if ($line -match '(?<!\d)5\d\d(?!\d)') { $counts.http5xx++; $lineMatch = $true }
        if ($line -match '(?<!\d)4\d\d(?!\d)') { $counts.http4xx++; $lineMatch = $true }
        if ($lineMatch) {
          $matchedLines++
          if ($samples.Count -lt 30) { $samples += @{ path = $file.FullName; timestamp = if ($lineTime) { $lineTime.ToString('yyyy-MM-dd HH:mm:ss') } else { $null }; text = $line.Trim() } }
        }
      }
    } catch {
      $message = if ($_.Exception.Message -match '(?i)being used by another process|다른 프로세스에서 사용 중') { '다른 프로세스가 사용 중이라 읽지 못했습니다.' } else { $_.Exception.Message }
      $readErrors += @{ path = $file.FullName; message = $message }
    }
    finally { if ($reader) { $reader.Dispose() } elseif ($fileStream) { $fileStream.Dispose() } }
  }
  $status = if ($counts.fatal -gt 0 -or $counts.errorException -gt 0 -or $counts.http5xx -gt 0) { 'Critical' } elseif ($counts.warning -gt 0 -or $counts.http4xx -gt 0 -or $readErrors.Count -gt 0) { 'Warning' } elseif ($scannedLines -eq 0) { 'NotCollected' } else { 'Healthy' }
  $detail = @{ status = $status; periodDays = $periodDays; since = $cutoff.ToString('yyyy-MM-dd HH:mm:ss'); checkedPaths = $logRoots; missingPaths = $missingRoots; checkedFileCount = $logFiles.Count; scannedLineCount = $scannedLines; matchedLineCount = $matchedLines; categories = $counts; readErrorCount = $readErrors.Count; readErrors = @($readErrors | Select-Object -First 10); samples = $samples }
}
$rolePolicyResults += @{ role = 'WAS'; item = 'WAS_LOG'; status = $detail.status; detail = $detail }
Write-OpsBoxLog "WAS 로그 점검 완료: $($detail.status), 폴더=$($logRoots.Count), 파일=$($logFiles.Count), 기간=$periodDays 일"


function Get-OpsBoxCollectionStatus {
  param([object[]]$Items, [string]$Kind)
  if (-not $Items -or $Items.Count -eq 0) { return 'NotCollected' }
  if ($Kind -eq 'process' -and @($Items | Where-Object { -not $_.running }).Count -gt 0) { return 'Critical' }
  if ($Kind -eq 'directory' -and @($Items | Where-Object { -not $_.exists }).Count -gt 0) { return 'Critical' }
  if ($Kind -eq 'port' -and @($Items | Where-Object { -not $_.listening }).Count -gt 0) { return 'Critical' }
  if ($Kind -eq 'http' -and @($Items | Where-Object { -not $_.success }).Count -gt 0) { return 'Critical' }
  $states = @($Items | ForEach-Object { $_.status } | Where-Object { $_ })
  if ($states -contains 'Critical') { return 'Critical' }
  if ($states -contains 'Warning') { return 'Warning' }
  if ($states -contains 'NotCollected') { return 'NotCollected' }
  return 'Healthy'
}

$processStatus = Get-OpsBoxCollectionStatus -Items $processes -Kind 'process'
$directoryStatus = Get-OpsBoxCollectionStatus -Items $directories -Kind 'directory'
$fileStatus = Get-OpsBoxCollectionStatus -Items $fileChecks -Kind 'file'
$portStatus = Get-OpsBoxCollectionStatus -Items $portChecks -Kind 'port'
$httpStatus = Get-OpsBoxCollectionStatus -Items $httpChecks -Kind 'http'
$wasStatus = Get-OpsBoxCollectionStatus -Items $wasChecks -Kind 'was'
$webStatus = if ($webCheck) { $webCheck.status } else { 'NotCollected' }
$databaseStatus = if ($databaseChecks) { $databaseChecks.status } else { 'NotCollected' }
$rolePolicyOutput = @{}
foreach ($role in @('WEB', 'WAS', 'DB')) {
  $roleItems = @()
  $configuredPolicies = @($opsboxConfig.checks.rolePolicies.$role)
  foreach ($policy in $configuredPolicies) {
    $collected = @($rolePolicyResults | Where-Object { $_.role -eq $role -and $_.item -eq $policy.item } | Select-Object -Last 1)
    if ($collected.Count -gt 0) {
      $collected[0].name = $policy.name
      $collected[0].result = $policy.result
      $collected[0].executorType = $policy.executorType
      $roleItems += $collected[0]
    } else {
      $roleItems += @{ role = $role; item = $policy.item; name = $policy.name; result = $policy.result; executorType = $policy.executorType; status = 'NotCollected'; message = '연결된 점검 스크립트가 결과를 기록하지 않았습니다.' }
    }
  }
  $roleStatus = if ($roleItems.Count -eq 0) { 'NotCollected' } elseif (@($roleItems | Where-Object { $_.status -eq 'Critical' }).Count -gt 0) { 'Critical' } elseif (@($roleItems | Where-Object { $_.status -eq 'Warning' }).Count -gt 0) { 'Warning' } elseif (@($roleItems | Where-Object { $_.status -eq 'Healthy' }).Count -eq 0) { 'NotCollected' } else { 'Healthy' }
  if ($roleItems.Count -gt 0) { $rolePolicyOutput[$role] = @{ status = $roleStatus; items = $roleItems } }
}

$basicPolicyOutput = @()
foreach ($policy in @($opsboxConfig.checks.basicPolicyItems)) {
  $collected = @($rolePolicyResults | Where-Object { $_.role -eq 'BASIC' -and $_.item -eq $policy.item } | Select-Object -Last 1)
  if ($collected.Count -gt 0) {
    $collected[0].name = $policy.name
    $collected[0].result = $policy.result
    $collected[0].executorType = $policy.executorType
    $basicPolicyOutput += $collected[0]
  } else {
    $basicPolicyOutput += @{ role = 'BASIC'; item = $policy.item; name = $policy.name; result = $policy.result; executorType = $policy.executorType; status = 'NotCollected'; message = '연결된 점검 스크립트가 결과를 기록하지 않았습니다.' }
  }
}
$rolePolicyStatuses = @($rolePolicyOutput.Values | ForEach-Object { $_.status })
# 기본 정책 사용자 항목(점검 만들기 포함)도 종합 상태에 넣습니다.
$basicPolicyStatuses = @($basicPolicyOutput | ForEach-Object { $_.status })
$allStatuses = @($hostInfoStatus, $cpuStatus, $memoryStatus, $uptimeStatus, $diskStatus, $processStatus, $directoryStatus, $fileStatus, $portStatus, $httpStatus) + $rolePolicyStatuses + $basicPolicyStatuses
$criticalCount = @($allStatuses | Where-Object { $_ -eq 'Critical' }).Count
$warningCount = @($allStatuses | Where-Object { $_ -eq 'Warning' }).Count
$notCollectedCount = @($allStatuses | Where-Object { $_ -eq 'NotCollected' }).Count
$healthyCount = @($allStatuses | Where-Object { $_ -eq 'Healthy' }).Count
$overallStatus = if ($criticalCount -gt 0) { 'Critical' } elseif ($warningCount -gt 0) { 'Warning' } elseif ($notCollectedCount -eq $allStatuses.Count) { 'NotCollected' } else { 'Healthy' }

$result = [ordered]@{
  schemaVersion = 2
  server = [ordered]@{ id = $opsboxConfig.server.id; name = $opsboxConfig.server.name; ip = $opsboxConfig.server.ip; roles = $opsboxConfig.server.roles; products = $opsboxConfig.server.products }
  collectedAt = $checkDate
  host = [ordered]@{ hostname = $hostname; osName = $osName; osVersion = $osVersion; uptimeMinutes = $uptimeMinutes; uptime = $uptimeParts; status = $hostInfoStatus }
  resources = [ordered]@{
    cpu = @{ usagePercent = $cpu; status = $cpuStatus }
    memory = @{ usagePercent = $memory; status = $memoryStatus }
    uptime = @{ minutes = $uptimeMinutes; parts = $uptimeParts; status = $uptimeStatus }
    disk = @{ maxUsagePercent = $disk; status = $diskStatus; volumes = @($disks) }
  }
  checks = [ordered]@{
    policyDefinitions = $opsboxConfig.checks.policyItems
    processes = @{ status = $processStatus; items = @($processes) }
    directories = @{ status = $directoryStatus; items = @($directories) }
    files = @{ status = $fileStatus; items = @($fileChecks) }
    ports = @{ status = $portStatus; items = @($portChecks) }
    http = @{ status = $httpStatus; items = @($httpChecks) }
    web = @{ status = $webStatus; product = $opsboxConfig.server.products.WEB; detail = $webCheck }
    was = @{ status = $wasStatus; product = $opsboxConfig.server.products.WAS; items = @($wasChecks) }
    database = @{ status = $databaseStatus; product = $opsboxConfig.server.products.DB; detail = $databaseChecks }
    rolePolicies = $rolePolicyOutput
    policyItems = @($basicPolicyOutput)
  }
  summary = @{ status = $overallStatus; counts = @{ healthy = $healthyCount; warning = $warningCount; critical = $criticalCount; notCollected = $notCollectedCount } }
}
$jsonText = $result | ConvertTo-Json -Depth 16
$savePath = $opsboxResultPath
if (-not $opsboxResultDirectoryReady) { $savePath = Join-Path $PSScriptRoot "$($opsboxConfig.server.id)_$opsboxRunStamp.json" }
try {
  Set-Content -LiteralPath $savePath -Value $jsonText -Encoding UTF8 -ErrorAction Stop
  Write-OpsBoxLog "결과 저장 완료: $savePath"
} catch {
  Write-OpsBoxLog "결과 저장 실패: $($_.Exception.Message)"
  throw
}
Write-OpsBoxLog "점검 스크립트 정상 종료: $overallStatus"
Write-Host "Result JSON: $savePath"
