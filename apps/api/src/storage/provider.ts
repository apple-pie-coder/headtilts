import { Readable } from 'stream';

export interface BackupMeta {
  filename: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface StorageProvider {
  write(filename: string, stream: Readable): Promise<void>;
  read(filename: string): Promise<Readable>;
  exists(filename: string): Promise<boolean>;
  delete(filename: string): Promise<void>;
  list(): Promise<BackupMeta[]>;
  resolvedPath(filename: string): string;
}
