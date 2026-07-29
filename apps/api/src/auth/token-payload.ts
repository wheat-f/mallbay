export type TokenPayload = {
  sub: string;
  username: string;
  isAuditor: boolean;
  sessionId?: string;
};
