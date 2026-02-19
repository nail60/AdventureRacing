#!/usr/bin/env node
/**
 * Migrate S3 objects from local MinIO to Tigris.
 * Skips objects that already exist in destination.
 * Usage: node scripts/migrate-s3.mjs
 */
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const source = new S3Client({
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
  forcePathStyle: true,
});

const dest = new S3Client({
  endpoint: 'https://fly.storage.tigris.dev',
  region: 'auto',
  credentials: {
    accessKeyId: process.env.TIGRIS_ACCESS_KEY,
    secretAccessKey: process.env.TIGRIS_SECRET_KEY,
  },
  forcePathStyle: true,
});

const SRC_BUCKET = 'adventure-racing';
const DEST_BUCKET = 'adventure-racing-bucket';

async function listAllKeys() {
  const keys = [];
  let token;
  do {
    const res = await source.send(new ListObjectsV2Command({
      Bucket: SRC_BUCKET,
      ContinuationToken: token,
    }));
    for (const obj of res.Contents || []) keys.push(obj.Key);
    token = res.NextContinuationToken;
  } while (token);
  return keys;
}

async function exists(key) {
  try {
    await dest.send(new HeadObjectCommand({ Bucket: DEST_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function copyObject(key) {
  const get = await source.send(new GetObjectCommand({ Bucket: SRC_BUCKET, Key: key }));
  const body = await get.Body.transformToByteArray();
  await dest.send(new PutObjectCommand({
    Bucket: DEST_BUCKET,
    Key: key,
    Body: body,
    ContentType: get.ContentType || 'application/octet-stream',
  }));
}

const keys = await listAllKeys();
console.log(`Found ${keys.length} objects to migrate`);

let done = 0;
let skipped = 0;
// Copy one at a time to avoid getting stuck on parallel large files
for (const key of keys) {
  try {
    if (await exists(key)) {
      skipped++;
      done++;
      continue;
    }
    await copyObject(key);
    done++;
    console.log(`[${done}/${keys.length}] ${key}`);
  } catch (err) {
    console.error(`[${done}/${keys.length}] FAILED ${key}: ${err.message}`);
    done++;
  }
}

console.log(`Migration complete! ${done - skipped} copied, ${skipped} skipped (already existed)`);
