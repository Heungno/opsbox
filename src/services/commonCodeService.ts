import fs from 'fs';

const FILE = 'data/common-codes.json';

export interface CommonCode { value: string; label: string; [key: string]: unknown }
export interface CommonCodes {
  serverRoles: CommonCode[];
  operatingSystems: CommonCode[];
  productsByRole: Record<string, string[]>;
  portProtocols: CommonCode[];
  templateKinds: CommonCode[];
  scriptItems: CommonCode[];
}

export function getCommonCodes(): CommonCodes {
  return JSON.parse(fs.readFileSync(FILE, 'utf8')) as CommonCodes;
}
