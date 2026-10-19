"use client";

import { FileText, Film, Layers } from "@/components/ui/icons";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FileInfo } from "@/types/models";

/** Visual preview of a stored creative file. Videos load only metadata until played. */
export function MediaPreview({ file, className, controls = false }: { file: FileInfo; className?: string; controls?: boolean }) {
  const src = api.fileUrl(file.id);
  if (file.mimeType.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- authenticated API files cannot use next/image optimisation
    return <img src={src} alt={file.originalName} loading="lazy" className={cn("object-cover", className)} />;
  }
  if (file.mimeType.startsWith("video/")) {
    return controls ? (
      <video src={src} controls preload="metadata" className={cn("bg-black", className)} />
    ) : (
      <video src={`${src}#t=0.1`} muted preload="metadata" playsInline className={cn("bg-black object-cover", className)} />
    );
  }
  return (
    <div className={cn("flex items-center justify-center bg-page", className)}>
      <FileText className="size-8 text-muted" />
    </div>
  );
}

export function CreativeThumb({ files, className }: { files: FileInfo[]; className?: string }) {
  const first = files[0];
  return (
    <div className={cn("relative overflow-hidden bg-page", className)}>
      {first && <MediaPreview file={first} className="size-full" />}
      <div className="absolute top-2 right-2 flex gap-1">
        {files.length > 1 && (
          <span className="flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
            <Layers className="size-3" /> {files.length}
          </span>
        )}
        {first?.mimeType.startsWith("video/") && (
          <span className="rounded bg-black/60 p-1 text-white">
            <Film className="size-3" />
          </span>
        )}
      </div>
    </div>
  );
}
