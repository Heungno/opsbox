import type { FieldError } from './api-types';

export type { FieldError } from './api-types';

export interface ValidationResult<T> {
  valid: boolean;
  data: T;
  errors: FieldError[];
}
