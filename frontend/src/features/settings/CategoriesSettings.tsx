"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert, Badge, Spinner } from "@/components/ui/Feedback";
import { Input } from "@/components/ui/Form";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import type { Category } from "@/types/models";

export function CategoriesSettings() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CategoryList type="EXPENSE" title="Expense categories" />
      <CategoryList type="INCOME" title="Other income categories" description="Do not create a category for client payments. Those are recorded against invoices." />
    </div>
  );
}

function CategoryList({ type, title, description }: { type: Category["type"]; title: string; description?: string }) {
  const { notify } = useToast();
  const categories = useAsync(() => api.get<Category[]>("/settings/categories", { type }), [type]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post("/settings/categories", { type, name });
      setName("");
      notify("Category added");
      categories.reload();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(category: Category) {
    try {
      await api.patch(`/settings/categories/${category.id}`, { isActive: !category.isActive });
      categories.reload();
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="p-4">
        <form onSubmit={add} className="mb-4 flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" aria-label="New category name" />
          <Button type="submit" loading={busy}>
            Add
          </Button>
        </form>
        {categories.error && <Alert>{categories.error}</Alert>}
        {!categories.data ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {categories.data.map((category) => (
              <li key={category.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className={category.isActive ? "" : "text-muted line-through"}>{category.name}</span>
                <div className="flex items-center gap-2">
                  {!category.isActive && <Badge>Inactive</Badge>}
                  <Button variant="ghost" size="sm" onClick={() => toggle(category)}>
                    {category.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
