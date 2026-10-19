import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Response } from "express";
import { AppError } from "../../utils/AppError";
import type { SendOptions, StorageDriver } from "./storage";

export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(uploadDir: string) {
    this.root = path.resolve(uploadDir);
  }

  /** Resolves a storage key to a path inside the upload root, refusing anything that escapes it. */
  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw AppError.badRequest("Invalid storage key");
    return full;
  }

  async putFromTempFile(tempPath: string, key: string): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await rename(tempPath, target);
    } catch {
      // Different volume: stream-copy instead of rename.
      await pipeline(createReadStream(tempPath), createWriteStream(target));
      await rm(tempPath, { force: true });
    }
  }

  async send(res: Response, key: string, options: SendOptions): Promise<void> {
    const full = this.resolve(key);
    try {
      await stat(full);
    } catch {
      throw AppError.notFound("File");
    }
    const disposition = options.download ? "attachment" : "inline";
    const safeName = options.fileName.replace(/[^\w.\- ]/g, "_");
    await new Promise<void>((resolve, reject) => {
      // sendFile streams with Range/ETag support, so large videos can be scrubbed without full downloads.
      res.sendFile(
        full,
        {
          headers: {
            "Content-Type": options.mimeType,
            "Content-Disposition": `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(options.fileName)}`,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=300",
          },
          dotfiles: "deny",
        },
        (error) => (error && !res.headersSent ? reject(error) : resolve()),
      );
    });
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async stream(key: string): Promise<Readable> {
    const full = this.resolve(key);
    try {
      await stat(full);
    } catch {
      throw AppError.notFound("File");
    }
    return createReadStream(full);
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
