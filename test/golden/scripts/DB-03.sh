#!/bin/bash
# OpsBox 점검 스크립트 (Linux)
# 사용법: bash <서버ID>.sh [결과 폴더]
#   결과 폴더를 주면 그곳에 저장합니다. 없으면 공유 폴더의 results 폴더,
#   그곳에 쓸 수 없으면 이 스크립트가 있는 폴더에 저장합니다.
#   저장된 파일은 OpsBox 공유 폴더의 results 폴더에 넣거나, 서버 상세 화면의 [결과 파일 올리기]로 올리면 됩니다.
# 필요 환경: bash 4.2 이상, coreutils, procps, awk (jq·python 불필요)

# sh 등 다른 셸로 실행해도 bash로 다시 실행합니다.
if [ -z "${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi
if [ "${BASH_VERSINFO[0]}" -lt 4 ] || { [ "${BASH_VERSINFO[0]}" -eq 4 ] && [ "${BASH_VERSINFO[1]}" -lt 2 ]; }; then
  echo "bash 4.2 이상이 필요합니다. 현재: $BASH_VERSION" >&2
  exit 1
fi

export LC_ALL=C
umask 022

# ---- OpsBox 설정 (스크립트 생성 시 자동으로 채워짐) ----
OPSBOX_SERVER_ID='DB-03'
OPSBOX_SHARED_PATH='/mnt/opsbox'
OPSBOX_PRODUCT_WEB=''
OPSBOX_PRODUCT_WAS=''
OPSBOX_PRODUCT_DB='MariaDB'
OPSBOX_CPU_WARNING='70'
OPSBOX_CPU_CRITICAL='90'
OPSBOX_MEMORY_WARNING='70'
OPSBOX_MEMORY_CRITICAL='90'
OPSBOX_DISK_WARNING='70'
OPSBOX_DISK_CRITICAL='90'
OPSBOX_PROCESS_NAMES=('mariadbd')
OPSBOX_DIRECTORY_PATHS=('/var/lib/mysql')
OPSBOX_DIRECTORY_WARNING=('70')
OPSBOX_DIRECTORY_CRITICAL=('90')
OPSBOX_FILE_PATHS=()
OPSBOX_FILE_WARNING_MB=()
OPSBOX_FILE_CRITICAL_MB=()
OPSBOX_PORT_NUMBERS=('3306')
OPSBOX_PORT_PROTOCOLS=('TCP')
OPSBOX_PORT_DESCRIPTIONS=('MariaDB')
OPSBOX_HTTP_NAMES=()
OPSBOX_HTTP_URLS=()
OPSBOX_HTTP_EXPECTED=()
OPSBOX_SERVER_JSON='{"id":"DB-03","name":"통계 DB (MariaDB)","ip":"10.10.4.43","roles":["DB"],"products":{"DB":"MariaDB"}}'
OPSBOX_POLICY_DEFINITIONS_JSON='{"HOST_INFO":{"id":"HOST_INFO","name":"서버 기본정보","enabled":true,"executor":{"type":"SCRIPT","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"hostname","label":"호스트명"},{"key":"osName","label":"운영체제"},{"key":"osVersion","label":"OS 버전"},{"key":"status","label":"상태"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"CPU":{"id":"CPU","name":"CPU 사용률","enabled":true,"executor":{"type":"SCRIPT","options":{"warningPercent":70,"criticalPercent":90}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"METRIC"}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected","warningPercent":70,"criticalPercent":90}}},"MEMORY":{"id":"MEMORY","name":"메모리 사용률","enabled":true,"executor":{"type":"SCRIPT","options":{"warningPercent":70,"criticalPercent":90}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"METRIC"}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected","warningPercent":70,"criticalPercent":90}}},"UPTIME":{"id":"UPTIME","name":"가동시간","enabled":true,"executor":{"type":"SCRIPT","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"METRIC"}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"DISK":{"id":"DISK","name":"디스크 사용량","enabled":true,"executor":{"type":"FILESYSTEM_CHECK","options":{"warningPercent":70,"criticalPercent":90}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"METRIC"},{"type":"TABLE","columns":[{"key":"device","label":"드라이브"},{"key":"volumeName","label":"볼륨명"},{"key":"totalGB","label":"전체(GB)"},{"key":"usedGB","label":"사용(GB)"},{"key":"freeGB","label":"여유(GB)"},{"key":"usagePercent","label":"사용률(%)"},{"key":"status","label":"상태"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected","warningPercent":70,"criticalPercent":90}}},"PROCESS":{"id":"PROCESS","name":"프로세스","enabled":true,"executor":{"type":"FILESYSTEM_CHECK","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"name","label":"프로세스"},{"key":"processId","label":"PID"},{"key":"running","label":"실행 중"},{"key":"cpuSeconds","label":"CPU(초)"},{"key":"memoryMB","label":"메모리(MB)"},{"key":"uptimeMinutes","label":"가동(분)"},{"key":"status","label":"상태"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"DIRECTORY":{"id":"DIRECTORY","name":"디렉터리 사용량","enabled":true,"executor":{"type":"FILESYSTEM_CHECK","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"path","label":"경로"},{"key":"exists","label":"존재"},{"key":"sizeGB","label":"크기(GB)"},{"key":"usedGB","label":"사용(GB)"},{"key":"freeGB","label":"여유(GB)"},{"key":"totalGB","label":"전체(GB)"},{"key":"usagePercent","label":"사용률(%)"},{"key":"status","label":"상태"},{"key":"message","label":"메시지"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"FILE_SIZE":{"id":"FILE_SIZE","name":"파일 크기","enabled":true,"executor":{"type":"FILESYSTEM_CHECK","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"path","label":"파일 경로"},{"key":"exists","label":"존재"},{"key":"sizeMB","label":"크기(MB)"},{"key":"status","label":"상태"},{"key":"message","label":"메시지"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"PORT":{"id":"PORT","name":"포트 리스닝","enabled":true,"executor":{"type":"TCP_CHECK","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"port","label":"포트"},{"key":"protocol","label":"프로토콜"},{"key":"description","label":"설명"},{"key":"listening","label":"수신 중"},{"key":"processName","label":"프로세스"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"HTTP":{"id":"HTTP","name":"HTTP 응답","enabled":true,"executor":{"type":"HTTP_CHECK","options":{}},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"name","label":"점검명"},{"key":"url","label":"URL"},{"key":"expectedStatus","label":"기대 코드"},{"key":"statusCode","label":"응답 코드"},{"key":"responseTimeMs","label":"응답 시간(ms)"},{"key":"success","label":"성공"},{"key":"error","label":"오류"}]}],"statusField":"status","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"CUSTOM_DEMO_SWAP":{"id":"CUSTOM_DEMO_SWAP","name":"Swap 사용률","enabled":true,"executor":{"type":"CHECK_BUILDER","options":{"builder":{"version":1,"type":"COMMAND_NUMBER","presetId":"linux.swap"}},"templateId":"GEN-CUSTOM_DEMO_SWAP-LINUX"},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"target","label":"대상"},{"key":"value","label":"값"},{"key":"threshold","label":"기준"},{"key":"status","label":"상태"},{"key":"message","label":"메시지"}]},{"type":"CONSOLE"}],"statusField":"status"}},"DB_INSTANCE_STATUS":{"id":"DB_INSTANCE_STATUS","name":"DB 인스턴스·접속 상태","enabled":true,"executor":{"type":"SQL_QUERY","dbms":"MSSQL","templateId":"WINDOWS-QUERY-DB_INSTANCE_STATUS","options":{}},"inputs":[],"result":{"statusField":"__OPSBOX_STATUS","components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"__OPSBOX_STATUS","label":"상태"},{"key":"serverName","label":"서버명"},{"key":"version","label":"버전"},{"key":"edition","label":"에디션"},{"key":"databaseName","label":"데이터베이스"},{"key":"state","label":"DB 상태"},{"key":"recoveryModel","label":"복구 모델"},{"key":"dataSizeMB","label":"데이터 크기(MB)"}]}],"statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected","source":"__OPSBOX_STATUS 컬럼을 쿼리 결과 첫 번째 컬럼으로 반환합니다."}}},"DB_PROCESS_LIMIT":{"id":"DB_PROCESS_LIMIT","name":"세션·프로세스 사용률","enabled":true,"executor":{"type":"SQL_QUERY","templateId":"WINDOWS-QUERY-DB_PROCESS_LIMIT","options":{},"dbms":"MSSQL"},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"__OPSBOX_STATUS","label":"상태"},{"key":"current_user_sessions","label":"현재 세션"},{"key":"configured_max_connections","label":"최대 연결"},{"key":"usage_percent","label":"사용률(%)"}]}],"statusField":"__OPSBOX_STATUS","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"DB_TABLESPACE":{"id":"DB_TABLESPACE","name":"데이터 영역 사용률","enabled":true,"executor":{"type":"SQL_QUERY","templateId":"WINDOWS-QUERY-DB_TABLESPACE","options":{},"dbms":"MSSQL"},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"__OPSBOX_STATUS","label":"상태"},{"key":"databaseName","label":"데이터베이스"},{"key":"allocatedMB","label":"할당(MB)"},{"key":"usedMB","label":"사용(MB)"},{"key":"usagePercent","label":"사용률(%)"}]}],"statusField":"__OPSBOX_STATUS","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"DB_BACKUP":{"id":"DB_BACKUP","name":"백업 상태","enabled":true,"executor":{"type":"SQL_QUERY","templateId":"WINDOWS-QUERY-DB_BACKUP","options":{},"dbms":"MSSQL"},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"__OPSBOX_STATUS","label":"상태"},{"key":"databaseName","label":"데이터베이스"},{"key":"lastFullBackup","label":"최근 전체 백업"},{"key":"backupAgeHours","label":"경과 시간(시)"}]}],"statusField":"__OPSBOX_STATUS","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"DB_ARCHIVE_MODE":{"id":"DB_ARCHIVE_MODE","name":"아카이브 모드 상태","enabled":true,"executor":{"type":"SQL_QUERY","templateId":"WINDOWS-QUERY-DB_ARCHIVE_MODE","options":{},"dbms":"MSSQL"},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"__OPSBOX_STATUS","label":"상태"},{"key":"databaseName","label":"데이터베이스"},{"key":"recoveryModel","label":"복구 모델"},{"key":"lastLogBackupAgeHours","label":"로그 백업 경과(시)"}]}],"statusField":"__OPSBOX_STATUS","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"DB_TRANSACTION_LOG":{"id":"DB_TRANSACTION_LOG","name":"트랜잭션 로그 사용률","enabled":true,"executor":{"type":"SQL_QUERY","templateId":"WINDOWS-QUERY-DB_TRANSACTION_LOG","options":{},"dbms":"MSSQL"},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"LOG_TABLE","columns":[{"key":"__OPSBOX_STATUS","label":"상태"},{"key":"databaseName","label":"데이터베이스"},{"key":"logSizeMB","label":"로그 크기(MB)"},{"key":"usagePercent","label":"사용률(%)"}]}],"statusField":"__OPSBOX_STATUS","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}},"DB_REPLICATION":{"id":"DB_REPLICATION","name":"복제·이중화 상태","enabled":true,"executor":{"type":"SQL_QUERY","templateId":"WINDOWS-QUERY-DB_REPLICATION","options":{},"dbms":"MSSQL"},"inputs":[],"result":{"components":[{"type":"SUMMARY"},{"type":"JSON"}],"statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}}}}'
OPSBOX_WAS_HEAP_WARNING='70'
OPSBOX_WAS_HEAP_CRITICAL='90'
OPSBOX_WEB_LOG_DIRS=()
OPSBOX_WEB_LOG_DAYS='7'
OPSBOX_WAS_LOG_DIRS=()
OPSBOX_WAS_LOG_DAYS='7'
OPSBOX_ROLE_ITEM_ROLES=('DB' 'DB' 'DB' 'DB' 'DB' 'DB' 'DB')
OPSBOX_ROLE_ITEM_IDS=('DB_INSTANCE_STATUS' 'DB_PROCESS_LIMIT' 'DB_TABLESPACE' 'DB_BACKUP' 'DB_ARCHIVE_MODE' 'DB_TRANSACTION_LOG' 'DB_REPLICATION')
OPSBOX_ROLE_ITEM_META=('"name":"DB 인스턴스·접속 상태","result":{"statusField":"__OPSBOX_STATUS","components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"__OPSBOX_STATUS","label":"상태"},{"key":"serverName","label":"서버명"},{"key":"version","label":"버전"},{"key":"edition","label":"에디션"},{"key":"databaseName","label":"데이터베이스"},{"key":"state","label":"DB 상태"},{"key":"recoveryModel","label":"복구 모델"},{"key":"dataSizeMB","label":"데이터 크기(MB)"}]}],"statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected","source":"__OPSBOX_STATUS 컬럼을 쿼리 결과 첫 번째 컬럼으로 반환합니다."}},"executorType":"SQL_QUERY"' '"name":"세션·프로세스 사용률","result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"__OPSBOX_STATUS","label":"상태"},{"key":"current_user_sessions","label":"현재 세션"},{"key":"configured_max_connections","label":"최대 연결"},{"key":"usage_percent","label":"사용률(%)"}]}],"statusField":"__OPSBOX_STATUS","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}},"executorType":"SQL_QUERY"' '"name":"데이터 영역 사용률","result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"__OPSBOX_STATUS","label":"상태"},{"key":"databaseName","label":"데이터베이스"},{"key":"allocatedMB","label":"할당(MB)"},{"key":"usedMB","label":"사용(MB)"},{"key":"usagePercent","label":"사용률(%)"}]}],"statusField":"__OPSBOX_STATUS","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}},"executorType":"SQL_QUERY"' '"name":"백업 상태","result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"__OPSBOX_STATUS","label":"상태"},{"key":"databaseName","label":"데이터베이스"},{"key":"lastFullBackup","label":"최근 전체 백업"},{"key":"backupAgeHours","label":"경과 시간(시)"}]}],"statusField":"__OPSBOX_STATUS","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}},"executorType":"SQL_QUERY"' '"name":"아카이브 모드 상태","result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"__OPSBOX_STATUS","label":"상태"},{"key":"databaseName","label":"데이터베이스"},{"key":"recoveryModel","label":"복구 모델"},{"key":"lastLogBackupAgeHours","label":"로그 백업 경과(시)"}]}],"statusField":"__OPSBOX_STATUS","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}},"executorType":"SQL_QUERY"' '"name":"트랜잭션 로그 사용률","result":{"components":[{"type":"SUMMARY"},{"type":"LOG_TABLE","columns":[{"key":"__OPSBOX_STATUS","label":"상태"},{"key":"databaseName","label":"데이터베이스"},{"key":"logSizeMB","label":"로그 크기(MB)"},{"key":"usagePercent","label":"사용률(%)"}]}],"statusField":"__OPSBOX_STATUS","statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}},"executorType":"SQL_QUERY"' '"name":"복제·이중화 상태","result":{"components":[{"type":"SUMMARY"},{"type":"JSON"}],"statusRules":{"healthy":"Healthy","warning":"Warning","critical":"Critical","notCollected":"NotCollected"}},"executorType":"SQL_QUERY"')
OPSBOX_ROLE_ITEM_MESSAGES=('연결된 점검 스크립트가 결과를 기록하지 않았습니다.' '연결된 점검 스크립트가 결과를 기록하지 않았습니다.' '연결된 점검 스크립트가 결과를 기록하지 않았습니다.' '연결된 점검 스크립트가 결과를 기록하지 않았습니다.' '연결된 점검 스크립트가 결과를 기록하지 않았습니다.' '연결된 점검 스크립트가 결과를 기록하지 않았습니다.' '연결된 점검 스크립트가 결과를 기록하지 않았습니다.')
OPSBOX_DB_QUERY_ITEMS=('DB_INSTANCE_STATUS' 'DB_PROCESS_LIMIT' 'DB_TABLESPACE' 'DB_BACKUP' 'DB_ARCHIVE_MODE' 'DB_TRANSACTION_LOG' 'DB_REPLICATION')
OPSBOX_DB_QUERY_NAMES=('MariaDB 쿼리 · DB 인스턴스·접속 상태' 'MariaDB 쿼리 · 세션·프로세스 사용률' 'MariaDB 쿼리 · 데이터 영역 사용률' 'MariaDB 쿼리 · 백업 상태' 'MariaDB 쿼리 · 아카이브 모드 상태' 'MariaDB 쿼리 · 트랜잭션 로그 사용률' 'MariaDB 쿼리 · 복제·이중화 상태')
OPSBOX_DB_QUERY_SQL=('SELECT '\''Healthy'\'' AS __OPSBOX_STATUS, @@hostname AS serverName, VERSION() AS version, @@version_comment AS edition,
  s.SCHEMA_NAME AS databaseName, '\''ONLINE'\'' AS state, IF(@@log_bin = 1, '\''BINLOG ON'\'', '\''BINLOG OFF'\'') AS recoveryModel,
  ROUND(COALESCE(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) / 1048576, 2) AS dataSizeMB
FROM information_schema.SCHEMATA s
LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = s.SCHEMA_NAME
GROUP BY s.SCHEMA_NAME
ORDER BY s.SCHEMA_NAME;' 'SELECT CASE WHEN u.pct >= 90 THEN '\''Critical'\'' WHEN u.pct >= 70 THEN '\''Warning'\'' ELSE '\''Healthy'\'' END AS __OPSBOX_STATUS,
  u.sessions AS current_user_sessions, u.max_conn AS configured_max_connections, u.pct AS usage_percent
FROM (
  SELECT CAST(g.VARIABLE_VALUE AS UNSIGNED) AS sessions, @@max_connections AS max_conn,
         ROUND(100 * CAST(g.VARIABLE_VALUE AS UNSIGNED) / @@max_connections, 2) AS pct
  FROM information_schema.GLOBAL_STATUS g
  WHERE g.VARIABLE_NAME = '\''THREADS_CONNECTED'\''
) u;' '-- MariaDB(InnoDB)는 데이터베이스별 정해진 용량이 없어 사용량과 여유 공간(DATA_FREE)만 표시합니다.
SELECT '\''Healthy'\'' AS __OPSBOX_STATUS, TABLE_SCHEMA AS databaseName,
  ROUND(SUM(DATA_LENGTH + INDEX_LENGTH) / 1048576, 2) AS usedMB,
  ROUND(SUM(DATA_FREE) / 1048576, 2) AS freeMB
FROM information_schema.TABLES
WHERE TABLE_SCHEMA NOT IN ('\''information_schema'\'', '\''performance_schema'\'') AND TABLE_TYPE = '\''BASE TABLE'\''
GROUP BY TABLE_SCHEMA
ORDER BY TABLE_SCHEMA;' '-- MariaDB는 백업 기록을 DB 안에 남기지 않아 쿼리로 확인할 수 없습니다.
SELECT '\''NotCollected'\'' AS __OPSBOX_STATUS,
  '\''MariaDB는 백업 기록을 DB 안에 남기지 않습니다. 백업 도구(mariabackup, mysqldump 등)의 로그나 결과 파일로 확인하세요.'\'' AS message;' '-- 바이너리 로그(binlog) 사용 여부. 꺼져 있으면 시점 복구가 불가능해 경고로 표시합니다.
SELECT CASE WHEN @@log_bin = 1 THEN '\''Healthy'\'' ELSE '\''Warning'\'' END AS __OPSBOX_STATUS,
  IF(@@log_bin = 1, '\''ON'\'', '\''OFF'\'') AS binaryLog,
  @@binlog_format AS binlogFormat,
  (SELECT VARIABLE_VALUE FROM information_schema.GLOBAL_VARIABLES WHERE VARIABLE_NAME = '\''EXPIRE_LOGS_DAYS'\'') AS expireLogsDays,
  (SELECT VARIABLE_VALUE FROM information_schema.GLOBAL_VARIABLES WHERE VARIABLE_NAME = '\''BINLOG_EXPIRE_LOGS_SECONDS'\'') AS binlogExpireLogsSeconds;' '-- InnoDB 체크포인트 나이(아직 디스크에 반영되지 않은 redo 로그 양)를 최대치와 비교합니다.
SELECT CASE WHEN x.pct IS NULL THEN '\''NotCollected'\'' WHEN x.pct >= 90 THEN '\''Critical'\'' WHEN x.pct >= 70 THEN '\''Warning'\'' ELSE '\''Healthy'\'' END AS __OPSBOX_STATUS,
  x.age_mb AS checkpointAgeMB, x.max_mb AS checkpointMaxAgeMB, x.pct AS usagePercent
FROM (
  SELECT ROUND(a.v / 1048576, 2) AS age_mb, ROUND(m.v / 1048576, 2) AS max_mb, ROUND(100 * a.v / NULLIF(m.v, 0), 2) AS pct
  FROM (SELECT MAX(CASE WHEN VARIABLE_NAME = '\''INNODB_CHECKPOINT_AGE'\'' THEN CAST(VARIABLE_VALUE AS UNSIGNED) END) AS v FROM information_schema.GLOBAL_STATUS) a,
       (SELECT COALESCE(
          (SELECT CAST(VARIABLE_VALUE AS UNSIGNED) FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME = '\''INNODB_CHECKPOINT_MAX_AGE'\''),
          (SELECT CAST(VARIABLE_VALUE AS UNSIGNED) FROM information_schema.GLOBAL_VARIABLES WHERE VARIABLE_NAME = '\''INNODB_LOG_FILE_SIZE'\'')
            * COALESCE((SELECT CAST(VARIABLE_VALUE AS UNSIGNED) FROM information_schema.GLOBAL_VARIABLES WHERE VARIABLE_NAME = '\''INNODB_LOG_FILES_IN_GROUP'\''), 1)
        ) AS v) m
) x;' '-- 복제 스레드 실행 수(대기 서버)와 연결된 대기 서버 수(주 서버)로 판단합니다.
SELECT CASE WHEN r.running > 0 OR c.connected > 0 THEN '\''Healthy'\'' ELSE '\''NotCollected'\'' END AS __OPSBOX_STATUS,
  CASE WHEN r.running > 0 THEN '\''REPLICA'\'' WHEN c.connected > 0 THEN '\''PRIMARY'\'' ELSE '\''NONE'\'' END AS role,
  r.running AS runningReplicaThreads, c.connected AS connectedReplicas,
  CASE WHEN r.running = 0 AND c.connected = 0 THEN '\''실행 중인 복제가 없습니다. 복제를 쓰는 서버라면 SHOW SLAVE STATUS로 중지 여부를 확인하세요.'\'' END AS message
FROM (SELECT COALESCE(MAX(CASE WHEN VARIABLE_NAME = '\''SLAVES_RUNNING'\'' THEN CAST(VARIABLE_VALUE AS UNSIGNED) END), 0) AS running FROM information_schema.GLOBAL_STATUS) r,
     (SELECT COALESCE(MAX(CASE WHEN VARIABLE_NAME = '\''SLAVES_CONNECTED'\'' THEN CAST(VARIABLE_VALUE AS UNSIGNED) END), 0) AS connected FROM information_schema.GLOBAL_STATUS) c;')
OPSBOX_DB_QUERY_TARGETS=('/run/mysqld/mysqld.sock' '/run/mysqld/mysqld.sock' '/run/mysqld/mysqld.sock' '/run/mysqld/mysqld.sock' '/run/mysqld/mysqld.sock' '/run/mysqld/mysqld.sock' '/run/mysqld/mysqld.sock')
OPSBOX_DB_CUSTOM_NAMES=()
OPSBOX_DB_CUSTOM_SQL=()
OPSBOX_DB_CUSTOM_TARGETS='/run/mysqld/mysqld.sock'
OPSBOX_ROLE_POLICIES_JSON='{}'
OPSBOX_ROLE_POLICY_STATUSES=''
OPSBOX_BASIC_POLICY_ITEMS_JSON='[{"role":"BASIC","item":"CUSTOM_DEMO_SWAP","name":"Swap 사용률","result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"target","label":"대상"},{"key":"value","label":"값"},{"key":"threshold","label":"기준"},{"key":"status","label":"상태"},{"key":"message","label":"메시지"}]},{"type":"CONSOLE"}],"statusField":"status"},"executorType":"CHECK_BUILDER","status":"NotCollected","message":"연결된 점검 스크립트가 결과를 기록하지 않았습니다."}]'
OPSBOX_BASIC_ITEM_IDS=('CUSTOM_DEMO_SWAP')
OPSBOX_BASIC_ITEM_META=('"name":"Swap 사용률","result":{"components":[{"type":"SUMMARY"},{"type":"TABLE","columns":[{"key":"target","label":"대상"},{"key":"value","label":"값"},{"key":"threshold","label":"기준"},{"key":"status","label":"상태"},{"key":"message","label":"메시지"}]},{"type":"CONSOLE"}],"statusField":"status"},"executorType":"CHECK_BUILDER"')
OPSBOX_BASIC_NOT_COLLECTED_MESSAGE='연결된 점검 스크립트가 결과를 기록하지 않았습니다.'
declare -A OPSBOX_ITEM_INPUT=()
# ---- OpsBox 설정 끝 ----
# ---- 역할별 점검 결과 기록 (OpsBox가 자동으로 넣음) ----
declare -A OPSBOX_ROLE_STATUS=() OPSBOX_ROLE_DETAIL=()
opsbox_role_record() { OPSBOX_ROLE_STATUS["$1:$2"]=$3; OPSBOX_ROLE_DETAIL["$1:$2"]=${4:-null}; }
# 정책 항목의 서버별 입력 값 (없으면 빈 문자열, 목록은 줄바꿈 구분): opsbox_item_input 항목ID 키
opsbox_item_input() { printf '%s' "${OPSBOX_ITEM_INPUT["$1:$2"]-}"; }
web_status=NotCollected; web_check_json=null; was_items_json=''; was_statuses=''; database_status=NotCollected; database_check_json=null
opsbox_was_item() { [ -n "$was_items_json" ] && was_items_json+=','; was_items_json+=$1; was_statuses+=" $2"; }
# 이름이 정확히 같은 프로세스의 PID 목록 (pgrep이 없거나 못 찾으면 /proc/*/comm 에서 찾음)
opsbox_pids_by_name() {
  local found f c pid
  found=$(pgrep -x -- "$1" 2>/dev/null)
  if [ -n "$found" ]; then printf '%s\n' "$found"; return; fi
  for f in /proc/[0-9]*/comm; do
    read -r c < "$f" 2>/dev/null || continue
    [ "$c" = "$1" ] || continue
    pid=${f#/proc/}; printf '%s\n' "${pid%/comm}"
  done
}

opsbox_log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# JSON 문자열 ("..." 포함) 출력: 역슬래시·따옴표·제어문자 처리
opsbox_json_string() {
  local s
  s=$(printf '%s' "$1" | tr -d '\000-\010\013\014\016-\037')
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '"%s"' "$s"
}

# 숫자면 그대로, 아니면 null
opsbox_json_number() {
  case "$1" in
    ''|*[!0-9.-]*|*.*.*|-|.) printf 'null' ;;
    *) printf '%s' "$1" ;;
  esac
}

opsbox_json_bool() { if [ "$1" = "true" ]; then printf 'true'; else printf 'false'; fi; }

# 사용률 → 상태 (값 경고기준 위험기준)
opsbox_status_by_percent() {
  awk -v v="$1" -v w="$2" -v c="$3" 'BEGIN { if (v == "") { print "NotCollected" } else if (v + 0 >= c + 0) { print "Critical" } else if (v + 0 >= w + 0) { print "Warning" } else { print "Healthy" } }'
}

# 바이트/킬로바이트 → GB (소수 2자리)
opsbox_kb_to_gb() { awk -v n="$1" 'BEGIN { printf "%.2f", n / 1048576 }'; }
opsbox_bytes_to_gb() { awk -v n="$1" 'BEGIN { printf "%.2f", n / 1073741824 }'; }
opsbox_bytes_to_mb() { awk -v n="$1" 'BEGIN { printf "%.2f", n / 1048576 }'; }

# 결과 폴더 결정: 인자 → 공유 폴더/results → 스크립트 폴더
opsbox_run_stamp=$(date '+%Y%m%d_%H%M%S')
opsbox_script_dir=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
[ -n "$opsbox_script_dir" ] || opsbox_script_dir=$(pwd)
if [ -n "${1:-}" ]; then
  opsbox_result_dir=$1
elif [ -n "$OPSBOX_SHARED_PATH" ]; then
  opsbox_result_dir="${OPSBOX_SHARED_PATH%/}/results"
else
  opsbox_result_dir=$opsbox_script_dir
fi
opsbox_result_dir_ready=false
if mkdir -p "$opsbox_result_dir" 2>/dev/null && [ -w "$opsbox_result_dir" ]; then opsbox_result_dir_ready=true; fi
opsbox_result_name="${OPSBOX_SERVER_ID}_${opsbox_run_stamp}.json"

opsbox_log '점검 스크립트 시작'
opsbox_log "결과 폴더: $opsbox_result_dir (쓰기 가능=$opsbox_result_dir_ready)"

host_name=$(hostname 2>/dev/null || uname -n)
os_name=''
os_version=''
check_date=$(date '+%Y-%m-%d %H:%M:%S')
host_info_status=NotCollected
uptime_minutes=''
uptime_parts_json=null
uptime_status=NotCollected
cpu=''
cpu_status=NotCollected
memory=''
memory_status=NotCollected
disk=''
disk_status=NotCollected
disks_json=''
processes_json=''
process_statuses=''
directories_json=''
directory_statuses=''
files_json=''
file_statuses=''
ports_json=''
port_statuses=''
http_json=''
http_statuses=''

opsbox_log '서버 기본정보 점검 시작'
if [ -r /etc/os-release ]; then
  os_name=$(. /etc/os-release 2>/dev/null; printf '%s' "${PRETTY_NAME:-${NAME:-Linux} ${VERSION:-}}")
  os_version=$(. /etc/os-release 2>/dev/null; printf '%s' "${VERSION_ID:-}")
elif [ -r /etc/redhat-release ]; then
  os_name=$(head -n 1 /etc/redhat-release)
  os_version=$(sed -n 's/.*release \([0-9.]*\).*/\1/p' /etc/redhat-release | head -n 1)
else
  os_name=$(uname -s)
fi
kernel_version=$(uname -r 2>/dev/null)
if [ -n "$kernel_version" ]; then os_version="${os_version:+$os_version, }kernel $kernel_version"; fi
if [ -n "$os_name" ]; then host_info_status=Healthy; fi
opsbox_log "서버 기본정보 점검 완료: $host_info_status ($os_name / $os_version)"

opsbox_log 'CPU 점검 시작'
opsbox_cpu_sample() { awk '/^cpu / { idle = $5 + $6; total = 0; for (i = 2; i <= NF; i++) total += $i; print total, idle }' /proc/stat 2>/dev/null; }
cpu_before=$(opsbox_cpu_sample)
sleep 1
cpu_after=$(opsbox_cpu_sample)
if [ -n "$cpu_before" ] && [ -n "$cpu_after" ]; then
  cpu=$(awk -v b="$cpu_before" -v a="$cpu_after" 'BEGIN { split(b, x, " "); split(a, y, " "); t = y[1] - x[1]; i = y[2] - x[2]; if (t > 0) printf "%d", ((t - i) / t) * 100 + 0.5; }')
fi
if [ -n "$cpu" ]; then
  cpu_status=$(opsbox_status_by_percent "$cpu" "$OPSBOX_CPU_WARNING" "$OPSBOX_CPU_CRITICAL")
else
  cpu_status=NotCollected
  opsbox_log 'CPU 수집 오류: /proc/stat을 읽을 수 없습니다.'
fi
opsbox_log "CPU 점검 완료: $cpu_status ($cpu%)"

opsbox_log '메모리 점검 시작'
memory=$(awk '/^MemTotal:/ { t = $2 } /^MemAvailable:/ { a = $2; has = 1 } /^MemFree:/ { f = $2 } /^Buffers:/ { b = $2 } /^Cached:/ { c = $2 }
  END { if (!has) a = f + b + c; if (t > 0) printf "%d", ((t - a) / t) * 100 + 0.5 }' /proc/meminfo 2>/dev/null)
if [ -n "$memory" ]; then
  memory_status=$(opsbox_status_by_percent "$memory" "$OPSBOX_MEMORY_WARNING" "$OPSBOX_MEMORY_CRITICAL")
else
  memory_status=NotCollected
  opsbox_log '메모리 수집 오류: /proc/meminfo를 읽을 수 없습니다.'
fi
opsbox_log "메모리 점검 완료: $memory_status ($memory%)"

opsbox_log '가동시간 점검 시작'
uptime_seconds=$(awk '{ printf "%d", $1 }' /proc/uptime 2>/dev/null)
if [ -n "$uptime_seconds" ]; then
  uptime_minutes=$((uptime_seconds / 60))
  now_epoch=$(date '+%s')
  # 달력 기준으로 년·월·일·시·분 계산 (부팅 시각 → 현재)
  read -r by bm bd bh bmin <<< "$(date -d "@$((now_epoch - uptime_seconds))" '+%Y %m %d %H %M')"
  read -r ny nm nd nh nmin <<< "$(date -d "@$now_epoch" '+%Y %m %d %H %M')"
  by=$((10#$by)); bm=$((10#$bm)); bd=$((10#$bd)); bh=$((10#$bh)); bmin=$((10#$bmin))
  ny=$((10#$ny)); nm=$((10#$nm)); nd=$((10#$nd)); nh=$((10#$nh)); nmin=$((10#$nmin))
  um=$((nmin - bmin)); if [ $um -lt 0 ]; then um=$((um + 60)); nh=$((nh - 1)); fi
  uh=$((nh - bh)); if [ $uh -lt 0 ]; then uh=$((uh + 24)); nd=$((nd - 1)); fi
  ud=$((nd - bd))
  if [ $ud -lt 0 ]; then
    days_in_prev_month=$(date -d "$(printf '%04d-%02d-01' "$ny" "$nm") -1 day" '+%d')
    ud=$((ud + 10#$days_in_prev_month)); nm=$((nm - 1))
  fi
  umo=$((nm - bm)); if [ $umo -lt 0 ]; then umo=$((umo + 12)); ny=$((ny - 1)); fi
  uy=$((ny - by))
  uptime_parts_json="{\"years\":$uy,\"months\":$umo,\"days\":$ud,\"hours\":$uh,\"minutes\":$um}"
  uptime_status=Healthy
  opsbox_log "가동시간 점검 완료: $uptime_status (${uy}년 ${umo}개월 ${ud}일 ${uh}시간 ${um}분)"
else
  uptime_status=NotCollected
  opsbox_log '가동시간 수집 오류: /proc/uptime을 읽을 수 없습니다.'
fi

opsbox_log '디스크 점검 시작'
disk_index=0
disk_has_warning=false
disk_has_critical=false
while IFS='|' read -r d_device d_total d_used d_avail d_usage d_mount; do
  case "$d_usage" in ''|*[!0-9]*) continue ;; esac
  d_status=$(opsbox_status_by_percent "$d_usage" "$OPSBOX_DISK_WARNING" "$OPSBOX_DISK_CRITICAL")
  [ "$d_status" = Critical ] && disk_has_critical=true
  [ "$d_status" = Warning ] && disk_has_warning=true
  [ $disk_index -gt 0 ] && disks_json+=','
  disks_json+="{\"device\":$(opsbox_json_string "$d_device"),\"mountPoint\":$(opsbox_json_string "$d_mount"),\"volumeName\":$(opsbox_json_string "$d_mount"),\"totalGB\":$(opsbox_kb_to_gb "$d_total"),\"usedGB\":$(opsbox_kb_to_gb "$d_used"),\"freeGB\":$(opsbox_kb_to_gb "$d_avail"),\"usagePercent\":$d_usage,\"status\":\"$d_status\"}"
  if [ -z "$disk" ] || [ "$d_usage" -gt "$disk" ]; then disk=$d_usage; fi
  disk_index=$((disk_index + 1))
done < <(df -P -k -l -x tmpfs -x devtmpfs -x squashfs -x overlay -x iso9660 2>/dev/null | awk 'NR > 1 { mount = $6; for (i = 7; i <= NF; i++) mount = mount " " $i; sub(/%$/, "", $5); print $1 "|" $2 "|" $3 "|" $4 "|" $5 "|" mount }')
if [ $disk_index -eq 0 ]; then disk_status=NotCollected
elif [ "$disk_has_critical" = true ]; then disk_status=Critical
elif [ "$disk_has_warning" = true ]; then disk_status=Warning
else disk_status=Healthy; fi
opsbox_log "디스크 점검 완료: ${disk_index}개, 최대 사용률 ${disk}%, 상태=$disk_status"

opsbox_log "프로세스 점검 시작: ${#OPSBOX_PROCESS_NAMES[@]}개 대상"
for p_index in "${!OPSBOX_PROCESS_NAMES[@]}"; do
  p_name=${OPSBOX_PROCESS_NAMES[$p_index]}
  # 프로세스 이름(comm)은 커널에서 15자까지만 보관되므로 앞 15자로도 찾아봅니다.
  p_pid=$(pgrep -o -x -- "$p_name" 2>/dev/null || pgrep -o -x -- "${p_name:0:15}" 2>/dev/null)
  [ -n "$processes_json" ] && processes_json+=','
  if [ -n "$p_pid" ]; then
    read -r p_rss p_etimes p_time <<< "$(ps -o rss=,etimes=,time= -p "$p_pid" 2>/dev/null)"
    p_cpu_seconds=$(awk -v t="$p_time" 'BEGIN { n = split(t, d, "-"); hms = d[n]; days = (n > 1) ? d[1] : 0; m = split(hms, x, ":"); s = 0; for (i = 1; i <= m; i++) s = s * 60 + x[i]; print days * 86400 + s }')
    processes_json+="{\"name\":$(opsbox_json_string "$p_name"),\"processId\":$p_pid,\"running\":true,\"cpuSeconds\":$(opsbox_json_number "$p_cpu_seconds"),\"memoryMB\":$(opsbox_json_number "$(awk -v n="$p_rss" 'BEGIN { printf "%.2f", n / 1024 }')"),\"uptimeMinutes\":$(opsbox_json_number "$(( ${p_etimes:-0} / 60 ))"),\"status\":\"Healthy\"}"
    process_statuses+=' Healthy'
  else
    processes_json+="{\"name\":$(opsbox_json_string "$p_name"),\"running\":false,\"cpuSeconds\":0,\"memoryMB\":0,\"uptimeMinutes\":0,\"status\":\"Critical\"}"
    process_statuses+=' Critical'
  fi
  opsbox_log "프로세스 확인: $p_name (PID=${p_pid:-없음})"
done
opsbox_log '프로세스 점검 완료'

opsbox_log "디렉터리 점검 시작: ${#OPSBOX_DIRECTORY_PATHS[@]}개 대상"
for d_index in "${!OPSBOX_DIRECTORY_PATHS[@]}"; do
  d_path=${OPSBOX_DIRECTORY_PATHS[$d_index]}
  d_warning=${OPSBOX_DIRECTORY_WARNING[$d_index]:-80}
  d_critical=${OPSBOX_DIRECTORY_CRITICAL[$d_index]:-90}
  [ -n "$directories_json" ] && directories_json+=','
  if [ -d "$d_path" ]; then
    d_size=$(du -sb -- "$d_path" 2>/dev/null | awk '{ print $1 + 0 }')
    read -r d_total d_used d_free <<< "$(df -P -k -- "$d_path" 2>/dev/null | awk 'NR == 2 { print $2, $3, $4 }')"
    d_usage=$(awk -v u="${d_used:-0}" -v f="${d_free:-0}" 'BEGIN { if (u + f > 0) printf "%.1f", u / (u + f) * 100 }')
    d_status=$(opsbox_status_by_percent "$d_usage" "$d_warning" "$d_critical")
    directories_json+="{\"path\":$(opsbox_json_string "$d_path"),\"exists\":true,\"sizeBytes\":$(opsbox_json_number "$d_size"),\"sizeGB\":$(opsbox_bytes_to_gb "${d_size:-0}"),\"usedGB\":$(opsbox_kb_to_gb "${d_used:-0}"),\"freeGB\":$(opsbox_kb_to_gb "${d_free:-0}"),\"totalGB\":$(opsbox_kb_to_gb "${d_total:-0}"),\"usagePercent\":$(opsbox_json_number "$d_usage"),\"status\":\"$d_status\"}"
    directory_statuses+=" $d_status"
    opsbox_log "디렉터리 확인: $d_path (존재=true, 사용률=${d_usage}%)"
  else
    directories_json+="{\"path\":$(opsbox_json_string "$d_path"),\"exists\":false,\"sizeBytes\":null,\"sizeGB\":null,\"usagePercent\":null,\"status\":\"NotCollected\",\"message\":\"디렉터리가 없습니다.\"}"
    directory_statuses+=' Missing'
    opsbox_log "디렉터리 확인: $d_path (존재=false)"
  fi
done

opsbox_log "파일 크기 점검 시작: ${#OPSBOX_FILE_PATHS[@]}개 대상"
for f_index in "${!OPSBOX_FILE_PATHS[@]}"; do
  f_path=${OPSBOX_FILE_PATHS[$f_index]}
  f_warning=${OPSBOX_FILE_WARNING_MB[$f_index]}
  f_critical=${OPSBOX_FILE_CRITICAL_MB[$f_index]}
  [ -n "$files_json" ] && files_json+=','
  if [ -f "$f_path" ]; then
    f_bytes=$(stat -c %s -- "$f_path" 2>/dev/null || wc -c < "$f_path")
    f_status=$(awk -v n="$f_bytes" -v w="$f_warning" -v c="$f_critical" 'BEGIN { if (n >= c * 1048576) print "Critical"; else if (n >= w * 1048576) print "Warning"; else print "Healthy" }')
    files_json+="{\"path\":$(opsbox_json_string "$f_path"),\"exists\":true,\"sizeBytes\":$(opsbox_json_number "$f_bytes"),\"sizeMB\":$(opsbox_bytes_to_mb "$f_bytes"),\"status\":\"$f_status\"}"
  else
    f_status=Critical
    files_json+="{\"path\":$(opsbox_json_string "$f_path"),\"exists\":false,\"sizeBytes\":null,\"sizeMB\":null,\"status\":\"Critical\",\"message\":\"파일이 없습니다.\"}"
  fi
  file_statuses+=" $f_status"
  opsbox_log "파일 확인: $f_path (상태=$f_status)"
done

opsbox_log "포트 점검 시작: ${#OPSBOX_PORT_NUMBERS[@]}개 대상"
# /proc/net 에서 LISTEN(TCP) 또는 바인딩(UDP) 상태를 확인합니다. (ss·netstat 없이도 동작)
opsbox_port_listening() {
  local hex_port files file
  printf -v hex_port '%04X' "$1"
  if [ "$2" = UDP ]; then files='/proc/net/udp /proc/net/udp6'; else files='/proc/net/tcp /proc/net/tcp6'; fi
  for file in $files; do
    [ -r "$file" ] || continue
    if awk -v p="$hex_port" -v proto="$2" 'NR > 1 { n = split($2, a, ":"); if (toupper(a[n]) == p && (proto == "UDP" || $4 == "0A")) found = 1 } END { exit !found }' "$file"; then return 0; fi
  done
  return 1
}
for port_index in "${!OPSBOX_PORT_NUMBERS[@]}"; do
  port_number=${OPSBOX_PORT_NUMBERS[$port_index]}
  port_protocol=${OPSBOX_PORT_PROTOCOLS[$port_index]:-TCP}
  port_description=${OPSBOX_PORT_DESCRIPTIONS[$port_index]}
  port_process=''
  if opsbox_port_listening "$port_number" "$port_protocol"; then
    port_listening=true
    port_statuses+=' Healthy'
    # 프로세스 이름은 ss가 있고 권한이 있을 때만 확인됩니다.
    if command -v ss >/dev/null 2>&1; then
      if [ "$port_protocol" = UDP ]; then ss_flags=-lnup; else ss_flags=-lntp; fi
      port_process=$(ss $ss_flags 2>/dev/null | awk -v p=":$port_number" '$0 ~ p"[ \t]" && match($0, /users:\(\("[^"]+"/) { s = substr($0, RSTART + 9, RLENGTH - 10); print s; exit }')
    fi
  else
    port_listening=false
    port_statuses+=' Critical'
  fi
  [ -n "$ports_json" ] && ports_json+=','
  if [ -n "$port_process" ]; then port_process_json=$(opsbox_json_string "$port_process"); else port_process_json=null; fi
  ports_json+="{\"port\":$port_number,\"protocol\":\"$port_protocol\",\"description\":$(opsbox_json_string "$port_description"),\"listening\":$port_listening,\"processName\":$port_process_json}"
  opsbox_log "포트 확인: $port_protocol/$port_number (수신=$port_listening)"
done

opsbox_log "HTTP 점검 시작: ${#OPSBOX_HTTP_URLS[@]}개 대상"
for h_index in "${!OPSBOX_HTTP_URLS[@]}"; do
  h_name=${OPSBOX_HTTP_NAMES[$h_index]}
  h_url=${OPSBOX_HTTP_URLS[$h_index]}
  h_expected=${OPSBOX_HTTP_EXPECTED[$h_index]:-200}
  h_code=''
  h_ms=''
  h_error=''
  if command -v curl >/dev/null 2>&1; then
    h_output=$(curl -s -o /dev/null --max-time 10 -w '%{http_code} %{time_total}' -- "$h_url" 2>&1)
    h_exit=$?
    read -r h_code h_time <<< "$h_output"
    h_ms=$(awk -v t="$h_time" 'BEGIN { printf "%d", t * 1000 }')
    if [ "$h_code" = 000 ]; then h_code=''; h_error="연결 실패 (curl 종료 코드 $h_exit)"; fi
  else
    h_error='curl 명령이 없어 HTTP 점검을 할 수 없습니다.'
  fi
  if [ -n "$h_code" ] && [ "$h_code" = "$h_expected" ]; then h_success=true; http_statuses+=' Healthy'; else h_success=false; http_statuses+=' Critical'; fi
  [ -n "$http_json" ] && http_json+=','
  if [ -n "$h_error" ]; then h_error_json=$(opsbox_json_string "$h_error"); else h_error_json=null; fi
  http_json+="{\"name\":$(opsbox_json_string "$h_name"),\"url\":$(opsbox_json_string "$h_url"),\"expectedStatus\":$(opsbox_json_number "$h_expected"),\"statusCode\":$(opsbox_json_number "$h_code"),\"responseTimeMs\":$(opsbox_json_number "$h_ms"),\"success\":$h_success,\"error\":$h_error_json}"
  opsbox_log "HTTP 확인: $h_name (성공=$h_success, 상태=${h_code:-없음})"
done

# 점검 만들기 · Swap 사용률 (자동 생성, 생성기 v1) — 직접 고치면 폼 변경이 반영되지 않습니다
# 출력 자르기: 최대 바이트 수로 자르고 끝에서 잘린 UTF-8 글자를 버림
opsbox_cb1_truncate() {
  local s=$1 max=$2 b
  if [ "${#s}" -le "$max" ]; then printf '%s' "$s"; return; fi
  s=${s:0:$max}
  while [ -n "$s" ]; do
    printf -v b '%d' "'${s: -1}"; [ "$b" -lt 0 ] && b=$((b + 256))
    if [ "$b" -ge 192 ]; then s=${s:0:${#s}-1}; break
    elif [ "$b" -ge 128 ]; then s=${s:0:${#s}-1}
    else break; fi
  done
  printf '%s' "$s"
}
# 명령 실행: cb_full(판정용 전체 출력, 최대 1048576바이트), cb_out(보관용 2000바이트), cb_rc(종료 코드)
# 시간 제한 OPSBOX_CB_TIMEOUT(기본 30초). 출력이 상한을 넘어 끊긴 경우(141)는 정상 종료로 봅니다.
opsbox_cb1_run() {
  local t=${OPSBOX_CB_TIMEOUT:-30}
  if command -v timeout >/dev/null 2>&1; then cb_full=$(timeout "$t" bash -c "$1" 2>&1 </dev/null | head -c 1048576; exit "${PIPESTATUS[0]}"); cb_rc=$?
  else cb_full=$(bash -c "$1" 2>&1 </dev/null | head -c 1048576; exit "${PIPESTATUS[0]}"); cb_rc=$?; fi
  [ "$cb_rc" = 141 ] && cb_rc=0
  cb_out=$(opsbox_cb1_truncate "$cb_full" 2000)
}
# 실패(시간 초과 124, 실행 불가 126·127, 그 밖의 0이 아닌 종료 코드)면 cb_message를 채우고 참
opsbox_cb1_failed() {
  case "$cb_rc" in
    124) cb_message="명령 실행 시간이 ${OPSBOX_CB_TIMEOUT:-30}초를 초과했습니다."; return 0 ;;
    126|127) cb_message="명령을 실행할 수 없습니다: $(printf '%s\n' "$cb_out" | head -n 1)"; return 0 ;;
    0) return 1 ;;
  esac
  # 그 밖의 실패는 출력이 정상처럼 보여도 판정하지 않습니다(예: 서비스가 멈춰 명령이 실패).
  cb_message="명령이 종료 코드 $cb_rc(으)로 끝나 판정하지 않았습니다: $(printf '%s\n' "$cb_out" | head -n 1)"
  return 0
}
# 결과 표 한 줄: 대상 값 기준 상태 메시지
opsbox_cb1_row() {
  [ -n "$cb_rows" ] && cb_rows+=','
  cb_rows+="{\"target\":$(opsbox_json_string "$1"),\"value\":$(opsbox_json_string "$2"),\"threshold\":$(opsbox_json_string "$3"),\"status\":\"$4\",\"message\":$(opsbox_json_string "$5")}"
  cb_statuses+=" $4"
}
# 상태 종합: 위험 > 주의 > 정상, 모두 미수집(또는 없음)이면 미수집
opsbox_cb1_worst() {
  case " $* " in *' Critical '*) echo Critical ;; *' Warning '*) echo Warning ;; *' Healthy '*) echo Healthy ;; *) echo NotCollected ;; esac
}
# 대소문자 무시 단순 포함
opsbox_cb1_contains() { printf '%s\n' "$1" | grep -qiF -- "$2"; }
# 숫자 판정: 값 방향 주의 위험
opsbox_cb1_judge() {
  awk -v v="$1" -v d="$2" -v w="$3" -v c="$4" 'BEGIN {
    if (d == "LOWER_IS_WORSE") { s = (v + 0 <= c + 0) ? "Critical" : (v + 0 <= w + 0) ? "Warning" : "Healthy" }
    else { s = (v + 0 >= c + 0) ? "Critical" : (v + 0 >= w + 0) ? "Warning" : "Healthy" }
    print s }'
}
# 줄바꿈 목록에서 빈 줄 빼고 앞뒤 공백 정리
opsbox_cb1_lines() { printf '%s\n' "$1" | awk '{ sub(/^[ \t\r]+/, ""); sub(/[ \t\r]+$/, ""); if ($0 != "") print }'; }
# TCP 접속: 호스트 포트 제한초
opsbox_cb1_connect() {
  if command -v timeout >/dev/null 2>&1; then timeout "$3" bash -c 'exec 3<>"/dev/tcp/$1/$2"' _ "$1" "$2" 2>/dev/null
  else bash -c 'exec 3<>"/dev/tcp/$1/$2"' _ "$1" "$2" 2>/dev/null; fi
}
# 결과 기록: 역할 항목 상태 메시지 추가JSON
opsbox_cb1_finish() {
  local message=null
  [ -n "$4" ] && message=$(opsbox_json_string "$4")
  opsbox_role_record "$1" "$2" "$3" "{\"status\":\"$3\",\"message\":$message,\"rows\":[$cb_rows]$5}"
}
opsbox_cb1_item_CUSTOM_DEMO_SWAP() {
  local cb_item='CUSTOM_DEMO_SWAP' cb_role='BASIC' cb_name='Swap 사용률' cb_threshold='주의 ≥ 50% / 위험 ≥ 80%'
  local cb_rows='' cb_statuses='' cb_out='' cb_full='' cb_rc=0 cb_status=NotCollected cb_message='' cb_extra=''
  opsbox_log "점검 만들기 시작: $cb_name"
  local cb_command='free | awk '\''/^Swap:/ { if ($2 > 0) printf "%.1f\n", $3 * 100 / $2; else print 0 }'\''' cb_direction='HIGHER_IS_WORSE' cb_warning='50' cb_critical='80' cb_value=''
  opsbox_cb1_run "$cb_command"
  if ! opsbox_cb1_failed; then
    cb_value=$(printf '%s\n' "$cb_full" | grep -oE -- '-?[0-9]+(\.[0-9]+)?' | head -n 1)
    if [ -z "$cb_value" ]; then cb_message='명령 출력에서 숫자를 찾지 못했습니다.'
    else cb_status=$(opsbox_cb1_judge "$cb_value" "$cb_direction" "$cb_warning" "$cb_critical"); fi
  fi
  opsbox_cb1_row '이 서버' "$cb_value" "$cb_threshold" "$cb_status" "$cb_message"
  cb_extra=",\"output\":$(opsbox_json_string "$cb_out")"
  opsbox_cb1_finish "$cb_role" "$cb_item" "$cb_status" "$cb_message" "$cb_extra"
  opsbox_log "점검 만들기 완료: $cb_name ($cb_status)"
}
opsbox_cb1_item_CUSTOM_DEMO_SWAP

opsbox_log "DB 공통 쿼리 실행기 시작: ${OPSBOX_PRODUCT_DB:-제품 미지정}"
# 정책 항목마다 선택된 쿼리를 대상(인스턴스)별로 실행해 결과 표(columns/rows)를 남깁니다.
#   PostgreSQL: psql   대상 = 비움(이 서버, 로컬 소켓) | 호스트[:포트][/DB이름]
#   MariaDB:    mariadb(mysql)  대상 = 비움(로컬 소켓) | /소켓경로 | 호스트[:포트]
#   MSSQL:      sqlcmd 대상 = 비움(localhost) | 호스트,포트 | 호스트\인스턴스
#   CUBRID:     csql   대상 = DB이름[@호스트] (필수)
# 상태 판정: 결과 첫 열이 __OPSBOX_STATUS면 그 값을 쓰고, SHOW 문처럼 상태 열을 만들 수 없으면
# 쿼리에 규칙 주석을 적습니다. 행마다 맞는 규칙 중 가장 높은 상태(Critical > Warning > NotCollected)를 쓰고,
# 맞는 규칙이 없으면 Healthy입니다. 열 이름은 대소문자를 가리지 않습니다.
#   -- @opsbox-status <Critical|Warning|NotCollected> <열 | 열A/열B%> <= | >= | < | > | = | != | ~(포함) | in(쉼표 목록)> <값>
#   예) -- @opsbox-status Warning Num_free_sectors/Num_total_sectors% <= 15
# 접속 계정·비밀번호는 OpsBox에 저장하지 않습니다. 실행 계정의 클라이언트 설정(~/.pgpass, ~/.my.cnf)이나
# 환경 변수(PGUSER·PGPASSWORD, SQLCMDUSER·SQLCMDPASSWORD, OPSBOX_DB_USER, OPSBOX_CUBRID_USER·OPSBOX_CUBRID_PASSWORD)를 씁니다.
db_product=$OPSBOX_PRODUCT_DB
db_err_file=$(mktemp 2>/dev/null || printf '%s' "/tmp/opsbox-db-$$.err")

# 클라이언트 찾기 (없으면 빈 문자열)
db_client=''
case "$db_product" in
  PostgreSQL) db_client=$(command -v psql 2>/dev/null) ;;
  MariaDB) db_client=$(command -v mariadb 2>/dev/null || command -v mysql 2>/dev/null) ;;
  MSSQL)
    db_client=$(command -v sqlcmd 2>/dev/null)
    for db_candidate in /opt/mssql-tools18/bin/sqlcmd /opt/mssql-tools/bin/sqlcmd; do
      [ -z "$db_client" ] && [ -x "$db_candidate" ] && db_client=$db_candidate
    done ;;
  CUBRID) db_client=$(command -v csql 2>/dev/null) ;;
esac
db_timeout=''
command -v timeout >/dev/null 2>&1 && db_timeout='timeout 60'

# 쿼리 1건 실행: opsbox_db_exec SQL 대상 → db_rc, db_out(머리글 + 탭 구분 행), db_err
opsbox_db_exec() {
  local sql=$1 target=$2 host='' port='' name='' run_as=()
  db_out=''; db_err=''; db_rc=0
  : > "$db_err_file" 2>/dev/null
  case "$db_product" in
    PostgreSQL)
      name=${target#*/}; [ "$name" = "$target" ] && name=''
      host=${target%%/*}; port=''
      case "$host" in *:*) port=${host##*:}; host=${host%:*} ;; esac
      local args=(-X -q -A -F $'\t' -P footer=off -v ON_ERROR_STOP=1 -d "${name:-${PGDATABASE:-postgres}}")
      [ -n "$host" ] && args+=(-h "$host")
      [ -n "$port" ] && args+=(-p "$port")
      # root로 실행하고 계정 지정이 없으면 로컬 postgres 계정(peer 인증)으로 실행
      if [ -z "$host" ] && [ -z "${PGUSER:-}" ] && [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then
        if command -v runuser >/dev/null 2>&1; then run_as=(runuser -u postgres --); elif command -v sudo >/dev/null 2>&1; then run_as=(sudo -n -u postgres); fi
      fi
      db_out=$(cd / && $db_timeout "${run_as[@]}" "$db_client" "${args[@]}" -c "$sql" 2>"$db_err_file"); db_rc=$? ;;
    MariaDB)
      local args=(--batch --connect-timeout=10 --default-character-set=utf8mb4)
      [ -n "${OPSBOX_DB_USER:-}" ] && args+=(-u "$OPSBOX_DB_USER")
      case "$target" in
        '') ;;
        /*) args+=(--socket="$target") ;;
        *) host=$target; case "$host" in *:*) port=${host##*:}; host=${host%:*} ;; esac
           args+=(-h "$host" --protocol=TCP); [ -n "$port" ] && args+=(-P "$port") ;;
      esac
      db_out=$($db_timeout "$db_client" "${args[@]}" -e "$sql" 2>"$db_err_file"); db_rc=$? ;;
    MSSQL)
      local args=(-S "${target:-localhost}" -d master -l 10 -t 30 -W -s $'\t' -w 65535 -b)
      [ -z "${SQLCMDUSER:-}" ] && args+=(-E)
      # 예: OPSBOX_SQLCMD_OPTIONS='-C' (자체 서명 인증서 허용, mssql-tools18)
      read -r -a db_extra <<< "${OPSBOX_SQLCMD_OPTIONS:-}"
      db_out=$($db_timeout "$db_client" "${args[@]}" "${db_extra[@]}" -Q "$sql" 2>"$db_err_file"); db_rc=$?
      # 머리글 아래 구분선(-----)과 빈 줄 제거
      db_out=$(printf '%s\n' "$db_out" | grep -v -E '^[-[:space:]]*$') ;;
    CUBRID)
      local args=(-u "${OPSBOX_CUBRID_USER:-dba}" --plain-output -c "$sql")
      [ -n "${OPSBOX_CUBRID_PASSWORD:-}" ] && args+=(-p "$OPSBOX_CUBRID_PASSWORD")
      db_out=$($db_timeout "$db_client" "${args[@]}" "$target" 2>"$db_err_file"); db_rc=$? ;;
  esac
  db_err=$(cat "$db_err_file" 2>/dev/null)
  if [ "$db_rc" != 0 ] && [ -z "$db_err" ]; then db_err=$db_out; fi
  [ "$db_rc" = 124 ] && db_err="쿼리 실행 시간이 60초를 초과했습니다. $db_err"
  return 0
}

# 탭 구분 결과 → 1줄: 행 수, 2줄: columns JSON, 3줄: rows JSON, 4줄: 행별 상태 값들, 5줄: 인스턴스 정보, 6줄: DB 목록 JSON
# opsbox_db_tsv_to_json 대상 [상태 규칙(줄바꿈 구분)]
opsbox_db_tsv_to_json() {
  awk -F '\t' -v target="$1" -v rules="${2:-}" '
    function esc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); gsub(ctrl, " ", s); return s }
    function q(s) { return "\"" esc(s) "\"" }
    function num(s) { return (s ~ /^-?[0-9]+(\.[0-9]+)?$/) ? s : "0" }
    function unq(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); if (length(s) >= 2 && substr(s, 1, 1) == sq && substr(s, length(s), 1) == sq) s = substr(s, 2, length(s) - 2); return s }
    function col(n) { n = tolower(n); return (n in lidx) ? unq($lidx[n]) : "" }
    function isnum(s) { return s ~ /^-?[0-9]+(\.[0-9]+)?$/ }
    function rank(l) { return l == "Critical" ? 3 : l == "Warning" ? 2 : l == "NotCollected" ? 1 : 0 }
    function matches(k,    v, a, b, op, want, list, n, i) {
      if (rop[k] ~ /%$/) {
        split(substr(rop[k], 1, length(rop[k]) - 1), ab, "/"); a = col(ab[1]); b = col(ab[2])
        if (!isnum(a) || !isnum(b) || b + 0 == 0) return 0
        v = 100 * a / b
      } else v = col(rop[k])
      op = rcmp[k]; want = rval[k]
      if (op == ">=" || op == "<=" || op == ">" || op == "<") {
        if (!isnum(v "") || !isnum(want)) return 0
        return op == ">=" ? v + 0 >= want + 0 : op == "<=" ? v + 0 <= want + 0 : op == ">" ? v + 0 > want + 0 : v + 0 < want + 0
      }
      if (op == "=") return tolower(v) == tolower(want)
      if (op == "!=") return tolower(v) != tolower(want)
      if (op == "~") return index(tolower(v), tolower(want)) > 0
      if (op == "in") { n = split(want, list, ","); for (i = 1; i <= n; i++) if (tolower(v) == tolower(unq(list[i]))) return 1; return 0 }
      return 0
    }
    BEGIN {
      c = ""; for (i = 1; i < 32; i++) if (i != 9) c = c sprintf("%c", i); ctrl = "[" c "]"; rows = 0; sq = sprintf("%c", 39)
      nr = 0; m = split(rules, lines, "\n")
      for (i = 1; i <= m; i++) {
        n = split(lines[i], p, /[ \t]+/); if (n < 4 || rank(p[1]) == 0) continue
        nr++; rlevel[nr] = p[1]; rop[nr] = p[2]; rcmp[nr] = p[3]; rval[nr] = p[4]
        for (j = 5; j <= n; j++) rval[nr] = rval[nr] " " p[j]
      }
    }
    { sub(/\r$/, "") }
    NR == 1 { ncol = NF; cols = ""; for (i = 1; i <= NF; i++) { name[i] = $i; idx[$i] = i; lidx[tolower($i)] = i; cols = cols (i > 1 ? "," : "") q($i) }; next }
    NF != ncol { next }
    rows >= 1000 { next }
    {
      rows++; r = ""
      for (i = 1; i <= NF; i++) { v = $i; if (length(v) > 2000) v = substr(v, 1, 2000) "…"; r = r (i > 1 ? "," : "") q(v); cell[rows, i] = $i }
      rowsj = rowsj (rows > 1 ? "," : "") "[" r "]"
      if (name[1] == "__OPSBOX_STATUS") states = states " " $1
      if (nr) { best = "Healthy"; for (k = 1; k <= nr; k++) if (matches(k) && rank(rlevel[k]) > rank(best)) best = rlevel[k]; states = states " " best }
    }
    END {
      print rows + 0; print "[" cols "]"; print "[" rowsj "]"; print states
      info = ""
      if (rows > 0) for (k = 1; k <= 3; k++) {
        f = (k == 1) ? "serverName" : (k == 2) ? "version" : "edition"
        if (f in idx) info = info (info ? "," : "") q(f) ":" q(cell[1, idx[f]])
      }
      print info
      dbs = ""
      if ("databaseName" in idx) for (n = 1; n <= rows; n++) {
        st = (name[1] == "__OPSBOX_STATUS") ? cell[n, 1] : "Healthy"
        dbs = dbs (n > 1 ? "," : "") "{\"instanceTarget\":" q(target) ",\"name\":" q(cell[n, idx["databaseName"]]) \
          ",\"state\":" q(("state" in idx) ? cell[n, idx["state"]] : "") ",\"recoveryModel\":" q(("recoveryModel" in idx) ? cell[n, idx["recoveryModel"]] : "") \
          ",\"sizeMB\":" num(("dataSizeMB" in idx) ? cell[n, idx["dataSizeMB"]] : "0") ",\"status\":" q(st) "}"
      }
      print dbs
    }'
}

# 대상 1곳 실행 결과를 JSON으로: opsbox_db_target_result 이름(있으면) SQL 대상 기본상태모드(policy|custom)
opsbox_db_target_result() {
  local query_name=$1 sql=$2 target=$3 mode=$4 parsed count columns rows states status message='' name_json='' rules
  [ -n "$query_name" ] && name_json="\"name\":$(opsbox_json_string "$query_name"),"
  db_last_info=''; db_last_databases=''; db_last_count=0
  if [ -z "$db_client" ]; then
    case "$db_product" in
      PostgreSQL) message='psql을 PATH에서 찾을 수 없습니다. PostgreSQL 클라이언트를 설치하세요.' ;;
      MariaDB) message='mariadb(mysql) 클라이언트를 PATH에서 찾을 수 없습니다.' ;;
      MSSQL) message='sqlcmd를 찾을 수 없습니다. mssql-tools를 설치하세요.' ;;
      CUBRID) message='csql을 PATH에서 찾을 수 없습니다. CUBRID 환경 변수(cubrid.sh)를 불러온 계정으로 실행하세요.' ;;
      *) message="Linux DB 점검을 지원하지 않는 DB 제품입니다: ${db_product:-미지정}" ;;
    esac
    db_last_status=NotCollected
    printf '{%s"target":%s,"status":"NotCollected","message":%s,"columns":[],"rows":[],"rowCount":0}' "$name_json" "$(opsbox_json_string "$target")" "$(opsbox_json_string "$message")"
    return
  fi
  if [ "$db_product" = CUBRID ] && [ -z "$target" ]; then
    db_last_status=NotCollected
    printf '{%s"target":"","status":"NotCollected","message":"CUBRID는 서버 정책에 대상 DB(DB이름@호스트)를 지정해야 합니다.","columns":[],"rows":[],"rowCount":0}' "$name_json"
    return
  fi
  opsbox_db_exec "$sql" "$target"
  if [ "$db_rc" != 0 ]; then
    count=0; columns='[]'; rows='[]'; states=''
    message=$(printf '%s' "$db_err" | tr '\n' ' ' | cut -c1-1200)
    # 권한·인증 문제는 DB 장애가 아니라 점검 설정 문제이므로 미수집으로 표시
    if printf '%s' "$db_err" | grep -qiE 'permission denied|access denied|authentication failed|must be superuser|privilege|login failed|password'; then status=NotCollected; else status=Critical; fi
  else
    rules=$(printf '%s\n' "$sql" | sed -n 's/^[[:space:]]*--[[:space:]]*@opsbox-status[[:space:]][[:space:]]*//p')
    parsed=$(printf '%s\n' "$db_out" | opsbox_db_tsv_to_json "$target" "$rules")
    count=$(printf '%s\n' "$parsed" | sed -n 1p); columns=$(printf '%s\n' "$parsed" | sed -n 2p); rows=$(printf '%s\n' "$parsed" | sed -n 3p)
    states=" $(printf '%s\n' "$parsed" | sed -n 4p) "
    db_last_info=$(printf '%s\n' "$parsed" | sed -n 5p); db_last_databases=$(printf '%s\n' "$parsed" | sed -n 6p); db_last_count=${count:-0}
    if [ "$mode" = custom ]; then status=Healthy
    elif [ "${count:-0}" -eq 0 ]; then status=NotCollected
    else
      case "$states" in
        *' Critical '*) status=Critical ;;
        *' Warning '*) status=Warning ;;
        *' Healthy '*) status=Healthy ;;
        *' NotCollected '*) status=NotCollected ;;
        *) status=Healthy ;;
      esac
    fi
  fi
  db_last_status=$status
  printf '{%s"target":%s,"status":"%s","message":%s,"columns":%s,"rows":%s,"rowCount":%s}' "$name_json" "$(opsbox_json_string "$target")" "$status" \
    "$( [ -n "$message" ] && opsbox_json_string "$message" || printf 'null')" "${columns:-[]}" "${rows:-[]}" "${count:-0}"
}

opsbox_db_overall() { # 상태들 → 종합 (Critical > Warning > Healthy > NotCollected)
  case " $1 " in *' Critical '*) printf Critical ;; *' Warning '*) printf Warning ;; *' Healthy '*) printf Healthy ;; *) printf NotCollected ;; esac
}

for db_index in "${!OPSBOX_DB_QUERY_ITEMS[@]}"; do
  db_item=${OPSBOX_DB_QUERY_ITEMS[$db_index]}
  db_name=${OPSBOX_DB_QUERY_NAMES[$db_index]}
  db_results=''; db_statuses=''; db_instances=''; db_databases=''; db_database_count=0; db_info=''; db_target_count=0
  while IFS= read -r db_target || [ -n "$db_target" ]; do
    db_target_count=$((db_target_count + 1))
    opsbox_log "DB 쿼리 실행: $db_name / ${db_target:-(기본 접속)}"
    db_result=$(opsbox_db_target_result '' "${OPSBOX_DB_QUERY_SQL[$db_index]}" "$db_target" policy; printf '\n%s\n%s\n%s\n%s' "$db_last_status" "$db_last_count" "$db_last_info" "$db_last_databases")
    db_json=$(printf '%s\n' "$db_result" | sed -n 1p); db_status=$(printf '%s\n' "$db_result" | sed -n 2p)
    [ -n "$db_results" ] && db_results+=','
    db_results+=$db_json; db_statuses+=" $db_status"
    if [ "$db_item" = DB_INSTANCE_STATUS ]; then
      db_count=$(printf '%s\n' "$db_result" | sed -n 3p); db_this_info=$(printf '%s\n' "$db_result" | sed -n 4p); db_this_dbs=$(printf '%s\n' "$db_result" | sed -n 5p)
      [ -z "$db_info" ] && db_info=$db_this_info
      [ -n "$db_instances" ] && db_instances+=','
      db_instances+="{\"target\":$(opsbox_json_string "$db_target"),\"status\":\"$db_status\",\"databaseCount\":${db_count:-0}${db_this_info:+,$db_this_info}}"
      if [ -n "$db_this_dbs" ]; then [ -n "$db_databases" ] && db_databases+=','; db_databases+=$db_this_dbs; fi
      db_database_count=$((db_database_count + ${db_count:-0}))
    fi
  done <<< "${OPSBOX_DB_QUERY_TARGETS[$db_index]}"
  db_item_status=$(opsbox_db_overall "$db_statuses")
  opsbox_role_record DB "$db_item" "$db_item_status" "{\"queryName\":$(opsbox_json_string "$db_name"),\"queries\":[$db_results]}"
  if [ "$db_item" = DB_INSTANCE_STATUS ]; then
    db_offline=$(printf '%s' "$db_databases" | grep -o '"status":"Critical"' | wc -l | tr -d ' ')
    database_status=$db_item_status
    database_check_json="{\"product\":$(opsbox_json_string "$db_product"),\"status\":\"$db_item_status\"${db_info:+,$db_info},\"targetCount\":$db_target_count,\"databaseCount\":$db_database_count,\"offlineCount\":${db_offline:-0},\"instances\":[$db_instances],\"databases\":[$db_databases]}"
  fi
  opsbox_log "DB 쿼리 완료: $db_name / $db_item_status"
done

if [ "${#OPSBOX_DB_CUSTOM_SQL[@]}" -gt 0 ]; then
  db_results=''; db_statuses=''
  for db_index in "${!OPSBOX_DB_CUSTOM_SQL[@]}"; do
    while IFS= read -r db_target || [ -n "$db_target" ]; do
      opsbox_log "DB 사용자 쿼리 실행: ${OPSBOX_DB_CUSTOM_NAMES[$db_index]} / ${db_target:-(기본 접속)}"
      db_result=$(opsbox_db_target_result "${OPSBOX_DB_CUSTOM_NAMES[$db_index]}" "${OPSBOX_DB_CUSTOM_SQL[$db_index]}" "$db_target" custom; printf '\n%s' "$db_last_status")
      [ -n "$db_results" ] && db_results+=','
      db_results+=$(printf '%s\n' "$db_result" | sed -n 1p); db_statuses+=" $(printf '%s\n' "$db_result" | sed -n 2p)"
    done <<< "$OPSBOX_DB_CUSTOM_TARGETS"
  done
  case " $db_statuses " in *' Critical '*) db_item_status=Critical ;; *' Healthy '*) db_item_status=Healthy ;; *) db_item_status=NotCollected ;; esac
  opsbox_role_record DB DB_CUSTOM_QUERY "$db_item_status" "{\"queries\":[$db_results]}"
fi
rm -f "$db_err_file" 2>/dev/null
opsbox_log "DB 공통 쿼리 실행기 종료: ${db_product:-제품 미지정}"

# ---- 역할별 점검 결과 정리 (OpsBox가 자동으로 넣음) ----
opsbox_finalize_role_policies() {
  local i role item key status entry s roles_seen='' out=''
  declare -A role_items=() role_statuses=()
  for i in "${!OPSBOX_ROLE_ITEM_IDS[@]}"; do
    role=${OPSBOX_ROLE_ITEM_ROLES[$i]}; item=${OPSBOX_ROLE_ITEM_IDS[$i]}; key="$role:$item"
    if [ -n "${OPSBOX_ROLE_STATUS[$key]+x}" ]; then
      status=${OPSBOX_ROLE_STATUS[$key]}
      entry="{\"role\":\"$role\",\"item\":$(opsbox_json_string "$item"),${OPSBOX_ROLE_ITEM_META[$i]},\"status\":\"$status\",\"detail\":${OPSBOX_ROLE_DETAIL[$key]}}"
    else
      status=NotCollected
      entry="{\"role\":\"$role\",\"item\":$(opsbox_json_string "$item"),${OPSBOX_ROLE_ITEM_META[$i]},\"status\":\"NotCollected\",\"message\":$(opsbox_json_string "${OPSBOX_ROLE_ITEM_MESSAGES[$i]}")}"
    fi
    [ -n "${role_items[$role]:-}" ] && role_items[$role]+=','
    role_items[$role]+=$entry
    role_statuses[$role]+=" $status"
    case " $roles_seen " in *" $role "*) ;; *) roles_seen+=" $role" ;; esac
  done
  OPSBOX_ROLE_POLICY_STATUSES=''
  for role in $roles_seen; do
    case "${role_statuses[$role]} " in
      *' Critical '*) s=Critical ;;
      *' Warning '*) s=Warning ;;
      *' Healthy '*) s=Healthy ;;
      *) s=NotCollected ;;
    esac
    [ -n "$out" ] && out+=','
    out+="\"$role\":{\"status\":\"$s\",\"items\":[${role_items[$role]}]}"
    OPSBOX_ROLE_POLICY_STATUSES+=" $s"
  done
  OPSBOX_ROLE_POLICIES_JSON="{$out}"
  # 기본(BASIC) 사용자 항목: 조각이 opsbox_role_record BASIC … 으로 남긴 결과를 모으고 종합 상태에 넣음
  local basic_out=''
  for i in "${!OPSBOX_BASIC_ITEM_IDS[@]}"; do
    item=${OPSBOX_BASIC_ITEM_IDS[$i]}; key="BASIC:$item"
    if [ -n "${OPSBOX_ROLE_STATUS[$key]+x}" ]; then
      status=${OPSBOX_ROLE_STATUS[$key]}
      entry="{\"role\":\"BASIC\",\"item\":$(opsbox_json_string "$item"),${OPSBOX_BASIC_ITEM_META[$i]},\"status\":\"$status\",\"detail\":${OPSBOX_ROLE_DETAIL[$key]}}"
    else
      status=NotCollected
      entry="{\"role\":\"BASIC\",\"item\":$(opsbox_json_string "$item"),${OPSBOX_BASIC_ITEM_META[$i]},\"status\":\"NotCollected\",\"message\":$(opsbox_json_string "$OPSBOX_BASIC_NOT_COLLECTED_MESSAGE")}"
    fi
    [ -n "$basic_out" ] && basic_out+=','
    basic_out+=$entry
    OPSBOX_ROLE_POLICY_STATUSES+=" $status"
  done
  OPSBOX_BASIC_POLICY_ITEMS_JSON="[$basic_out]"
}
opsbox_finalize_role_policies
case " $was_statuses " in
  '  ') was_status=NotCollected ;;
  *' Critical '*) was_status=Critical ;;
  *' Warning '*) was_status=Warning ;;
  *' NotCollected '*) was_status=NotCollected ;;
  *) was_status=Healthy ;;
esac

# 항목별 상태 종합 (Windows 스크립트와 같은 규칙)
opsbox_collection_status() {
  local statuses=" $1 " kind=$2
  if [ -z "${1// /}" ]; then printf 'NotCollected'; return; fi
  case "$statuses" in *' Critical '*|*' Missing '*) printf 'Critical'; return ;; esac
  case "$statuses" in *' Warning '*) printf 'Warning'; return ;; esac
  case "$statuses" in *' NotCollected '*) printf 'NotCollected'; return ;; esac
  printf 'Healthy'
}
process_status=$(opsbox_collection_status "$process_statuses" process)
directory_status=$(opsbox_collection_status "$directory_statuses" directory)
file_status=$(opsbox_collection_status "$file_statuses" file)
port_status=$(opsbox_collection_status "$port_statuses" port)
http_status=$(opsbox_collection_status "$http_statuses" http)

all_statuses="$host_info_status $cpu_status $memory_status $uptime_status $disk_status $process_status $directory_status $file_status $port_status $http_status $OPSBOX_ROLE_POLICY_STATUSES"
critical_count=0; warning_count=0; not_collected_count=0; healthy_count=0; status_total=0
for s in $all_statuses; do
  status_total=$((status_total + 1))
  case "$s" in
    Critical) critical_count=$((critical_count + 1)) ;;
    Warning) warning_count=$((warning_count + 1)) ;;
    NotCollected) not_collected_count=$((not_collected_count + 1)) ;;
    Healthy) healthy_count=$((healthy_count + 1)) ;;
  esac
done
if [ $critical_count -gt 0 ]; then overall_status=Critical
elif [ $warning_count -gt 0 ]; then overall_status=Warning
elif [ $not_collected_count -eq $status_total ]; then overall_status=NotCollected
else overall_status=Healthy; fi

opsbox_product_json() { local p=$1; if [ -n "$p" ]; then opsbox_json_string "$p"; else printf 'null'; fi; }

# 결과 JSON 출력 (here-document를 $( ) 안에 넣지 않아 오래된 bash에서도 안전)
opsbox_write_result() {
cat <<OPSBOX_JSON
{
  "schemaVersion": 2,
  "server": $OPSBOX_SERVER_JSON,
  "collectedAt": $(opsbox_json_string "$check_date"),
  "host": {"hostname": $(opsbox_json_string "$host_name"), "osName": $(opsbox_json_string "$os_name"), "osVersion": $(opsbox_json_string "$os_version"), "uptimeMinutes": $(opsbox_json_number "$uptime_minutes"), "uptime": $uptime_parts_json, "status": "$host_info_status"},
  "resources": {
    "cpu": {"usagePercent": $(opsbox_json_number "$cpu"), "status": "$cpu_status"},
    "memory": {"usagePercent": $(opsbox_json_number "$memory"), "status": "$memory_status"},
    "uptime": {"minutes": $(opsbox_json_number "$uptime_minutes"), "parts": $uptime_parts_json, "status": "$uptime_status"},
    "disk": {"maxUsagePercent": $(opsbox_json_number "$disk"), "status": "$disk_status", "volumes": [$disks_json]}
  },
  "checks": {
    "policyDefinitions": $OPSBOX_POLICY_DEFINITIONS_JSON,
    "processes": {"status": "$process_status", "items": [$processes_json]},
    "directories": {"status": "$directory_status", "items": [$directories_json]},
    "files": {"status": "$file_status", "items": [$files_json]},
    "ports": {"status": "$port_status", "items": [$ports_json]},
    "http": {"status": "$http_status", "items": [$http_json]},
    "web": {"status": "${web_status:-NotCollected}", "product": $(opsbox_product_json "$OPSBOX_PRODUCT_WEB"), "detail": ${web_check_json:-null}},
    "was": {"status": "${was_status:-NotCollected}", "product": $(opsbox_product_json "$OPSBOX_PRODUCT_WAS"), "items": [${was_items_json:-}]},
    "database": {"status": "${database_status:-NotCollected}", "product": $(opsbox_product_json "$OPSBOX_PRODUCT_DB"), "detail": ${database_check_json:-null}},
    "rolePolicies": $OPSBOX_ROLE_POLICIES_JSON,
    "policyItems": $OPSBOX_BASIC_POLICY_ITEMS_JSON
  },
  "summary": {"status": "$overall_status", "counts": {"healthy": $healthy_count, "warning": $warning_count, "critical": $critical_count, "notCollected": $not_collected_count}}
}
OPSBOX_JSON
}

# 결과 저장: 임시 파일에 쓴 뒤 이름을 바꿔, 가져오기가 쓰는 중인 파일을 읽지 않게 합니다.
opsbox_save_result() {
  local dir=$1 target tmp
  target="$dir/$opsbox_result_name"
  tmp="$dir/.$opsbox_result_name.tmp"
  opsbox_write_result > "$tmp" 2>/dev/null && mv -f "$tmp" "$target" 2>/dev/null && { printf '%s' "$target"; return 0; }
  rm -f "$tmp" 2>/dev/null
  return 1
}
saved_path=''
if [ "$opsbox_result_dir_ready" = true ]; then saved_path=$(opsbox_save_result "$opsbox_result_dir"); fi
if [ -z "$saved_path" ] && [ "$opsbox_result_dir" != "$opsbox_script_dir" ]; then
  opsbox_log "결과 폴더에 쓸 수 없어 스크립트 폴더에 저장합니다: $opsbox_script_dir"
  saved_path=$(opsbox_save_result "$opsbox_script_dir")
fi
if [ -z "$saved_path" ]; then
  opsbox_log '결과 저장 실패: 쓸 수 있는 폴더가 없습니다. 결과 폴더를 인자로 지정하세요. 예) bash 스크립트.sh /tmp'
  exit 1
fi
opsbox_log "결과 저장 완료: $saved_path"
opsbox_log "점검 스크립트 정상 종료: $overall_status"
case "$saved_path" in
  "${OPSBOX_SHARED_PATH%/}/results/"*) ;;
  *) opsbox_log '이 파일을 OpsBox 공유 폴더의 results 폴더에 넣거나, OpsBox 서버 상세 화면의 [결과 파일 올리기]로 올리세요.' ;;
esac
echo "Result JSON: $saved_path"
