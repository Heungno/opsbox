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
disk=$(df -P -l -x tmpfs -x devtmpfs 2>/dev/null | awk 'NR>1 {gsub("%", "", $5); if($5>max) max=$5} END{print max+0}')
roles="{{ROLES}}"
primaryRole="${roles%%,*}"
cat <<EOF
{
  "server": "{{SERVER_ID}}",
  "serverType": "$primaryRole",
  "serverTypes": {{ROLES_JSON}},
  "products": {{PRODUCTS_JSON}},
  "hostname": "$hostname",
  "checkDate": "$checkDate",
  "uptimeMinutes": $uptimeMinutes,
  "cpu": $cpu,
  "memory": $memory,
  "disk": $disk,
  "network": "NotChecked",
  "disks": [], "processes": [], "directories": [], "fileChecks": [], "ports": [], "httpChecks": [],
  "wasChecks": [], "webtobCheck": null, "databaseChecks": null
}
EOF
