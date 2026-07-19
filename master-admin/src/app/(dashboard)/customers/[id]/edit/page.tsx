"use client";

import { PageHeader } from "@/components/features/data-table/page-header";
import { ErrorState } from "@/components/features/dashboard/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { usePageTitle } from "@/contexts/page-title-context";
import { rentalKeys } from "@/hooks/rental/keys";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import { rentalCommand, rentalGet } from "@/lib/rental-api";
import type { Customer, CustomerActivity } from "@/lib/rental-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type FormState = {
  displayName: string;
  type: "person" | "business";
  legalName: string;
  email: string;
  phone: string;
  gstin: string;
  notes: string;
};

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { setPageTitle } = usePageTitle();
  const scope = useRentalScope();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  const customerQ = useQuery({
    queryKey: rentalKeys.customer(scope, id),
    queryFn: () =>
      rentalGet<{ customer: Customer; activity: CustomerActivity }>(`/admin/customers/${id}`),
    enabled: Boolean(id),
  });

  const customer = customerQ.data?.customer;

  useEffect(() => {
    setPageTitle({
      backHref: id ? `/customers/${id}` : "/customers",
      title: customer ? `Edit ${customer.displayName}` : "Edit customer",
      description: customer?.customerNumber || "Update account details",
    });
    return () => setPageTitle(null);
  }, [setPageTitle, customer, id]);

  useEffect(() => {
    if (!customer || form) return;
    setForm({
      displayName: customer.displayName || "",
      type: customer.type === "business" ? "business" : "person",
      legalName: customer.legalName || "",
      email: customer.email || "",
      phone: customer.phone || "",
      gstin: customer.gstin || "",
      notes: customer.notes || "",
    });
  }, [customer, form]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer || !form) return;
    if (!form.displayName.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      await rentalCommand(
        `/admin/customers/${customer._id}`,
        "PATCH",
        {
          displayName: form.displayName.trim(),
          type: form.type,
          legalName: form.legalName.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          gstin: form.gstin.trim() || null,
          notes: form.notes.trim() || null,
        },
        { version: customer.version ?? 0 },
      );
      toast.success("Customer updated");
      await qc.invalidateQueries({ queryKey: rentalKeys.customer(scope, id) });
      await qc.invalidateQueries({ queryKey: ["rental", scope, "customers"] });
      router.push(`/customers/${customer._id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (customerQ.isError) {
    return (
      <ErrorState
        message={customerQ.error?.message}
        onRetry={() => void customerQ.refetch()}
        title="Could not load customer"
      />
    );
  }

  if (customerQ.isLoading || !customer || !form) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (customer.status === "archived") {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <PageHeader title="Inactive customer" description="Reactivate from the list before editing." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageHeader
        title="Edit customer"
        description={`${customer.customerNumber || "Customer"} · change contact and account details`}
      >
        <Button asChild variant="outline">
          <Link href={`/customers/${customer._id}`}>Cancel</Link>
        </Button>
      </PageHeader>

      <form className="space-y-5 rounded-lg border border-border bg-card p-5" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="displayName">Name</Label>
            <Input
              id="displayName"
              onChange={(e) => setForm((f) => (f ? { ...f, displayName: e.target.value } : f))}
              required
              value={form.displayName}
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              onValueChange={(v) =>
                setForm((f) => (f ? { ...f, type: v as "person" | "business" } : f))
              }
              value={form.type}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="person">Person</SelectItem>
                <SelectItem value="business">Business</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="legalName">Legal name</Label>
            <Input
              id="legalName"
              onChange={(e) => setForm((f) => (f ? { ...f, legalName: e.target.value } : f))}
              placeholder="Optional"
              value={form.legalName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              onChange={(e) => setForm((f) => (f ? { ...f, email: e.target.value } : f))}
              type="email"
              value={form.email}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              onChange={(e) => setForm((f) => (f ? { ...f, phone: e.target.value } : f))}
              value={form.phone}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="gstin">GSTIN</Label>
            <Input
              id="gstin"
              onChange={(e) => setForm((f) => (f ? { ...f, gstin: e.target.value } : f))}
              placeholder="Optional"
              value={form.gstin}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              onChange={(e) => setForm((f) => (f ? { ...f, notes: e.target.value } : f))}
              rows={4}
              value={form.notes}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button disabled={saving} type="submit">
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link href={`/customers/${customer._id}`}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
