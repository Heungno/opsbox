import type { FieldError } from './api';

export type { FieldError } from './api';

export interface ValidationResult<T> {
  valid: boolean;
  data: T;
  errors: FieldError[];
}
