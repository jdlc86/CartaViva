export function createStaffGatewayAuth({getAccessToken, cookieSession}, {
  invalid, unavailable, minimum = 16
}) {
  const useBearer = typeof getAccessToken === 'function';
  if (cookieSession === true ? getAccessToken !== undefined : !useBearer)
    throw Error(invalid);
  return Object.freeze({
    credentials: cookieSession ? 'same-origin' : 'omit',
    async headers(initial) {
      const headers = new Headers(initial);
      headers.delete('Authorization');
      if (!cookieSession) {
        const token = await getAccessToken();
        if (typeof token !== 'string' || token.length < minimum ||
            token.length > 16384 || /[^A-Za-z0-9._~-]/.test(token))
          throw unavailable();
        headers.set('Authorization', 'Bearer ' + token);
      }
      return headers;
    }
  });
}
