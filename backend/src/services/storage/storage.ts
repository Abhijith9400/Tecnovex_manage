import type { Readable } from "node:stream";
import type { Response } from "express";
import { env } from "../../config/env";
import { LocalStorageDriver } from "./localStorage";

export interface SendOptions {
  fileName: string;
  mimeType: string;
  /** true = Content-Disposition: attachment, false = inline (preview). */
  download: boolean;
}

/**
 * Storage backend contract. Files are always streamed; nothing loads a whole upload into memory.
 * To add S3-compatible storage, implement this interface (multipart upload from the temp file,
 * signed-URL redirect in send()) and select it in createStorage().
 */
export interface StorageDriver {
  /** Moves an uploaded temp file into permanent storage under `key`. */
  putFromTempFile(tempPath: string, key: string, mimeType: string): Promise<void>;
  /** Streams the stored object to the HTTP response, honouring Range requests where supported. */
  send(res: Response, key: string, options: SendOptions): Promise<void>;
  /** Reads a small object fully (logos/signatures for PDFs). */
  read(key: string): Promise<Buffer>;
  /** Opens a read stream (used to stream files into ZIP downloads without buffering). */
  stream(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

function createStorage(): StorageDriver {
  switch (env.STORAGE_DRIVER) {
    case "local":
    default:
      return new LocalStorageDriver(env.UPLOAD_DIR);
  }
}

export const storage = createStorage();
