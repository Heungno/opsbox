/* 화면이 그려지기 전에 저장된 테마를 적용 (깜빡임 방지, 일반 스크립트로 즉시 실행) */
try { if (localStorage.getItem('opsbox-theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch {}
