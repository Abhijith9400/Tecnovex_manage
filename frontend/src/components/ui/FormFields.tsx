"use client";

import type { ReactNode } from "react";
import type { FormApi, FormValues } from "@/lib/form";
import { Field, Input, Select, Textarea } from "./Form";

interface BaseProps<T extends FormValues> {
  form: FormApi<T>;
  name: keyof T & string;
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
}

export function TextField<T extends FormValues>({
  form,
  name,
  label,
  required,
  hint,
  className,
  type = "text",
  ...rest
}: BaseProps<T> & { type?: string; placeholder?: string; step?: string; min?: string; max?: string; autoComplete?: string; disabled?: boolean }) {
  return (
    <div className={className}>
      <Field label={label} required={required} hint={hint} error={form.errors[name]}>
        {(props) => <Input {...props} {...form.bind(name)} type={type} required={required} {...rest} />}
      </Field>
    </div>
  );
}

export function MoneyField<T extends FormValues>(props: BaseProps<T> & { placeholder?: string; disabled?: boolean }) {
  return <TextField {...props} type="number" step="0.01" min="0" placeholder={props.placeholder ?? "0.00"} />;
}

export function TextAreaField<T extends FormValues>({ form, name, label, required, hint, className, rows = 3 }: BaseProps<T> & { rows?: number }) {
  return (
    <div className={className}>
      <Field label={label} required={required} hint={hint} error={form.errors[name]}>
        {(props) => <Textarea {...props} {...form.bind(name)} rows={rows} required={required} />}
      </Field>
    </div>
  );
}

export function SelectField<T extends FormValues>({
  form,
  name,
  label,
  required,
  hint,
  className,
  options,
  placeholder,
  disabled,
}: BaseProps<T> & { options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean }) {
  return (
    <div className={className}>
      <Field label={label} required={required} hint={hint} error={form.errors[name]}>
        {(props) => (
          <Select {...props} {...form.bind(name)} required={required} disabled={disabled}>
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}

export function CheckboxField<T extends FormValues>({ form, name, label, hint, className }: Omit<BaseProps<T>, "required">) {
  return (
    <label className={`flex items-start gap-2.5 text-sm ${className ?? ""}`}>
      <input type="checkbox" {...form.bindCheckbox(name)} className="mt-0.5 size-4 rounded border-line accent-accent" />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="border-b border-line pb-6 last:border-b-0 last:pb-0">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-0.5 mb-3 text-xs text-muted">{description}</p>}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}
