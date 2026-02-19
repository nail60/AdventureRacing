import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  database: {
    path: process.env.DATABASE_PATH || './data/adventure-racing.db',
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3 || 'http://localhost:9000',
    accessKey: process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin',
    bucket: process.env.S3_BUCKET || process.env.BUCKET_NAME || 'adventure-racing',
    region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
  },
  maxFileSize: 100 * 1024 * 1024, // 100MB per file
  maxFiles: 120,
  maxSceneSize: 10_000_000, // 10MB compressed scene target
};
