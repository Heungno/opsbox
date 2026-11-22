/** 공통코드(common_codes)에서 관리하는 값. 화면에서 추가·변경할 수 있어 문자열로 둡니다. */
export type CommonCodeValue = string;

export interface CommonCode {
  value: CommonCodeValue;
  label: string;
  enabled?: boolean;
  sortOrder?: number;
  [key: string]: unknown;
}

export interface CommonCodeMeta {
  enabled?: boolean;
  sortOrder?: number;
}

export interface CommonCodes {
  serverRoles: CommonCode[];
  operatingSystems: CommonCode[];
  productsByRole: Record<string, string[]>;
  portProtocols: CommonCode[];
  templateKinds: CommonCode[];
  scriptItems: CommonCode[];
  rolePolicies: Record<string, string[]>;
  healthStatuses: CommonCode[];
  policyCategories: CommonCode[];
  policyExecutors: CommonCode[];
  resultViews: CommonCode[];
  /** 화면에서 지정한 사용 여부·정렬 순서 (키: `분류::그룹::코드`) */
  _codeMeta?: Record<string, CommonCodeMeta>;
}
