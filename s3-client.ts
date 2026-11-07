import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Resolve relative to this module, independent of the shell's working directory.
config({ path: fileURLToPath(new URL('./backend/.env', import.meta.url)), quiet: true });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || /[•]/.test(value)) throw new Error(`${name} is missing or contains a masked placeholder in backend/.env`);
  return value;
}

export function createStorageClient() {
  const endpoint = new URL(required('AWS_ENDPOINT_URL_S3'));
  if (endpoint.protocol !== 'https:') throw new Error('Storage endpoint must use HTTPS');
  return new S3Client({
    endpoint: endpoint.href,
    region: required('AWS_REGION'),
    credentials: {
      accessKeyId: required('AWS_ACCESS_KEY_ID'),
      secretAccessKey: required('AWS_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    maxAttempts: 2,
  });
}

export async function checkStorageConnection() {
  const client = createStorageClient();
  try {
    await client.send(new HeadBucketCommand({ Bucket: process.env.AWS_S3_BUCKET || 'assets' }));
    console.log('Connected to the configured Neon branch storage; bucket is accessible.');
  } finally {
    client.destroy();
  }
}

export async function uploadFile(key: string, body: string | Uint8Array) {
  const client = createStorageClient();
  const Bucket = process.env.AWS_S3_BUCKET || 'assets';
  try {
    await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body }));
    return await getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: 3600 });
  } finally {
    client.destroy();
  }
}
