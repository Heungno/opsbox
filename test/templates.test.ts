import './helpers/env';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import fs from 'node:fs';
import { prepareDatabase } from '../src/db';
import { deleteGeneratedTemplate, deleteTemplate, getTemplate, getTemplateHistory, getTemplates, restoreTemplateVersion, saveTemplate } from '../src/features/templates/service';

const seedContent = (id: string): string => (JSON.parse(fs.readFileSync('seeds/templates.json', 'utf8')) as { id: string; content: string }[]).find((entry) => entry.id === id)!.content;

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

test('템플릿: 쓰이지 않는 종류 SCRIPT(통째 스크립트)는 저장할 수 없다', () => {
  assert.throws(() => saveTemplate({ name: 'x', kind: 'SCRIPT', os: 'Linux', content: 'echo' }), /템플릿 종류를 선택하세요/);
});

test('템플릿: COMMAND는 제품·항목을 저장하고 OS는 없으며, 형식이 틀리면 저장 거부', () => {
  const WEBTOB = seedContent('WEBTOB41-COMMAND-WEB_ENGINE_STATUS');
  const saved = saveTemplate({ name: 'WebtoB 4.1 엔진', kind: 'COMMAND', product: 'WebtoB', item: 'WEB_ENGINE_STATUS', os: 'Linux', content: WEBTOB });
  assert.equal(saved.product, 'WebtoB'); assert.equal(saved.item, 'WEB_ENGINE_STATUS'); assert.equal(saved.os, undefined);
  assert.throws(() => saveTemplate({ name: 'x', kind: 'COMMAND', product: 'WebtoB', item: 'WEB_ENGINE_STATUS', content: 'st\n' }), /@opsbox-tool/);
  assert.throws(() => saveTemplate({ name: 'x', kind: 'COMMAND', product: 'WebtoB', item: 'CPU', content: WEBTOB }), (e: any) => e.errors.some((x: any) => x.field === 'item'));
  assert.throws(() => saveTemplate({ name: 'x', kind: 'COMMAND', product: 'Oracle', item: 'WEB_ENGINE_STATUS', content: WEBTOB }), (e: any) => e.errors.some((x: any) => x.field === 'product'));
});

test('템플릿: COMMAND 경고는 응답에만 붙고 저장된 템플릿에는 없다', () => {
  const saved = saveTemplate({ name: '경고', kind: 'COMMAND', product: 'WebtoB', item: 'WEB_ENGINE_STATUS', content: '# @opsbox-tool x\n# @opsbox-args -Psecret\n# @opsbox-status Healthy ~ OK\nst\n' }) as any;
  assert.match(saved.warnings[0], /비밀번호/);
  assert.equal((getTemplate(saved.id) as any).warnings, undefined);
});

test('템플릿: WAS COMMAND(JEUS · WAS_ENGINE_STATUS)도 저장된다', () => {
  const JEUS = seedContent('JEUS6-COMMAND-WAS_ENGINE_STATUS');
  const saved = saveTemplate({ name: 'JEUS 6 엔진', kind: 'COMMAND', product: 'JEUS', item: 'WAS_ENGINE_STATUS', content: JEUS });
  assert.equal(saved.product, 'JEUS'); assert.equal(saved.item, 'WAS_ENGINE_STATUS');
});
