import { Readable } from 'stream';
import {
  S3Client, GetObjectCommand, DeleteObjectCommand,
  ListObjectsV2Command, HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { StorageProvider, BackupMeta } from './provider';

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // optional: Backblaze B2, Cloudflare R2, MinIO, etc.
}

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
    });
  }

  resolvedPath(filename: string): string {
    return `s3://${this.bucket}/${filename}`;
  }

  async write(filename: string, stream: Readable): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: filename, Body: stream, ContentType: 'application/gzip' },
    });
    await upload.done();
  }

  async read(filename: string): Promise<Readable> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: filename }));
    if (!result.Body) throw new Error(`Backup file not found in S3: ${filename}`);
    return result.Body as Readable;
  }

  async exists(filename: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: filename }));
      return true;
    } catch {
      return false;
    }
  }

  async delete(filename: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: filename }));
  }

  async list(): Promise<BackupMeta[]> {
    const result = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket }));
    return (result.Contents ?? [])
      .filter((obj) => obj.Key?.endsWith('.tar.gz'))
      .map((obj) => ({ filename: obj.Key!, sizeBytes: obj.Size ?? 0, createdAt: obj.LastModified ?? new Date() }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
