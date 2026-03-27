# MinIO Setup Guide

This project uses MinIO as an S3-compatible object storage for storing scene data and tracklogs.

## Prerequisites

- [Docker](https://www.docker.com/) installed and running on your machine.

## Quick Start

Run the following command to start a MinIO instance in a Docker container:

```bash
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  --name adventure-racing-minio \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  quay.io/minio/minio server /data --console-address ":9001"
```

This command:
- Maps port `9000` (API) and `9001` (Console) to your localhost.
- Sets the default Access Key to `minioadmin`.
- Sets the default Secret Key to `minioadmin`.
- Names the container `adventure-racing-minio`.

## Create the Bucket

1. Open the MinIO Console at [http://localhost:9001](http://localhost:9001).
2. Login with the credentials:
   - Username: `minioadmin`
   - Password: `minioadmin`
3. Click on **Buckets** in the sidebar.
4. Click **Create Bucket**.
5. Enter `adventure-racing` as the Bucket Name.
6. Click **Create Bucket**.

## Configuration

Ensure your `.env` file in the project root matches these settings (this is the default in `.env.example`):

```env
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=adventure-racing
S3_REGION=us-east-1
```
