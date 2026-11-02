import type { UserRole } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
};

export type AccessTokenPayload = {
  sub: string;
  role: UserRole;
};
