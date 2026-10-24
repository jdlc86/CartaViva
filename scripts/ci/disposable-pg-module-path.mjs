import {tmpdir} from 'node:os';
import {isAbsolute, relative, resolve, sep} from 'node:path';

// Accept only the exact pg package installed below an OS temporary directory
// created by mktemp. This keeps the disposable harness portable between the
// Linux GitHub runner and local Windows Git Bash without widening its target.
export function isDisposablePgModulePath(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  const pathFromTemp = relative(resolve(tmpdir()), resolve(value));
  if (pathFromTemp === '' || isAbsolute(pathFromTemp) ||
      pathFromTemp === '..' || pathFromTemp.startsWith(`..${sep}`)) return false;
  const parts = pathFromTemp.split(sep);
  return parts.length === 3 && /^tmp[._-][A-Za-z0-9._-]+$/.test(parts[0]) &&
    parts[1] === 'node_modules' && parts[2] === 'pg';
}
