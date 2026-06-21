import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { StorageProvider, BackupMeta } from './provider';

export class LocalStorageProvider implements StorageProvider {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  resolvedPath(filename: string): string {
    return path.join(this.dir, path.basename(filename));
  }

  async write(filename: string, stream: Readable): Promise<void> {
    const dest = this.resolvedPath(filename);
    const out = fs.createWriteStream(dest);
    await pipeline(stream, out);
  }

  async read(filename: string): Promise<Readable> {
    const src = this.resolvedPath(filename);
    if (!fs.existsSync(src)) throw new Error(`Backup file not found: ${filename}`);
    return fs.createReadStream(src);
  }

  async exists(filename: string): Promise<boolean> {
    return fs.existsSync(this.resolvedPath(filename));
  }

  async delete(filename: string): Promise<void> {
    const p = this.resolvedPath(filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  async list(): Promise<BackupMeta[]> {
    const files = fs.existsSync(this.dir) ? fs.readdirSync(this.dir) : [];
    return files
      .filter((f) => f.endsWith('.tar.gz'))
      .map((f) => {
        const stat = fs.statSync(path.join(this.dir, f));
        return { filename: f, sizeBytes: stat.size, createdAt: stat.birthtime };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
