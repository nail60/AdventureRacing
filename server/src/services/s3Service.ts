import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { config } from '../config.js';

const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
  forcePathStyle: true,
});

const bucket = config.s3.bucket;

export async function putObject(key: string, body: Buffer | string): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: typeof body === 'string' ? Buffer.from(body) : body,
    ContentType: 'application/json',
  }));
}

export async function getObject(key: string): Promise<string> {
  const result = await s3.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }));
  return await result.Body!.transformToString();
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }));
}

export async function listObjects(prefix: string): Promise<string[]> {
  const result = await s3.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  }));
  return (result.Contents || []).map(obj => obj.Key!);
}

export async function deletePrefix(prefix: string): Promise<void> {
  const keys = await listObjects(prefix);
  await Promise.all(keys.map(key => deleteObject(key)));
}

export async function putRawFile(key: string, body: Buffer, contentType?: string): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
  }));
}
