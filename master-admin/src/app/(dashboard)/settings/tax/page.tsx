"use client";

import { EmptyState } from "@/components/features/data-table/empty-state";
import { PageHeader } from "@/components/features/data-table/page-header";
import { RowActionsMenu } from "@/components/features/data-table/row-actions-menu";
import { StatusChip } from "@/components/features/data-table/status-chip";
import { TablePagination } from "@/components/features/data-table/table-pagination";
import { ErrorState } from "@/components/features/dashboard/error-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePageTitle } from "@/contexts/page-title-context";
import { LIST_PAGE_SIZE, useClientPagination } from "@/hooks/use-client-pagination";
import { rentalKeys } from "@/hooks/rental/keys";
import { useRentalScope } from "@/hooks/rental/use-rental-scope";
import { createIntentKey, normalizePage, rentalCommand, rentalGet } from "@/lib/rental-api";
import type { PageResult, TaxCode } from "@/lib/rental-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function pctFromBps(bps: number) {
  return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 1);
}

function bpsFromPct(text: string): number | null {
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

type FormState = {
  code: string;
  name: string;
  ratePct: string;
  mode: string;
};

const emptyForm: FormState = { code: "", name: "", ratePct: "18", mode: "exclusive" };

export default function TaxSettingsPage() {
  const { setPageTitle } = usePageTitle();
  const scope = useRentalScope();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaxCode | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const listQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "tax-codes", { status }),
    queryFn: async () =>
      normalizePage(
        await rentalGet<PageResult<TaxCode>>("/admin/tax/codes", {
          limit: 100,
          status: status === "all" ? "all" : status,
        })
      ),
  });

  useEffect(() => {
    setPageTitle({ title: "Tax", description: "GST and tax classes for products" });
    return () => setPageTitle(null);
  }, [setPageTitle]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (listQ.data?.items ?? []).filter((t) => {
      if (!needle) return true;
      return `${t.code} ${t.name}`.toLowerCase().includes(needle);
    });
  }, [listQ.data, q]);

  const paged = useClientPagination(filtered, {
    pageSize: LIST_PAGE_SIZE,
    resetKey: `${status}|${q}`,
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(t: TaxCode) {
    setEditing(t);
    setForm({
      code: t.code,
      name: t.name,
      ratePct: pctFromBps(t.rateBps),
      mode: t.mode || "exclusive",
    });
    setOpen(true);
  }

  async function onSave() {
    const rateBps = bpsFromPct(form.ratePct);
    if (!form.code.trim() || !form.name.trim() || rateBps == null) {
      toast.error("Code, name, and a rate 0–100% are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await rentalCommand(
          `/admin/tax/codes/${editing._id}`,
          "PATCH",
          { code: form.code.trim(), name: form.name.trim(), rateBps, mode: form.mode },
          { version: editing.version ?? 0 }
        );
        toast.success("Tax updated");
      } else {
        await rentalCommand(
          "/admin/tax/codes",
          "POST",
          { code: form.code.trim(), name: form.name.trim(), rateBps, mode: form.mode },
          { idempotencyKey: createIntentKey() }
        );
        toast.success("Tax created");
      }
      setOpen(false);
      await qc.invalidateQueries({ queryKey: rentalKeys.catalog(scope, "tax-codes") });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate(t: TaxCode) {
    if (!confirm(`Deactivate ${t.name}? Active products using it must be reassigned first.`)) return;
    try {
      await rentalCommand(`/admin/tax/codes/${t._id}`, "DELETE", undefined, { version: t.version ?? 0 });
      toast.success("Tax deactivated");
      await qc.invalidateQueries({ queryKey: rentalKeys.catalog(scope, "tax-codes") });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not deactivate");
    }
  }

  if (listQ.isError) {
    return (
      <ErrorState message={listQ.error?.message} onRetry={() => void listQ.refetch()} title="Could not load tax codes" />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader description="Create custom GST rates and assign them on products." title="Tax">
        <Button onClick={openCreate}>Add tax</Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <Input className="max-w-sm" onChange={(e) => setQ(e.target.value)} placeholder="Search code or name" value={q} />
        <Select onValueChange={setStatus} value={status}>
          <SelectTrigger aria-label="Filter by status" className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Inactive</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {listQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState message="No tax codes yet. Use Add tax to create GST 5/12/18 or a custom rate." />
      ) : (
        <Table
          footer={
            <TablePagination
              limit={paged.pageSize}
              onPageChange={paged.setPage}
              page={paged.page}
              total={paged.total}
            />
          }
        >
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.items.map((t) => (
              <TableRow key={t._id}>
                <TableCell className="font-medium">{t.code}</TableCell>
                <TableCell>{t.name}</TableCell>
                <TableCell className="tabular-nums">{pctFromBps(t.rateBps)}%</TableCell>
                <TableCell className="capitalize">{t.mode || "exclusive"}</TableCell>
                <TableCell>
                  <StatusChip kind="catalog" status={t.status} />
                </TableCell>
                <TableCell className="text-right">
                  <RowActionsMenu
                    actions={[
                      { label: "Edit", onSelect: () => openEdit(t), disabled: t.status === "archived" },
                      {
                        label: "Deactivate",
                        onSelect: () => void onDeactivate(t),
                        destructive: true,
                        disabled: t.status === "archived",
                        separatorBefore: true,
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit tax" : "Add tax"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="tax-code">Code</Label>
              <Input
                id="tax-code"
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="GST18"
                value={form.code}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-name">Name</Label>
              <Input
                id="tax-name"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="GST 18%"
                value={form.name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-rate">Rate (%)</Label>
              <Input
                id="tax-rate"
                inputMode="decimal"
                onChange={(e) => setForm((f) => ({ ...f, ratePct: e.target.value }))}
                value={form.ratePct}
              />
            </div>
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select onValueChange={(mode) => setForm((f) => ({ ...f, mode }))} value={form.mode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exclusive">Exclusive (add on top)</SelectItem>
                  <SelectItem value="inclusive">Inclusive (inside price)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setOpen(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void onSave()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
