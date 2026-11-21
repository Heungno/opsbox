# Codespaces 테스트 안내

1. 이 화면이 열리면 아래 터미널에서 서버가 자동으로 시작됩니다 (1~2분).
2. 새 탭이 열리거나 "포트 3000" 알림이 뜨면 열어 주세요.
   - 안 뜨면: 하단 **포트(PORTS)** 탭 → `3000` → 지구본 아이콘
3. 로그인: `admin` / `opsbox1234`

- 최신 코드는 Codespace를 다시 열 때 자동으로 받아옵니다 (수동: 터미널에서 `git pull`).
- 데이터는 SQLite(`data/opsbox.db`)에 저장되며 Codespace를 지우기 전까지 유지됩니다.
- 샘플 점검 결과: `.devcontainer/sample-results/` → 처음 한 번 `.devcontainer/sample-share/results/`로 복사되고, OpsBox가 DB로 가져간 뒤 암호화 백업(`data/backup/results/`)합니다.
- 접속 주소는 기본적으로 본인 GitHub 계정만 열 수 있습니다. **Public으로 바꾸지 마세요.**
