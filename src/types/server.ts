export interface ProcessCheck {
  name: string;
}

export interface DirectoryCheck {
  path: string;

  warningPercent: number;
  criticalPercent: number;
}

export interface Server {
  id: string;
  name: string;

  type: string;
  os: string;

  ip: string;

  sharedPath: string;

  processes: ProcessCheck[];

  directories: DirectoryCheck[];
}
