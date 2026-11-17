import { FastifyReply } from 'fastify';

import { AppError } from '../types/error';

export function handleError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    reply.code(error.status);

    return {
      success: false,

      code: error.code,

      errors: error.errors,
    };
  }

  console.error(error);

  reply.code(500);

  return {
    success: false,

    code: 'INTERNAL_ERROR',

    message: '서버 처리 중 오류가 발생했습니다.',
  };
}
