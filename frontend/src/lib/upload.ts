"use client";

import { API_URL, ApiError } from "./api";
import type { ApiResponse } from "@/types/api";

/**
 * Multipart upload with progress (fetch cannot report upload progress). Uses the same cookie session and
 * CSRF header as the shared API client. The browser streams the file; nothing is buffered in JS.
 */
export function uploadWithProgress<T>(path: string, body: FormData, csrfToken: string, onProgress: (percent: number) => void, method = "POST"): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_URL}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-CSRF-Token", csrfToken);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    xhr.onerror = () => reject(new ApiError(0, "Upload failed. Check your connection and try again.", "NETWORK_ERROR"));
    xhr.onload = () => {
      let payload: ApiResponse<T> | null = null;
      try {
        payload = JSON.parse(xhr.responseText) as ApiResponse<T>;
      } catch {
        /* non-JSON error */
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload?.success) resolve(payload.data);
      else {
        const error = payload && !payload.success ? payload.error : undefined;
        reject(new ApiError(xhr.status, error?.message ?? `Upload failed (${xhr.status})`, error?.code, error?.details));
      }
    };
    xhr.send(body);
  });
}
