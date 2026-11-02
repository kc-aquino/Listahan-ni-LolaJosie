import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AccessTokenPayload } from './authenticated-user.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.trim() },
    });

    if (
      !user ||
      user.role !== UserRole.OWNER ||
      !(await compare(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Username or password is incorrect.');
    }

    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn: 3600,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
    };
  }
}
