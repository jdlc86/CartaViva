// Pure customer profile input boundary. Authentication and ID issuance belong to the server.
export function normalizeCustomerProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'invalid_profile' };
  const { alias, company } = input;
  if (typeof alias !== 'string' || (company != null && typeof company !== 'string')) return { error: 'invalid_profile' };
  const normalizedAlias = alias.trim().normalize('NFC');
  const normalizedCompany = company == null ? null : company.trim().normalize('NFC') || null;
  if (!normalizedAlias || [...normalizedAlias].length > 80 ||
      (normalizedCompany != null && [...normalizedCompany].length > 160) ||
      /[\u0000-\u001f\u007f]/u.test(normalizedAlias) ||
      (normalizedCompany != null && /[\u0000-\u001f\u007f]/u.test(normalizedCompany))) {
    return { error: 'invalid_profile' };
  }
  return { alias: normalizedAlias, company: normalizedCompany };
}

// Explicitly do not accept client-provided IDs, employee numbers, roles or credentials.
export function normalizeCustomerRegistration(input) {
  const profile = normalizeCustomerProfile(input);
  if (profile.error) return profile;
  if (Object.keys(input).some(key => !['alias', 'company'].includes(key))) return { error: 'invalid_profile' };
  return profile;
}
