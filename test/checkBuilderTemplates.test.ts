import './helpers/env';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyBuiltInUpdates, db, readSetting, transaction, writeSetting } from '../src/db/database';
import { generatedTemplateId, isDetached, regenerateItem, upgradeGeneratedTemplates } from '../src/services/checkBuilder/templates';
import type { BuilderSpec } from '../src/services/checkBuilder/types';
import { getPolicies, savePolicy } from '../src/services/policyService';
import { deleteTemplate, getTemplateHistory, getTemplates, saveTemplate } from '../src/services/templateService';

/*
 * 점검 만들기: 정책 저장 시 생성 템플릿 만들기·고치기·지우기, 직접 편집 보호, 업그레이드
 */
const spec = (warning = 50): BuilderSpec => ({ version: 1, type: 'COMMAND_NUMBER', presetId: 'linux.swap', warning, critical: 80 });
const ITEM = 'CUSTOM_TPL0000000000001';
const basicPolicy = () => getPolicies().find((policy) => policy.id === 'linux-basic-default')!;
const template = (id: string) => getTemplates().find((entry) => entry.id === id);
const builderItem = (id: string, builder: BuilderSpec, name = 'Swap 사용률') => ({
  id, name, enabled: true, executor: { type: 'CHECK_BUILDER', options: { builder } }, inputs: [], result: { components: [{ type: 'SUMMARY' }] },
});
const saveWith = (items: unknown[], policy = basicPolicy()) => savePolicy({ ...policy, items: [...policy.items.filter((item) => !item.id.startsWith('CUSTOM_TPL')), ...items] } as any, policy.id);
const TEMPLATE_ID = 'GEN-CUSTOM_TPL0000000000001-LINUX';

test('트랜잭션은 중첩해 쓸 수 있고 안쪽 실패는 바깥까지 되돌린다', () => {
  assert.throws(() => transaction(() => {
    writeSetting('nested_test', 1);
    transaction(() => writeSetting('nested_test', 2));
    throw new Error('rollback');
  }), /rollback/);
  assert.equal(readSetting('nested_test'), undefined);
  transaction(() => transaction(() => writeSetting('nested_test', 3)));
  assert.equal(readSetting('nested_test'), 3);
});

test('점검 만들기 항목을 저장하면 정책 OS용 생성 템플릿을 만들고 항목에 연결한다', () => {
  const saved = saveWith([builderItem(ITEM, spec())]);
  const item = saved.items.find((entry) => entry.id === ITEM)!;
  assert.equal(generatedTemplateId(ITEM, 'Linux'), TEMPLATE_ID);
  assert.equal(item.executor.templateId, TEMPLATE_ID);
  assert.deepEqual(item.result.components.map((component) => component.type), ['SUMMARY', 'TABLE', 'CONSOLE'], '결과 표시는 폼 유형으로 정함');
  const created = template(TEMPLATE_ID)!;
  assert.equal(created.generated?.itemId, ITEM);
  assert.equal(created.generated?.by, 'CHECK_BUILDER');
  assert.equal(created.item, ITEM);
  assert.equal(created.os, 'Linux');
  assert.equal(created.name, '점검 만들기 · Swap 사용률');
  assert.match(created.content, /opsbox_cb1_item_CUSTOM_TPL0000000000001/);
  assert.equal(isDetached(created), false);
});

test('기준값을 바꿔 다시 저장하면 같은 템플릿 내용이 바뀌고 이력이 남는다', () => {
  const before = template(TEMPLATE_ID)!.content;
  saveWith([builderItem(ITEM, spec(60))]);
  const after = template(TEMPLATE_ID)!;
  assert.notEqual(after.content, before);
  assert.match(after.content, /'60'/);
  assert.equal(getTemplateHistory(TEMPLATE_ID).length, 1);
});

test('잘못된 폼 데이터는 저장하지 않는다', () => {
  assert.throws(() => saveWith([builderItem(ITEM, { ...spec(), warning: 90 })]), (error: any) => error.errors?.[0]?.field === 'items.10.executor.options.builder.warning');
});

test('스크립트 관리에서 고친 생성 템플릿은 자동 생성 정보가 남고 직접 편집으로 판단해 덮어쓰지 않는다', () => {
  const current = template(TEMPLATE_ID)!;
  saveTemplate({ ...current, content: `${current.content}\n# 수정`, generated: undefined } as any, TEMPLATE_ID);
  const edited = template(TEMPLATE_ID)!;
  assert.equal(edited.generated?.itemId, ITEM);
  assert.equal(isDetached(edited), true);
  saveWith([builderItem(ITEM, spec(65))]);
  assert.match(template(TEMPLATE_ID)!.content, /# 수정$/);
});

test('일반 템플릿에 가짜 자동 생성 정보를 넣어 저장해도 무시한다', () => {
  const saved = saveTemplate({ name: '일반', kind: 'SCRIPT_PART', os: 'Linux', item: 'CPU', enabled: true, content: 'echo', generated: { by: 'CHECK_BUILDER', generatorVersion: 1, itemId: ITEM, contentSha256: 'x' } } as any);
  assert.equal(template(saved.id)!.generated, undefined);
  deleteTemplate(saved.id);
});

test('다시 만들기는 직접 편집 여부와 관계없이 폼 기준으로 되돌린다', () => {
  const regenerated = regenerateItem('linux-basic-default', ITEM);
  assert.equal(isDetached(regenerated), false);
  assert.doesNotMatch(regenerated.content, /# 수정$/);
  assert.match(regenerated.content, /'65'/);
});

test('정책 항목에 연결된 생성 템플릿은 스크립트 관리에서 지울 수 없다', () => {
  assert.throws(() => deleteTemplate(TEMPLATE_ID), (error: any) => error.status === 409);
});

test('정책에서 항목을 지우면 생성 템플릿도 지운다', () => {
  saveWith([]);
  assert.equal(template(TEMPLATE_ID), undefined);
});

test('DB 정책에서도 점검 만들기를 쓸 수 있고, 기본 정책의 DB 쿼리는 여전히 거부한다', () => {
  const dbPolicy = getPolicies().find((policy) => policy.id === 'linux-db-default')!;
  savePolicy({ ...dbPolicy, items: [...dbPolicy.items, builderItem('CUSTOM_TPL0000000000002', { version: 1, type: 'FILE_FRESHNESS', presetId: null, maxAgeHours: 24 }, '설정 백업')] } as any, dbPolicy.id);
  assert.ok(template('GEN-CUSTOM_TPL0000000000002-LINUX'));
  assert.throws(() => saveWith([{ id: 'CUSTOM_TPL0000000000003', name: 'q', enabled: true, executor: { type: 'SQL_QUERY' }, inputs: [], result: { components: [{ type: 'SUMMARY' }] } }]));
});

test('기존 DB 공통코드에 점검 만들기 실행 방식이 없으면 한 번만 채운다', () => {
  const codes = readSetting<any>('common_codes');
  writeSetting('common_codes', { ...codes, policyExecutors: codes.policyExecutors.filter((code: any) => code.value !== 'CHECK_BUILDER') });
  db.prepare("DELETE FROM settings WHERE key = 'migration_executor_codes_v1'").run();
  applyBuiltInUpdates();
  assert.ok(readSetting<any>('common_codes').policyExecutors.some((code: any) => code.value === 'CHECK_BUILDER'));
  // 이미 적용한 뒤 사용자가 지운 코드는 되살리지 않음
  const again = readSetting<any>('common_codes');
  writeSetting('common_codes', { ...again, policyExecutors: again.policyExecutors.filter((code: any) => code.value !== 'CHECK_BUILDER') });
  applyBuiltInUpdates();
  assert.equal(readSetting<any>('common_codes').policyExecutors.some((code: any) => code.value === 'CHECK_BUILDER'), false);
  writeSetting('common_codes', again);
});

test('생성기 버전이 낮은 고치지 않은 생성 템플릿은 다시 만들고, 직접 편집한 것은 그대로 둔다', () => {
  saveWith([builderItem(ITEM, spec())]);
  const old = template(TEMPLATE_ID)!;
  const raw = (id: string) => JSON.parse((db.prepare('SELECT data FROM templates WHERE id = ?').get(id) as { data: string }).data);
  const setRaw = (id: string, value: unknown) => db.prepare('UPDATE templates SET data = ? WHERE id = ?').run(JSON.stringify(value), id);
  setRaw(TEMPLATE_ID, { ...raw(TEMPLATE_ID), generated: { ...old.generated, generatorVersion: 0 } });
  assert.deepEqual(upgradeGeneratedTemplates(), [TEMPLATE_ID]);
  assert.equal(template(TEMPLATE_ID)!.generated?.generatorVersion, 1);

  const detached = { ...raw(TEMPLATE_ID), content: `${old.content}\n# 손댐` };
  setRaw(TEMPLATE_ID, { ...detached, generated: { ...detached.generated, generatorVersion: 0 } });
  assert.deepEqual(upgradeGeneratedTemplates(), []);
  assert.match(template(TEMPLATE_ID)!.content, /# 손댐$/);
});
