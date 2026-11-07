import { checkStorageConnection } from './s3-client.js';

checkStorageConnection().catch((error: unknown) => {
  // Never print request objects, credentials, or signed URLs.
  const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  console.error(`Storage check failed: ${failure.name || 'Error'} (HTTP ${failure.$metadata?.httpStatusCode ?? 'unavailable'}).`);
  if (error instanceof Error && error.message.includes('backend/.env')) console.error(error.message);
  process.exitCode = 1;
});
