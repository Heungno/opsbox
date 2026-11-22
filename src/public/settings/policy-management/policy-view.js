/* 점검 정책 관리: 분류 탭과 항목 요약 (이름은 공통코드) */
import { codeLabel, codeList } from '../../shared/js/codes.js';
import { el } from '../../shared/js/dom.js';

/** 분류 탭: 공통코드 policyCategories 순서·이름, 건수는 (OS·검색으로 거른) 정책 수 */
export function renderCategoryTabs(container, policies, active) {
  container.replaceChildren(...codeList('policyCategories').map(({ value, label }) => {
    const tab = el('button', '', label);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('data-category', value);
    tab.setAttribute('aria-selected', String(value === active));
    tab.tabIndex = value === active ? 0 : -1;
    tab.append(' ', el('span', '', String(policies.filter((policy) => policy.category === value).length)));
    return tab;
  }));
}

/** 항목 한 줄 요약: 이름 · 실행 방식 · 결과 표시 */
export function itemSummary(item) {
  const views = (item.result?.components || []).map((component) => codeLabel('resultViews', component.type)).join('+');
  return `${item.name || item.id} · ${codeLabel('policyExecutors', item.executor?.type)} · ${views}`;
}
