"use client";

import { type ChangeEvent, useCallback, useState } from "react";
import { errorMessage, fieldErrors } from "./api";

export type FormValues = Record<string, string | boolean>;

/** Minimal controlled-form state: string/boolean values, server-side field errors, submit status. */
export function useForm<T extends FormValues>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = useCallback(<K extends keyof T>(name: K, value: T[K]) => setValues((v) => ({ ...v, [name]: value })), []);

  const bind = (name: keyof T & string) => ({
    name,
    value: String(values[name] ?? ""),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(name, event.target.value as T[typeof name]),
  });

  const bindCheckbox = (name: keyof T & string) => ({
    name,
    checked: Boolean(values[name]),
    onChange: (event: ChangeEvent<HTMLInputElement>) => set(name, event.target.checked as T[typeof name]),
  });

  /** Runs a submit action, mapping API validation errors onto fields. Returns the result or undefined on failure. */
  async function submit<R>(action: () => Promise<R>): Promise<R | undefined> {
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      return await action();
    } catch (error) {
      const mapped = fieldErrors(error);
      setErrors(mapped);
      setFormError(Object.keys(mapped).length ? "Please correct the highlighted fields." : errorMessage(error));
      return undefined;
    } finally {
      setSubmitting(false);
    }
  }

  return { values, setValues, set, bind, bindCheckbox, errors, formError, setFormError, submitting, submit, reset: () => setValues(initial) };
}

export type FormApi<T extends FormValues> = ReturnType<typeof useForm<T>>;

/** Converts API records (null/number fields) into string form values. */
export function toFormValues<T extends FormValues>(defaults: T, source: Record<string, unknown> | null | undefined): T {
  if (!source) return defaults;
  const result: FormValues = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const value = source[key];
    if (value === null || value === undefined) continue;
    result[key] = typeof defaults[key] === "boolean" ? Boolean(value) : typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : String(value);
  }
  return result as T;
}
