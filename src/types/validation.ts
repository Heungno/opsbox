export interface ValidationError {
  field: string;
  index?: number;
  message: string;
}

export interface ValidationResult<T> {
  valid: boolean;
  data: T;
  errors: ValidationError[];
}
