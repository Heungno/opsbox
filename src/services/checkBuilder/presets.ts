import type { PolicyInput } from '../../types/policy';
import type { BuilderOs, Preset } from './types';

/*
 * 준비된 점검 목록 (정보시스템 예방점검 매뉴얼 기준)
 *
 * 명령은 읽기 전용 조회만 사용합니다. 명령이 없는 서버(예: multipath 미사용)는 미수집으로 남습니다.
 * 서버별 입력은 환경 변수 OPSBOX_INPUT_<KEY 대문자>로 명령에 전달됩니다.
 */

const pingTarget: PolicyInput = { key: 'target', label: 'Ping 대상 (비우면 기본 게이트웨이)', type: 'TEXT', scope: 'SERVER', required: false };

const PRESETS: Preset[] = [
  {
    id: 'linux.swap', os: 'Linux', type: 'COMMAND_NUMBER', name: 'Swap 사용률',
    description: '전체 Swap 중 사용 중인 비율(%). 높으면 물리 메모리 부족을 의심합니다.',
    command: `free | awk '/^Swap:/ { if ($2 > 0) printf "%.1f\\n", $3 * 100 / $2; else print 0 }'`,
    defaults: { unit: '%', direction: 'HIGHER_IS_WORSE', warning: 50, critical: 80 }, inputs: [],
  },
  {
    id: 'linux.inode', os: 'Linux', type: 'COMMAND_NUMBER', name: 'I-Node 사용률',
    description: '파일시스템 중 가장 높은 I-Node 사용률(%). 가득 차면 공간이 남아도 파일을 만들 수 없습니다.',
    command: `df -Pi -x tmpfs -x devtmpfs 2>/dev/null | awk 'NR > 1 && $5 ~ /%/ { v = $5 + 0; if (v > m) m = v } END { print m + 0 }'`,
    defaults: { unit: '%', direction: 'HIGHER_IS_WORSE', warning: 70, critical: 90 }, inputs: [],
  },
  {
    id: 'linux.ping', os: 'Linux', type: 'COMMAND_NUMBER', name: 'Ping 손실률',
    description: 'Ping 5회 중 응답이 없는 비율(%). 대상을 비우면 기본 게이트웨이로 확인합니다.',
    command: [
      `t=\${OPSBOX_INPUT_TARGET:-$(ip route 2>/dev/null | awk '/^default/ { print $3; exit }')}`,
      `[ -n "$t" ] || { echo 'Ping 대상(기본 게이트웨이)을 찾지 못했습니다.' >&2; exit 127; }`,
      `ping -c 5 -W 2 -- "$t" 2>&1 | awk '/packet loss/ { for (i = 1; i <= NF; i++) if ($i ~ /%$/) { sub(/%/, "", $i); print $i; exit } }'`,
    ].join('\n'),
    defaults: { unit: '%', direction: 'HIGHER_IS_WORSE', warning: 20, critical: 60 }, inputs: [pingTarget],
  },
  {
    id: 'linux.nic', os: 'Linux', type: 'COMMAND_TEXT', name: 'NIC 링크 상태',
    description: '네트워크 인터페이스(lo 제외) 중 링크가 내려간(state DOWN) 것이 있는지 확인합니다.',
    command: `ip -o link show | awk -F': ' '$2 != "lo"'`,
    defaults: { badPhrases: ['state DOWN'], level: 'Critical' }, inputs: [],
  },
  {
    id: 'linux.raid', os: 'Linux', type: 'COMMAND_TEXT', name: 'Disk 이중화 (소프트웨어 RAID)',
    description: '/proc/mdstat 의 디스크 상태([UU])에 결손(_)이 있는지 확인합니다.',
    command: `[ -r /proc/mdstat ] || { echo '/proc/mdstat 이 없습니다 (소프트웨어 RAID 미사용).' >&2; exit 127; }\ngrep -o '\\[[U_]*\\]' /proc/mdstat || true`,
    defaults: { badPhrases: ['_'], level: 'Critical' }, inputs: [],
  },
  {
    id: 'linux.multipath', os: 'Linux', type: 'COMMAND_TEXT', name: 'Multipath 이중화',
    description: 'multipath -ll 결과에 실패한 경로(failed, faulty, offline)가 있는지 확인합니다.',
    command: 'multipath -ll',
    defaults: { badPhrases: ['failed', 'faulty', 'offline'], level: 'Critical' }, inputs: [],
  },
  {
    id: 'linux.hba', os: 'Linux', type: 'COMMAND_TEXT', name: 'HBA 연결 상태',
    description: 'FC HBA 포트 상태가 Online 이 아닌 것(Linkdown, Offline)이 있는지 확인합니다.',
    command: `ls /sys/class/fc_host/host*/port_state >/dev/null 2>&1 || { echo 'FC HBA가 없습니다.' >&2; exit 127; }\nfor f in /sys/class/fc_host/host*/port_state; do printf '%s %s\\n' "\${f%/port_state}" "$(cat "$f")"; done`,
    defaults: { badPhrases: ['Linkdown', 'Offline'], level: 'Critical' }, inputs: [],
  },
  {
    id: 'linux.cluster', os: 'Linux', type: 'COMMAND_TEXT', name: 'Cluster 데몬 상태',
    description: 'Pacemaker(pcs status) 결과에 OFFLINE, Stopped, FAILED 가 있는지 확인합니다.',
    // pcs 는 클러스터가 멈추면 오류로 끝나므로, 그 경우 FAILED 를 출력해 위험으로 판정되게 합니다.
    command: [
      'out=$(pcs status 2>&1); rc=$?',
      `printf '%s\n' "$out"`,
      '[ "$rc" -eq 127 ] && exit 127',
      `[ "$rc" -ne 0 ] && echo "FAILED: pcs status 종료 코드 $rc (클러스터가 실행 중이 아닐 수 있습니다)"`,
      'exit 0',
    ].join('\n'),
    defaults: { badPhrases: ['OFFLINE', 'Stopped', 'FAILED'], level: 'Critical' }, inputs: [],
  },
  {
    id: 'linux.sysctl', os: 'Linux', type: 'SETTING_VALUE', name: '커널 파라미터',
    description: 'sysctl 커널 파라미터 값이 기준과 같은지 확인합니다. 파라미터 이름(예: vm.swappiness)과 기대값을 입력하세요.',
    defaults: { comparator: '=', level: 'Warning' }, inputs: [],
  },
  {
    id: 'windows.pagefile', os: 'Windows', type: 'COMMAND_NUMBER', name: 'Paging File 사용률',
    description: '페이징 파일 중 가장 높은 사용률(%). 높으면 물리 메모리 부족을 의심합니다.',
    command: [
      '$max = 0',
      'foreach ($p in @(Get-CimInstance Win32_PageFileUsage -ErrorAction Stop)) {',
      '  if ($p.AllocatedBaseSize -gt 0) { $v = [math]::Round($p.CurrentUsage * 100 / $p.AllocatedBaseSize, 1); if ($v -gt $max) { $max = $v } }',
      '}',
      '$max',
    ].join('\n'),
    defaults: { unit: '%', direction: 'HIGHER_IS_WORSE', warning: 50, critical: 80 }, inputs: [],
  },
  {
    id: 'windows.ping', os: 'Windows', type: 'COMMAND_NUMBER', name: 'Ping 손실률',
    description: 'Ping 5회 중 응답이 없는 비율(%). 대상을 비우면 기본 게이트웨이로 확인합니다.',
    command: [
      '$target = $env:OPSBOX_INPUT_TARGET',
      "if ([string]::IsNullOrWhiteSpace($target)) { $target = @(Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled = True' | ForEach-Object { $_.DefaultIPGateway } | Where-Object { $_ })[0] }",
      "if (-not $target) { [Console]::Error.WriteLine('Ping 대상(기본 게이트웨이)을 찾지 못했습니다.'); exit 127 }",
      '$replies = @(Test-Connection -ComputerName $target -Count 5 -ErrorAction SilentlyContinue).Count',
      '[math]::Round((5 - $replies) * 100 / 5, 1)',
    ].join('\n'),
    defaults: { unit: '%', direction: 'HIGHER_IS_WORSE', warning: 20, critical: 60 }, inputs: [pingTarget],
  },
  {
    id: 'windows.nic', os: 'Windows', type: 'COMMAND_TEXT', name: 'NIC 링크 상태',
    description: '물리 네트워크 어댑터 중 연결이 끊긴(Disconnected, Down) 것이 있는지 확인합니다.',
    command: 'Get-NetAdapter -Physical -ErrorAction Stop | ForEach-Object { "$($_.Name) $($_.Status)" }',
    defaults: { badPhrases: ['Disconnected', 'Down'], level: 'Critical' }, inputs: [],
  },
  {
    id: 'windows.disk', os: 'Windows', type: 'COMMAND_TEXT', name: '물리 디스크 상태',
    description: '물리 디스크 중 상태가 Healthy 가 아닌 것(Warning, Unhealthy)이 있는지 확인합니다.',
    command: 'Get-PhysicalDisk -ErrorAction Stop | ForEach-Object { "$($_.FriendlyName) $($_.HealthStatus)" }',
    defaults: { badPhrases: ['Warning', 'Unhealthy'], level: 'Critical' }, inputs: [],
  },
  {
    id: 'windows.multipath', os: 'Windows', type: 'COMMAND_TEXT', name: 'Multipath 이중화',
    description: 'MPIO(mpclaim -s -d) 결과에 실패한 경로(Failed)가 있는지 확인합니다.',
    command: "if (-not (Get-Command mpclaim.exe -ErrorAction SilentlyContinue)) { [Console]::Error.WriteLine('mpclaim.exe 가 없습니다 (MPIO 미설치).'); exit 127 }\nmpclaim.exe -s -d",
    defaults: { badPhrases: ['Failed'], level: 'Critical' }, inputs: [],
  },
  {
    id: 'windows.hba', os: 'Windows', type: 'COMMAND_TEXT', name: 'HBA 연결 상태',
    description: 'FC/iSCSI 이니시에이터 포트 중 연결이 끊긴(Linkdown, Offline) 것이 있는지 확인합니다.',
    command: 'Get-InitiatorPort -ErrorAction Stop | ForEach-Object { "$($_.NodeAddress) $($_.ConnectionType) $($_.OperationalStatus)" }',
    defaults: { badPhrases: ['Linkdown', 'Offline'], level: 'Critical' }, inputs: [],
  },
  {
    id: 'windows.cluster', os: 'Windows', type: 'COMMAND_TEXT', name: 'Cluster 노드 상태',
    description: '장애 조치 클러스터 노드 중 Up 이 아닌 것(Down, Paused)이 있는지 확인합니다.',
    command: "if (-not (Get-Command Get-ClusterNode -ErrorAction SilentlyContinue)) { [Console]::Error.WriteLine('장애 조치 클러스터 기능이 없습니다.'); exit 127 }\nGet-ClusterNode -ErrorAction Stop | ForEach-Object { \"$($_.Name) $($_.State)\" }",
    defaults: { badPhrases: ['Down', 'Paused'], level: 'Critical' }, inputs: [],
  },
  {
    id: 'windows.registry', os: 'Windows', type: 'SETTING_VALUE', name: '레지스트리 값',
    description: '레지스트리 값이 기준과 같은지 확인합니다. 경로(예: HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters), 값 이름, 기대값을 입력하세요.',
    defaults: { comparator: '=', level: 'Warning' }, inputs: [],
  },
];

export function presetsFor(os: BuilderOs): Preset[] {
  return PRESETS.filter((preset) => preset.os === os);
}

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}
