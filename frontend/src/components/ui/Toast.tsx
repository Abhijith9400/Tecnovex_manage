"use client";

import { CheckCircle2, AlertCircle, X } from "@/components/ui/icons";
import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/utils";

interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "error";
}

const ToastContext = createContext<{ notify: (message: string, tone?: ToastItem["tone"]) => void }>({ notify: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (message: string, tone: ToastItem["tone"] = "success") => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list, { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm shadow-lg",
              toast.tone === "success" ? "border-green-200" : "border-red-200",
            )}
          >
            {toast.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />}
            <p className="flex-1 text-ink">{toast.message}</p>
            <button onClick={() => dismiss(toast.id)} className="text-muted hover:text-ink" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
