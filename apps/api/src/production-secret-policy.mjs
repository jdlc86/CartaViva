const UNSAFE_MARKER = /(?:^|[^a-z0-9])(?:change[-_ ]?me|dummy|example|fixture|inject(?:[-_ a-z0-9]{0,32})?runtime|local[-_ ]?test|placeholder|sample|test[-_ ]?secret)(?:[^a-z0-9]|$)/i;

export function isUnsafeProductionSecret(value) {
  return typeof value !== 'string' || value.length < 16 || value.length > 16384 ||
    value !== value.trim() || /[\0\r\n]/.test(value) || UNSAFE_MARKER.test(value);
}

export function hasUnsafeProductionDatabaseEndpoint({ host, database, ca } = {}) {
  return typeof host !== 'string' || /(?:^|\.)(?:localhost|example|invalid|test)$/i.test(host) ||
    /(?:inject|placeholder|fixture|example)/i.test(host) ||
    typeof database !== 'string' || /(?:example|fixture|placeholder|inject|test[-_ ]?db)/i.test(database) ||
    typeof ca !== 'string' || /(?:EXAMPLE|FIXTURE|PLACEHOLDER|INJECT|TEST CERTIFICATE)/i.test(ca);
}
