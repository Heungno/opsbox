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
    "web": {"status": "NotCollected", "product": $(opsbox_product_json "$OPSBOX_PRODUCT_WEB"), "detail": null},
    "was": {"status": "NotCollected", "product": $(opsbox_product_json "$OPSBOX_PRODUCT_WAS"), "items": []},
    "database": {"status": "NotCollected", "product": $(opsbox_product_json "$OPSBOX_PRODUCT_DB"), "detail": null},
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