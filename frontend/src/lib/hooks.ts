"use client";

import { type DependencyList, useCallback, useEffect, useState } from "react";
import { errorMessage } from "./api";

interface AsyncResult<T> {
  key: string;
  data?: T;
  error?: string;
}

/**
 * Runs an async loader whenever `deps` change (or reload() is called).
 * Keeps the previous data visible while a refetch is in flight.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [version, setVersion] = useState(0);
  const key = `${JSON.stringify(deps)}#${version}`;
  const [result, setResult] = useState<AsyncResult<T>>();
  const [lastData, setLastData] = useState<T>();

  useEffect(() => {
    let cancelled = false;
    loader().then(
      (data) => {
        if (cancelled) return;
        setResult({ key, data });
        setLastData(data);
      },
      (error: unknown) => !cancelled && setResult({ key, error: errorMessage(error) }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` encodes deps + version
  }, [key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const loading = result?.key !== key;

  return { data: result?.key === key ? result.data : lastData, error: result?.key === key ? result.error : undefined, loading, reload };
}

export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
