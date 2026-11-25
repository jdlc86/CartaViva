export type StaffGatewayAuth =
  | {getAccessToken: () => Promise<string>; cookieSession?: never}
  | {getAccessToken?: never; cookieSession: true};
