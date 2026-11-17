export function validateProcesses(processes: ProcessCheck[]): ValidationResult<ProcessCheck[]> {
  const errors: ValidationError[] = [];

  const names = new Set<string>();

  processes.forEach((item, index) => {
    const name = item.name?.trim();

    if (!name) {
      errors.push({
        field: 'processes',
        index,
        message: '프로세스명이 비어있습니다.',
      });

      return;
    }

    const key = name.toLowerCase();

    if (names.has(key)) {
      errors.push({
        field: 'processes',
        index,
        message: `중복 프로세스: ${name}`,
      });

      return;
    }

    names.add(key);
  });

  return {
    valid: errors.length === 0,

    data: processes,

    errors,
  };
}

export function validateDirectories(directories: DirectoryCheck[]): ValidationResult<DirectoryCheck[]> {
  const errors: ValidationError[] = [];

  const paths = new Set<string>();

  directories.forEach((item, index) => {
    const path = item.path?.trim();

    if (!path) {
      errors.push({
        field: 'directories',
        index,
        message: '디렉토리 경로가 비어있습니다.',
      });

      return;
    }

    if (paths.has(path)) {
      errors.push({
        field: 'directories',
        index,
        message: `중복 디렉토리: ${path}`,
      });
    }

    paths.add(path);

    if (item.warningPercent < 0 || item.warningPercent > 100) {
      errors.push({
        field: 'directories',
        index,
        message: `${path} 경고 임계값은 0~100 사이여야 합니다.`,
      });
    }

    if (item.criticalPercent < 0 || item.criticalPercent > 100) {
      errors.push({
        field: 'directories',
        index,
        message: `${path} 위험 임계값은 0~100 사이여야 합니다.`,
      });
    }

    if (item.warningPercent >= item.criticalPercent) {
      errors.push({
        field: 'directories',
        index,
        message: `${path} 경고 임계값은 위험 임계값보다 작아야 합니다.`,
      });
    }
  });

  return {
    valid: errors.length === 0,

    data: directories,

    errors,
  };
}
