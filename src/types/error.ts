export class AppError extends Error {
  constructor(
    public code: string,
    public status: number,
    public errors?: unknown[],
  ) {
    super(code);
  }
}

export class ValidationError extends AppError {
  constructor(errors: unknown[]) {
    super('VALIDATION_ERROR', 400, errors);
  }
}
