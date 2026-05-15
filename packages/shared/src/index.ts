export type AuthUser = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  wechatOpenId: string | null;
  alipayUserId: string | null;
  role: "CUSTOMER" | "STAFF";
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = AuthTokens & {
  user: AuthUser;
};

/** identifier 可以是 username 或已绑定的 email / phone */
export type LoginPayload = {
  identifier: string;
  password: string;
};

export type RegisterPayload = {
  username: string;
  password: string;
};

export type UpdateProfilePayload = {
  nickname?: string;
};

export type ChangePasswordPayload = {
  oldPassword: string;
  newPassword: string;
};

export type BindEmailPayload = {
  email: string;
};

export type BindPhonePayload = {
  phone: string;
};
