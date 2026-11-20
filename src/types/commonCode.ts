/** Values loaded from the editable common-codes.json registry. */
export type CommonCodeValue = string;

export interface CommonCode {
  value: CommonCodeValue;
  label: string;
  [key: string]: unknown;
}
