import { getServer, getServerProduct, getServerRoles } from './serverService';
import { getTemplate, getTemplates } from './templateService';
import { assembleWindowsScript } from './windowsScriptService';
import { Server } from '../types/server';

export function generateScript(serverId: string): string {
  const server = getServer(serverId);

  if (!server) {
    throw new Error(`Server not found: ${serverId}`);
  }

  const scriptTemplate = getTemplate(server.scriptTemplateId);
  if (scriptTemplate?.enabled) {
    if (scriptTemplate.kind !== 'SCRIPT' || scriptTemplate.os !== server.os) throw new Error('선택한 스크립트 템플릿의 종류 또는 운영체제가 서버 설정과 맞지 않습니다.');
    if (scriptTemplate.role && !getServerRoles(server).includes(scriptTemplate.role)) throw new Error('스크립트 템플릿의 대상 역할이 서버에 설정되어 있지 않습니다.');
    if (scriptTemplate.product && !Object.values(server.products ?? {}).includes(scriptTemplate.product as any) && server.product !== scriptTemplate.product) throw new Error('스크립트 템플릿의 대상 제품이 서버 설정과 맞지 않습니다.');
    return renderScriptTemplate(scriptTemplate.content, server);
  }

  const queryTemplate = getTemplate(server.queryTemplateId);
  if (queryTemplate?.enabled && queryTemplate.kind !== 'QUERY') throw new Error('선택한 쿼리 템플릿이 QUERY 유형이 아닙니다.');
  return server.os === 'Windows'
    ? assembleWindowsScript(server, getTemplates({ kind: 'SCRIPT_PART' }), queryTemplate?.enabled ? queryTemplate.content : undefined)
    : generateLinuxScript(server);
}

function renderScriptTemplate(content: string, server: Server) {
  const roles = getServerRoles(server);
  const values: Record<string, string> = {
    SERVER_ID: server.id, SERVER_NAME: server.name, SERVER_IP: server.ip, SHARED_PATH: server.sharedPath, OS: server.os,
    ROLES: roles.join(','), ROLES_JSON: JSON.stringify(roles), PRODUCTS_JSON: JSON.stringify(server.products ?? {}),
    PROCESSES_JSON: JSON.stringify(server.processes ?? []), DIRECTORIES_JSON: JSON.stringify(server.directories ?? []),
    FILE_CHECKS_JSON: JSON.stringify(server.fileChecks ?? []), PORTS_JSON: JSON.stringify(server.ports ?? []),
    HTTP_CHECKS_JSON: JSON.stringify(server.httpChecks ?? []),
  };
  return content.replace(/\{\{([A-Z_]+)\}\}/g, (token, key: string) => values[key] ?? token);
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
