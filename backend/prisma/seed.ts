import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function seedOwner() {
  const username = process.env.OWNER_USERNAME?.trim();
  const password = process.env.OWNER_PASSWORD;
  const name = process.env.OWNER_NAME?.trim();

  if (!username || !password || !name) {
    throw new Error('OWNER_NAME, OWNER_USERNAME, and OWNER_PASSWORD must be configured.');
  }

  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('OWNER_PASSWORD must be no more than 72 UTF-8 bytes.');
  }

  const passwordHash = await hash(password, 12);
  await prisma.user.upsert({
    where: { username },
    create: { name, username, passwordHash, role: UserRole.OWNER },
    update: { name, passwordHash, role: UserRole.OWNER },
  });
}

seedOwner()
  .catch((error: unknown) => {
    console.error('Failed to provision the owner account.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
