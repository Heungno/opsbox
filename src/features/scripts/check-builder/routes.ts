import type { FastifyInstance } from 'fastify';

import { POLICY_CATEGORIES, SCRIPT_OS } from '../../../shared/constants';
import { BadRequestError, ValidationError } from '../../../shared/errors';
import { recordAudit } from '../../audit/service';
import { generateLinuxPart, type BuilderRole } from './linux';
import { presetsFor } from './presets';
import { validateBuilderSpec } from './spec';
import { regenerateItem } from './templates';
import { BUILDER_LEVELS, BUILDER_TYPE_HELP, BUILDER_TYPE_LABELS, BUILDER_TYPES, type BuilderOs, type BuilderSpec } from './types';
import { generateWindowsPart } from './windows';
import { getPolicies } from '../../policies/service';
import { ok, requireObject } from '../../../shared/http';

/*
 * 점검 만들기 API
 *   GET  /check-builder/presets?os=Linux                       준비된 점검 목록 (명령 미리보기 포함)
 *   POST /check-builder/preview                                 저장하지 않고 생성될 스크립트 보기
 *   POST /policies/:policyId/items/:itemId/regenerate           폼 기준으로 스크립트 다시 만들기
 */
const OS_VALUES: readonly BuilderOs[] = SCRIPT_OS;
const ROLE_VALUES: readonly BuilderRole[] = POLICY_CATEGORIES;

function requireOs(value: unknown): BuilderOs {
  if (!OS_VALUES.includes(value as BuilderOs)) throw new BadRequestError('운영체제(Windows 또는 Linux)를 지정하세요.');
  return value as BuilderOs;
}

export async function checkBuilderRoutes(app: FastifyInstance) {
  // 점검 만들기 폼의 종류·판정 수준 이름 (화면에 따로 적지 않도록 여기서 내려줌)
  app.get('/check-builder/types', async () => ok({
    types: BUILDER_TYPES.map((value) => ({ value, label: BUILDER_TYPE_LABELS[value], help: BUILDER_TYPE_HELP[value] })),
    levels: BUILDER_LEVELS,
  }));

  app.get<{ Querystring: { os?: string } }>('/check-builder/presets', async (request) => ok(presetsFor(requireOs(request.query.os))));

  app.post<{ Body: { os?: unknown; role?: unknown; itemId?: unknown; itemName?: unknown; spec?: unknown } }>('/check-builder/preview', async (request) => {
    const body = requireObject<{ os?: unknown; role?: unknown; itemId?: unknown; itemName?: unknown; spec?: unknown }>(request.body);
    const os = requireOs(body.os);
    if (!ROLE_VALUES.includes(body.role as BuilderRole)) throw new BadRequestError('정책 유형(BASIC, WEB, WAS, DB)을 지정하세요.');
    const errors = validateBuilderSpec(body.spec, os, 'spec');
    if (errors.length) throw new ValidationError(errors);
    const args = {
      itemId: typeof body.itemId === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(body.itemId) ? body.itemId : 'PREVIEW',
      itemName: typeof body.itemName === 'string' && body.itemName.trim() ? body.itemName.trim().slice(0, 80) : '새 점검 항목',
      role: body.role as BuilderRole,
      spec: body.spec as BuilderSpec,
    };
    return ok({ content: os === 'Windows' ? generateWindowsPart(args) : generateLinuxPart(args) });
  });

  app.post<{ Params: { policyId: string; itemId: string } }>('/policies/:policyId/items/:itemId/regenerate', async (request) => {
    const template = regenerateItem(request.params.policyId, request.params.itemId);
    const item = getPolicies().find((policy) => policy.id === request.params.policyId)?.items.find((entry) => entry.id === request.params.itemId);
    recordAudit(request, { action: 'TEMPLATE_UPDATE', targetId: template.id, summary: `점검 만들기 스크립트 다시 만들기: ${item?.name ?? request.params.itemId}` });
    return ok(template);
  });
}
