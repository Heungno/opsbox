#!/bin/bash

CPU=$(top -bn1 | grep "Cpu(s)" | awk '{print int($2)}')

MEMORY=$(free | awk '/Mem:/ {printf("%d"), $3/$2 * 100}')

DISK=$(df -h / | awk 'NR==2 {gsub("%",""); print $5}')

DATE=$(date +"%Y-%m-%d")

cat <<EOF > result.json
{
  "server":"$(hostname)",
  "serverType":"WEB",
  "checkDate":"$DATE",
  "cpu":$CPU,
  "memory":$MEMORY,
  "disk":$DISK,
  "network":"UP",
  "logError":false
}
EOF

echo "result.json 생성 완료"