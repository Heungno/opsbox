/*
 * 요소 만들기 도우미. DOM은 createElement + textContent만 씁니다(innerHTML 금지).
 * 로직 모듈에서도 쓰므로 상대 경로로만 import 합니다.
 */

/** <tag class="className">text</tag> (빈 클래스·글자는 넣지 않음) */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== '') node.textContent = String(text);
  return node;
}

/** <option value="value">label</option> */
export function option(value, label, selected = false) {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  if (selected) node.selected = true;
  return node;
}

/** 안의 내용을 바꿉니다. */
export function replace(container, ...nodes) {
  container.replaceChildren(...nodes);
}
