import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from './errors';
import type { ApiFailure, ErrorCode, FieldError } from './api-types';

/*
 * 전역 에러 처리
 *
 * - /api/* 요청은 항상 JSON(ApiFailure)으로 응답합니다.
 * - 업무 오류(AppError)는 상태코드·메시지를 그대로 전달합니다.
 * - Fastify 요청 처리 오류(잘못된 JSON, 너무 큰 요청 등)는 4xx와 한국어 메시지로 바꿉니다.
 * - 그 밖의 예외는 500으로 응답하고 내부 메시지 대신 requestId를 돌려줍니다 (로그에서 추적).
 */

const STATUS_DEFAULTS: Record<number, { code: ErrorCode; message: string }> = {
  400: { code: 'BAD_REQUEST', message: '요청 형식이 올바르지 않습니다.' },
  401: { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' },
  403: { code: 'FORBIDDEN', message: '권한이 없습니다.' },
  404: { code: 'NOT_FOUND', message: '요청한 항목을 찾을 수 없습니다.' },
  405: { code: 'METHOD_NOT_ALLOWED', message: '지원하지 않는 요청 방식입니다.' },
  409: { code: 'CONFLICT', message: '현재 상태에서 처리할 수 없는 요청입니다.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: '요청 데이터가 너무 큽니다.' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: '지원하지 않는 요청 형식입니다. JSON으로 보내 주세요.' },
};

/** Fastify 내부 오류 코드별 안내 메시지 */
const FASTIFY_MESSAGES: Record<string, string> = {
  FST_ERR_CTP_INVALID_JSON_BODY: '요청 본문이 올바른 JSON이 아닙니다.',
  FST_ERR_CTP_EMPTY_JSON_BODY: '요청 본문이 비어 있습니다.',
  FST_ERR_CTP_BODY_TOO_LARGE: '요청 데이터가 너무 큽니다.',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: '지원하지 않는 요청 형식입니다. JSON으로 보내 주세요.',
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: '요청 길이 정보가 올바르지 않습니다.',
};

function isApiRequest(request: FastifyRequest) {
  return request.url === '/api' || request.url.startsWith('/api/') || request.url.startsWith('/api?');
}

export function toApiFailure(error: unknown, request: FastifyRequest): { status: number; body: ApiFailure } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { success: false, code: error.code, message: error.message, ...(error.errors?.length ? { errors: error.errors } : {}) },
    };
  }

  const fastifyError = error as Partial<FastifyError> & { validation?: Array<{ instancePath?: string; message?: string }> };

  // 라우트 스키마 검증 실패
  if (fastifyError.validation) {
    const errors: FieldError[] = fastifyError.validation.map((item) => ({
      field: (item.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.') || 'body',
      message: item.message ?? '값이 올바르지 않습니다.',
    }));
    return { status: 400, body: { success: false, code: 'VALIDATION_ERROR', message: '입력값을 확인하세요.', errors } };
  }

  // Fastify가 지정한 4xx (본문 파싱 실패 등)
  const status = Number(fastifyError.statusCode);
  if (status >= 400 && status < 500) {
    const defaults = STATUS_DEFAULTS[status] ?? STATUS_DEFAULTS[400];
    const message = (fastifyError.code && FASTIFY_MESSAGES[fastifyError.code]) || defaults.message;
    return { status, body: { success: false, code: defaults.code, message } };
  }

  // 예상하지 못한 오류
  return {
    status: 500,
    body: {
      success: false,
      code: 'INTERNAL_ERROR',
      message: '서버 처리 중 오류가 발생했습니다. 문제가 계속되면 관리자에게 요청 ID를 알려 주세요.',
      requestId: String(request.id),
    },
  };
}

function sendFailure(reply: FastifyReply, request: FastifyRequest, status: number, body: ApiFailure) {
  if (isApiRequest(request)) return reply.code(status).type('application/json; charset=utf-8').send(body);
  // 화면(HTML) 요청: 간단한 안내 문구
  return reply.code(status).type('text/plain; charset=utf-8').send(`${body.message}${body.requestId ? ` (요청 ID: ${body.requestId})` : ''}`);
}

export function registerErrorHandlers(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const { status, body } = toApiFailure(error, request);
    if (status >= 500) request.log.error({ err: error }, '요청 처리 중 오류');
    else request.log.warn({ errorCode: body.code, statusCode: status }, `요청 오류 (${status} ${body.code}): ${body.message}`);
    return sendFailure(reply, request, status, body);
  });

  app.setNotFoundHandler((request, reply) => {
    const message = isApiRequest(request) ? `요청한 API를 찾을 수 없습니다: ${request.method} ${request.url.split('?')[0]}` : '페이지를 찾을 수 없습니다.';
    return sendFailure(reply, request, 404, { success: false, code: 'NOT_FOUND', message });
  });
}
