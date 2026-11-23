import fs from 'node:fs';
import path from 'node:path';

import { fromTables, toTables } from '../features/common-codes/codec';
import { readTables, replaceTables } from '../features/common-codes/repository';
import type { CommonCodes } from '../features/common-codes/types';
import { findPolicy, upsertPolicy } from '../features/policies/repository';
import type { Policy } from '../features/policies/types';
import { findTemplate, upsertTemplate } from '../features/templates/repository';
import { SCHEMA_VERSION } from './schema';
import type { ManagedTemplate } from '../features/templates/types';

/*
 * 빈 DB에 넣는 기본값 (seeds/*.json). 새로 만든 DB에서 한 번만 실행합니다.
 * 사용자가 지운 기본값은 다시 넣지 않습니다(다시 시작해도 실행되지 않음).
 * 서비스가 아니라 저장소(repository)와 변환 함수만 써서, 서비스 → db → seed → 서비스 순환을 피합니다.
 */
export const SEED_DIR = path.join(process.cwd(), 'seeds');

export function readSeed<T>(fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, fileName), 'utf8').replace(/^﻿/, '')) as T;
}

export function seedNewDatabase() {
  replaceTables(toTables(readSeed<CommonCodes>('common-codes.json')));
  readSeed<ManagedTemplate[]>('templates.json').forEach(upsertTemplate);
  readSeed<{ policies: Policy[] }>('policy.json').policies.forEach(upsertPolicy);
}

type SeedCode = { category: 'templateKinds' | 'scriptItems'; value: string } | { category: 'rolePolicies'; group: string; value: string };

/** 버전 N으로 올라갈 때 기존 DB에 더할 기본값 ID. 이미 있는 ID는 건드리지 않음 */
export const SEED_UPGRADES: Record<number, { templates: string[]; policyItems: Array<{ policyId: string; itemId: string }>; codes: SeedCode[] }> = {
  3: {
    templates: ['WEBTOB41-COMMAND-WEB_ENGINE_STATUS', 'JEUS6-COMMAND-WAS_ENGINE_STATUS', 'LINUX-PART-COMMAND_RUNNER', 'WINDOWS-PART-COMMAND_RUNNER'],
    policyItems: [{ policyId: 'linux-was-default', itemId: 'WAS_ENGINE_STATUS' }, { policyId: 'windows-was-default', itemId: 'WAS_ENGINE_STATUS' }],
    codes: [
      { category: 'templateKinds', value: 'COMMAND' },
      { category: 'scriptItems', value: 'WAS_ENGINE_STATUS' },
      { category: 'scriptItems', value: 'COMMAND_RUNNER' },
      { category: 'rolePolicies', group: 'WAS', value: 'WAS_ENGINE_STATUS' },
    ],
  },
};

/** 같은 ID가 없을 때만 더합니다(사용자가 고치거나 지운 것은 그대로, 지운 건 다시 올릴 때만 되살아남). seeds에 없는 ID는 건너뜁니다. */
export function upgradeSeeds(fromVersion: number) {
  const seedTemplates = readSeed<ManagedTemplate[]>('templates.json');
  const seedPolicies = readSeed<{ policies: Policy[] }>('policy.json').policies;
  const seedCodes = readSeed<Record<string, unknown>>('common-codes.json');
  for (let version = fromVersion + 1; version <= SCHEMA_VERSION; version++) {
    const upgrade = SEED_UPGRADES[version];
    if (!upgrade) continue;

    for (const id of upgrade.templates) {
      const seed = seedTemplates.find((template) => template.id === id);
      if (seed && !findTemplate(id)) upsertTemplate(seed);
    }

    for (const { policyId, itemId } of upgrade.policyItems) {
      const seedItems = seedPolicies.find((policy) => policy.id === policyId)?.items;
      const seedIndex = seedItems?.findIndex((item) => item.id === itemId) ?? -1;
      const policy = findPolicy(policyId);
      if (!seedItems || seedIndex < 0 || !policy || policy.items.some((item) => item.id === itemId)) continue;
      // seeds의 앞 항목 바로 다음에 넣습니다(앞 항목이 없으면 맨 앞)
      const afterId = seedItems[seedIndex - 1]?.id;
      const at = afterId === undefined ? 0 : policy.items.findIndex((item) => item.id === afterId) + 1;
      upsertPolicy({ ...policy, items: [...policy.items.slice(0, at), seedItems[seedIndex], ...policy.items.slice(at)] });
    }

    addMissingCodes(upgrade.codes, seedCodes);
  }
}

/** 공통코드는 seeds 문서에서 같은 분류의 위치를 따라, 없는 값만 더합니다. */
function addMissingCodes(wanted: SeedCode[], seedCodes: Record<string, unknown>) {
  if (!wanted.length) return;
  const codes = fromTables(readTables()) as unknown as Record<string, unknown>;
  const valueOf = (entry: unknown) => (typeof entry === 'string' ? entry : (entry as { value: string }).value);
  for (const code of wanted) {
    const target = (code.category === 'rolePolicies' ? (codes.rolePolicies as Record<string, unknown[]> | undefined)?.[code.group] : codes[code.category]) as unknown[] | undefined;
    const source = (code.category === 'rolePolicies' ? (seedCodes.rolePolicies as Record<string, unknown[]>)[code.group] : seedCodes[code.category]) as unknown[] | undefined;
    if (!target || !source || target.some((entry) => valueOf(entry) === code.value)) continue;
    const seedIndex = source.findIndex((entry) => valueOf(entry) === code.value);
    if (seedIndex < 0) continue;
    const afterValue = seedIndex > 0 ? valueOf(source[seedIndex - 1]) : undefined;
    const at = afterValue === undefined ? 0 : target.findIndex((entry) => valueOf(entry) === afterValue) + 1;
    target.splice(at, 0, source[seedIndex]);
  }
  replaceTables(toTables(codes as unknown as CommonCodes));
}
