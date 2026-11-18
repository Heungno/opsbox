import { DirectoryCheck, FileCheck, PortCheck, ProcessCheck } from '../types/server';
import { ValidationError, ValidationResult } from '../types/validation';

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
export function validateFileChecks(fileChecks: FileCheck[]): ValidationResult<FileCheck[]> {
  const errors: ValidationError[] = [];
  const paths = new Set<string>();

  fileChecks.forEach((item, index) => {
    const filePath = item.path?.trim();
    if (!filePath) {
      errors.push({ field: 'fileChecks', index, message: '파일 경로가 비어있습니다.' });
      return;
    }
    const key = filePath.toLowerCase();
    if (paths.has(key)) errors.push({ field: 'fileChecks', index, message: `중복 파일 경로: ${filePath}` });
    paths.add(key);
    if (!Number.isFinite(item.warningSizeMB) || item.warningSizeMB <= 0) {
      errors.push({ field: 'fileChecks', index, message: `${filePath} 경고 크기는 0보다 커야 합니다.` });
    }
    if (!Number.isFinite(item.criticalSizeMB) || item.criticalSizeMB <= 0) {
      errors.push({ field: 'fileChecks', index, message: `${filePath} 위험 크기는 0보다 커야 합니다.` });
    }
    if (item.warningSizeMB >= item.criticalSizeMB) {
      errors.push({ field: 'fileChecks', index, message: `${filePath} 경고 크기는 위험 크기보다 작아야 합니다.` });
    }
  });
  return { valid: errors.length === 0, data: fileChecks, errors };
}

export function validatePorts(ports: PortCheck[]): ValidationResult<PortCheck[]> {
  const errors: ValidationError[] = [];
  const endpoints = new Set<string>();

  ports.forEach((item, index) => {
    const protocol = (item.protocol ?? 'TCP').toUpperCase();
    if (!Number.isInteger(item.port) || item.port < 1 || item.port > 65535) {
      errors.push({ field: 'ports', index, message: '포트 번호는 1~65535 사이의 정수여야 합니다.' });
      return;
    }
    if (protocol !== 'TCP' && protocol !== 'UDP') {
      errors.push({ field: 'ports', index, message: `${item.port} 포트의 프로토콜은 TCP 또는 UDP여야 합니다.` });
      return;
    }
    const key = `${protocol}:${item.port}`;
    if (endpoints.has(key)) errors.push({ field: 'ports', index, message: `중복 포트 점검: ${protocol}/${item.port}` });
    endpoints.add(key);
  });

  return { valid: errors.length === 0, data: ports, errors };
}
