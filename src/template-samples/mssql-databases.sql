SET NOCOUNT ON;
SELECT 'SERVER|' + ISNULL(CONVERT(nvarchar(256), SERVERPROPERTY('ServerName')), N'') + '|' + ISNULL(CONVERT(nvarchar(64), SERVERPROPERTY('ProductVersion')), N'') + '|' + ISNULL(CONVERT(nvarchar(256), SERVERPROPERTY('Edition')), N'');
SELECT 'DATABASE|' + d.name + '|' + d.state_desc + '|' + d.recovery_model_desc + '|' + CONVERT(nvarchar(32), CAST(ISNULL(SUM(CASE WHEN mf.type = 0 THEN CAST(mf.size AS bigint) ELSE 0 END), 0) * 8.0 / 1024 AS decimal(18,2)))
FROM sys.databases d
LEFT JOIN sys.master_files mf ON mf.database_id = d.database_id
GROUP BY d.database_id, d.name, d.state_desc, d.recovery_model_desc;
