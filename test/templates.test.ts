import './helpers/env';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { prepareDatabase } from '../src/db';
import { deleteGeneratedTemplate, deleteTemplate, getTemplate, getTemplateHistory, getTemplates, restoreTemplateVersion, saveTemplate } from '../src/features/templates/service';

test('템플릿: 한 건 수정은 다른 템플릿의 순서와 내용을 바꾸지 않는다', () => {
  const before = getTemplates();
  const target = before[5];
  saveTemplate({ ...target, content: `${target.content}\n# 수정` }, target.id);
  const after = getTemplates();
  assert.deepEqual(after.map((t) => t.id), before.map((t) => t.id));
  assert.deepEqual(after.filter((t) => t.id !== target.id), before.filter((t) => t.id !== target.id));
  assert.equal(getTemplateHistory(target.id).length, 1);
  assert.equal(getTemplateHistory(target.id)[0].template.content, target.content, '이력에는 바뀌기 전 내용');
});

test('템플릿: 이력 버전으로 복원하면 그 내용으로 돌아간다', () => {
  const target = getTemplates()[5];
  const [version] = getTemplateHistory(target.id);
  const restored = restoreTemplateVersion(target.id, version.versionId);
  assert.equal(restored.content, version.template.content);
  assert.equal(getTemplate(target.id)?.content, version.template.content);
});

test('템플릿: 새 템플릿은 id를 만들어 저장하고, 없는 키(역할 등)는 응답에 넣지 않는다', () => {
  const saved = saveTemplate({ name: '새 쿼리', kind: 'QUERY', dbms: 'MSSQL', content: 'SELECT 1', enabled: true });
  assert.match(saved.id, /^TPL-/);
  const stored = getTemplate(saved.id)!;
  assert.equal(stored.content, 'SELECT 1');
  assert.equal('role' in stored, false);
  assert.equal('generated' in stored, false);
});

test('템플릿: 사용자가 지운 기본 템플릿은 다시 시작해도 되살아나지 않는다', () => {
  const id = getTemplates({ kind: 'QUERY' }).find((t) => !t.id.startsWith('TPL-'))!.id;
  deleteTemplate(id);
  prepareDatabase();
  assert.equal(getTemplate(id), undefined);
});

test('템플릿: 점검 만들기 템플릿을 지워도 지우기 전 내용이 이력에 남는다', () => {
  const generated = saveTemplate({ name: '생성 조각', kind: 'SCRIPT_PART', os: 'Linux', item: 'CPU', content: 'echo 1', enabled: true });
  deleteGeneratedTemplate(generated.id);
  assert.equal(getTemplate(generated.id), undefined);
  assert.equal(getTemplateHistory(generated.id)[0]?.template.content, 'echo 1');
});
