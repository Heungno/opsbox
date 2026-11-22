import fs from 'node:fs';
import path from 'node:path';

import { toTables } from '../features/common-codes/codec';
import { replaceTables } from '../features/common-codes/repository';
import type { CommonCodes } from '../features/common-codes/types';
import { upsertTemplate } from '../features/templates/repository';
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
}
