import { UnauthorizedException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Lola Josie',
    username: 'lola',
    role: 'OWNER' as const,
    passwordHash: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
  };
  const jwtService = {
    signAsync: vi.fn(),
  };
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(prisma as never, jwtService as never);
  });

  it('returns a bearer token and safe user details for valid credentials', async () => {
    const passwordHash = await hash('correct-horse-battery', 4);
    prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash });
    jwtService.signAsync.mockResolvedValue('signed-token');

    const result = await service.login(' lola ', 'correct-horse-battery');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { username: 'lola' } });
    expect(result).toEqual({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: 'OWNER',
      },
    });
  });

  it('rejects unknown usernames without issuing a token', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.login('missing', 'password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password', async () => {
    const passwordHash = await hash('another-password', 4);
    prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash });

    await expect(service.login('lola', 'wrong-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});
