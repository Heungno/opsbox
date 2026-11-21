/*
 * 점검 만들기: 폼 값을 스크립트에 넣는 유일한 통로
 *
 * 생성기는 폼 값을 반드시 이 함수들로만 코드에 넣습니다. 서버별 값은 코드에 넣지 않고 실행 중에 설정에서 읽습니다.
 */

/** 생성기 버전. 생성 코드가 바뀌면 올리고, 고치지 않은 생성 조각은 앱 시작 시 다시 만듭니다. */
export const GENERATOR_VERSION = 1;

/** bash 작은따옴표 문자열 ('는 '\'' 로) — 변수 확장·명령 치환이 일어나지 않습니다. */
export function shLiteral(value: string | number): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/** PowerShell 문자열 식 — UTF-8 base64로 감싸 따옴표·백틱·$ 가 코드로 해석되지 않습니다. (PowerShell 2.0 이상) */
export function psLiteral(value: string | number): string {
  const base64 = Buffer.from(String(value), 'utf8').toString('base64');
  return `([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64}')))`;
}

/** 주석에 넣을 한 줄 텍스트 (줄바꿈을 없애 주석 밖으로 나가지 않게) */
export function commentText(value: string): string {
  return String(value).replace(/[\r\n\u0085\u2028\u2029]+/g, ' ').slice(0, 200);
}

/** 항목 ID는 함수 이름에도 쓰므로 영문·숫자·_ 만 허용합니다. */
export function assertItemId(itemId: string): void {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(itemId)) throw new Error(`항목 ID에 쓸 수 없는 글자가 있습니다(영문·숫자·_ 만 가능): ${itemId}`);
}
