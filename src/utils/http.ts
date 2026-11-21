import { BadRequestError } from '../errors';
import type { ApiSuccess } from '../types/api';

/** 성공 응답 { success: true, data, ...meta } */
export function ok<T>(data: T): ApiSuccess<T>;
export function ok<T, Meta extends object>(data: T, meta: Meta): ApiSuccess<T, Meta>;
export function ok<T, Meta extends object>(data: T, meta?: Meta) {
  return { success: true as const, data, ...(meta ?? {}) };
}

/** 요청 본문이 JSON 객체인지 확인합니다. (배열·문자열·빈 본문이면 400) */
export function requireObject<T extends object = Record<string, unknown>>(body: unknown, message = '요청 본문은 JSON 객체여야 합니다.'): T {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestError(message);
  return body as T;
}

/** 경로 파라미터 등 필수 문자열 확인 */
export function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestError(`${field} 값이 필요합니다.`);
  return value;
}
