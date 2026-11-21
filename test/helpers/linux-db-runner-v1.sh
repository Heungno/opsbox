opsbox_log "DB 공통 쿼리 실행기 시작: ${OPSBOX_PRODUCT_DB:-제품 미지정}"
# 정책 항목마다 선택된 쿼리를 대상(인스턴스)별로 실행해 결과 표(columns/rows)를 남깁니다.
#   PostgreSQL: psql   대상 = 비움(이 서버, 로컬 소켓) | 호스트[:포트][/DB이름]
#   MariaDB:    mariadb(mysql)  대상 = 비움(로컬 소켓) | /소켓경로 | 호스트[:포트]
#   MSSQL:      sqlcmd 대상 = 비움(localhost) | 호스트,포트 | 호스트\인스턴스
#   CUBRID:     csql   대상 = DB이름[@호스트] (필수)
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

# 탭 구분 결과 → 1줄: 행 수, 2줄: columns JSON, 3줄: rows JSON, 4줄: __OPSBOX_STATUS 값들, 5줄: 인스턴스 정보, 6줄: DB 목록 JSON
opsbox_db_tsv_to_json() {
  awk -F '\t' -v target="$1" '
    function esc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); gsub(ctrl, " ", s); return s }
    function q(s) { return "\"" esc(s) "\"" }
    function num(s) { return (s ~ /^-?[0-9]+(\.[0-9]+)?$/) ? s : "0" }
    BEGIN { c = ""; for (i = 1; i < 32; i++) if (i != 9) c = c sprintf("%c", i); ctrl = "[" c "]"; rows = 0 }
    { sub(/\r$/, "") }
    NR == 1 { ncol = NF; cols = ""; for (i = 1; i <= NF; i++) { name[i] = $i; idx[$i] = i; cols = cols (i > 1 ? "," : "") q($i) }; next }
    NF != ncol { next }
    rows >= 1000 { next }
    {
      rows++; r = ""
      for (i = 1; i <= NF; i++) { v = $i; if (length(v) > 2000) v = substr(v, 1, 2000) "…"; r = r (i > 1 ? "," : "") q(v); cell[rows, i] = $i }
      rowsj = rowsj (rows > 1 ? "," : "") "[" r "]"
      if (name[1] == "__OPSBOX_STATUS") states = states " " $1
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
  local query_name=$1 sql=$2 target=$3 mode=$4 parsed count columns rows states status message='' name_json=''
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
    parsed=$(printf '%s\n' "$db_out" | opsbox_db_tsv_to_json "$target")
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