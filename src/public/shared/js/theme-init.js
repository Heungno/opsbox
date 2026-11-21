/*
 * 화면이 그려지기 전에 테마를 정합니다 (일반 스크립트로 즉시 실행해 깜빡임 방지).
 * - 테마 버튼으로 직접 고른 적이 있으면(opsbox-theme 저장값) 그 테마
 * - 없으면 기기(OS·브라우저)의 다크 모드 설정을 따름
 * 기기 설정이 바뀔 때의 반영과 버튼 동작은 common.js가 맡습니다.
 */
(function () {
  var theme = 'light';
  try {
    var saved = localStorage.getItem('opsbox-theme');
    if (saved === 'dark' || saved === 'light') theme = saved;
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
  } catch (error) {}
  document.documentElement.dataset.theme = theme;
})();
