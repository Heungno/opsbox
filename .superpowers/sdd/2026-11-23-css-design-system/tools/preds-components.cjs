const core = (s) => s.replace(/^:root(\[[^\]]*\])?\s*/, '');
const E = '(?![\w-])';
const COMPONENT = new RegExp([
  `\.card${E}`, '\.section-header', '\.section-title', '\.summary-badge', '\.result-grid', '\.result-item', '\.result-date',
  '\.detail-table', `(table|th|td|thead|tbody)${E}`, '\.table-scroll', '\.badge-', '\.history-status', '\.history-table',
  '\.btn', '\.button-area', '\.form-grid', '\.form-group', 'fieldset\.form-group', '\.management-category-tabs',
  '\.modal-', '\.toast', `\.policy-help${E}`,
].map((p) => `^${p}`).join('|'));
const DEAD = new RegExp(`^(\.stats-grid|\.field-error|\.visually-hidden)${E}`);
const isComponent = (u) => (u.raw ? /toast-in/.test(u.at || '') : COMPONENT.test(core(u.selector)));
const isDead = (u) => !u.raw && DEAD.test(core(u.selector));
module.exports = { isComponent, isDead };
