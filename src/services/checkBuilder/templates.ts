import { createHash } from 'node:crypto';

import { BadRequestError, NotFoundError } from '../../shared/errors';
import type { Policy, PolicyItem } from '../../features/policies/types';
import type { ManagedTemplate } from '../../features/templates/types';
import { getPolicies } from '../../features/policies/service';
import { deleteGeneratedTemplate, getTemplates, saveGeneratedTemplate } from '../../features/templates/service';
import { generateLinuxPart, type BuilderRole } from './linux';
import { GENERATOR_VERSION } from './literal';
import type { BuilderOs, BuilderSpec } from './types';
import { generateWindowsPart } from './windows';

/*
 * 점검 만들기: 정책 항목 ↔ 생성 템플릿 동기화
 *
 * 정책을 저장하면 점검 만들기 항목마다 GEN-<항목ID>-<WINDOWS|LINUX> 템플릿을 만들거나 고치고,
 * 정책에서 빠진 항목의 템플릿은 지웁니다. 직접 편집된 템플릿(생성 당시 내용 해시와 다름)은 덮어쓰지 않습니다.
 */

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export function generatedTemplateId(itemId: string, os: BuilderOs): string {
  return `GEN-${itemId}-${os.toUpperCase()}`;
}

export function isDetached(template: ManagedTemplate): boolean {
  return !!template.generated && sha256(template.content) !== template.generated.contentSha256;
}

const isBuilderItem = (item: PolicyItem) => item.executor?.type === 'CHECK_BUILDER';
const builderSpec = (item: PolicyItem) => item.executor.options?.builder as BuilderSpec;

/** 정책 항목 하나의 생성 템플릿 (내용만 만들고 저장은 하지 않음) */
function buildTemplate(policy: Policy, item: PolicyItem): ManagedTemplate {
  const os = policy.os as BuilderOs;
  const args = { itemId: item.id, itemName: item.name, role: policy.category as BuilderRole, spec: builderSpec(item) };
  const content = os === 'Windows' ? generateWindowsPart(args) : generateLinuxPart(args);
  return {
    id: generatedTemplateId(item.id, os), name: `점검 만들기 · ${item.name}`, kind: 'SCRIPT_PART', os, item: item.id,
    usesQueryTemplate: false, enabled: true, content, updatedAt: new Date().toISOString(),
    generated: { by: 'CHECK_BUILDER', generatorVersion: GENERATOR_VERSION, itemId: item.id, contentSha256: sha256(content) },
  };
}

export function syncGeneratedTemplates(before: Policy | undefined, after: Policy | undefined) {
  const result = { created: [] as string[], updated: [] as string[], kept: [] as string[], deleted: [] as string[] };
  const existing = new Map(getTemplates().map((template) => [template.id, template]));
  const wanted = new Set<string>();
  for (const item of (after?.items ?? []).filter(isBuilderItem)) {
    const next = buildTemplate(after!, item);
    wanted.add(next.id);
    const current = existing.get(next.id);
    if (!current) {
      saveGeneratedTemplate(next);
      result.created.push(next.id);
    } else if (isDetached(current)) {
      result.kept.push(next.id);
    } else if (current.content !== next.content || current.name !== next.name || current.generated?.generatorVersion !== GENERATOR_VERSION) {
      saveGeneratedTemplate({ ...next, enabled: current.enabled });
      result.updated.push(next.id);
    }
  }
  for (const item of (before?.items ?? []).filter(isBuilderItem)) {
    const id = generatedTemplateId(item.id, before!.os as BuilderOs);
    if (wanted.has(id) || !existing.has(id)) continue;
    deleteGeneratedTemplate(id);
    result.deleted.push(id);
  }
  return result;
}

/** 폼 기준으로 다시 만들기 (직접 편집 여부와 관계없이, 이전 내용은 이력) */
export function regenerateItem(policyId: string, itemId: string): ManagedTemplate {
  const policy = getPolicies().find((entry) => entry.id === policyId);
  if (!policy) throw new NotFoundError(`점검 정책을 찾을 수 없습니다: ${policyId}`);
  const item = policy.items.find((entry) => entry.id === itemId);
  if (!item) throw new NotFoundError(`점검 항목을 찾을 수 없습니다: ${itemId}`);
  if (!isBuilderItem(item)) throw new BadRequestError('점검 만들기 항목만 다시 만들 수 있습니다.');
  const current = getTemplates().find((template) => template.id === generatedTemplateId(item.id, policy.os as BuilderOs));
  return saveGeneratedTemplate({ ...buildTemplate(policy, item), enabled: current?.enabled ?? true });
}

/** 앱 시작 시: 생성기 버전이 낮고 직접 편집되지 않은 생성 템플릿을 다시 만듭니다. */
export function upgradeGeneratedTemplates(): string[] {
  const templates = new Map(getTemplates().map((template) => [template.id, template]));
  const upgraded: string[] = [];
  for (const policy of getPolicies()) {
    for (const item of policy.items.filter(isBuilderItem)) {
      const current = templates.get(generatedTemplateId(item.id, policy.os as BuilderOs));
      if (!current?.generated || current.generated.generatorVersion >= GENERATOR_VERSION || isDetached(current)) continue;
      saveGeneratedTemplate({ ...buildTemplate(policy, item), enabled: current.enabled });
      upgraded.push(current.id);
    }
  }
  return upgraded;
}
