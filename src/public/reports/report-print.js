/* 보고서 인쇄 머리말·제목의 문구 (역할 이름은 공통코드) */
import { roleLabel } from '../shared/js/codes.js';

/** 인쇄 머리말의 역할: 'WEB (Nginx), 기타' */
export function printRoleText(roles, products = {}) {
  return roles.map((role) => (products[role] ? `${roleLabel(role)} (${products[role]})` : roleLabel(role))).join(', ');
}

/** 보고서 제목의 역할: 'WEB + 기타' */
export function roleListText(roles) {
  return roles.map(roleLabel).join(' + ');
}

/** 인쇄 날짜: '2026. 11. 3.' */
export function formatPrintDate(date) {
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}
