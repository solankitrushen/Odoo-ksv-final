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
import { formatRentalMoney, parseRupeesToPaise } from "@/lib/rental-money";
import type {
  Category,
  CommercialPolicy,
  CommercialPolicyType,
  CommercialScopeType,
  PageResult,
  Product,
} from "@/lib/rental-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const TYPE_LABEL: Record<string, string> = {
  late: "Late fee",
  grace: "Grace period",
  cap: "Late fee cap",
  deposit: "Deposit",
};

const SCOPE_LABEL: Record<string, string> = {
  organization: "Whole business",
  category: "Category",
  product: "Product",
};

const PENALTY_TYPES = ["late", "grace", "cap", "deposit"] as const;

function summarizePolicy(p: CommercialPolicy): string {
  const pol = p.policy || {};
  if (p.policyType === "late") {
    const rate = typeof pol.ratePaise === "number" ? formatRentalMoney(pol.ratePaise) : "—";
    return `${rate} / ${String(pol.periodCode || "day")}`;
  }
  if (p.policyType === "grace") {
    return `${pol.graceMinutes ?? pol.minutes ?? "—"} minutes`;
  }
  if (p.policyType === "cap") {
    return typeof pol.valuePaise === "number" ? `Cap ${formatRentalMoney(pol.valuePaise)}` : "—";
  }
  if (p.policyType === "deposit") {
    if (pol.mode === "percentage" && typeof pol.valueBps === "number") {
      return `${(Number(pol.valueBps) / 100).toFixed(0)}% of rent`;
    }
    if (typeof pol.valuePaise === "number") return formatRentalMoney(pol.valuePaise);
  }
  return "—";
}

export default function PenaltiesSettingsPage() {
  const { setPageTitle } = usePageTitle();
  const scope = useRentalScope();
  const qc = useQueryClient();
  const [status, setStatus] = useState("active");
  const [typeFilter, setTypeFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [policyType, setPolicyType] = useState<CommercialPolicyType>("late");
  const [scopeType, setScopeType] = useState<CommercialScopeType>("organization");
  const [scopeId, setScopeId] = useState("none");
  const [amountRupees, setAmountRupees] = useState("200");
  const [periodCode, setPeriodCode] = useState("day");
  const [graceMinutes, setGraceMinutes] = useState("120");
  const [depositMode, setDepositMode] = useState<"fixed" | "percentage">("fixed");
  const [depositPct, setDepositPct] = useState("25");

  const listQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "commercial-rules", { status, typeFilter }),
    queryFn: async () => {
      const base = await normalizePage(
        await rentalGet<PageResult<CommercialPolicy>>("/admin/commercial-rules", {
          limit: 100,
          status: status === "all" ? "all" : status,
        })
      );
      const items = base.items.filter((p) => PENALTY_TYPES.includes(p.policyType as (typeof PENALTY_TYPES)[number]));
      return { ...base, items, total: items.length };
    },
  });

  const categoriesQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "categories", { status: "active" }),
    queryFn: async () =>
      normalizePage(await rentalGet<PageResult<Category>>("/admin/categories", { limit: 100, status: "active" })),
  });

  const productsQ = useQuery({
    queryKey: rentalKeys.catalog(scope, "products", { status: "active", for: "penalties" }),
    queryFn: async () =>
      normalizePage(await rentalGet<PageResult<Product>>("/admin/products", { limit: 100, status: "active" })),
  });

  useEffect(() => {
    setPageTitle({ title: "Penalties", description: "Late fees, grace, caps, and deposits" });
    return () => setPageTitle(null);
  }, [setPageTitle]);

  const scopeName = useMemo(() => {
    const cat = new Map((categoriesQ.data?.items ?? []).map((c) => [c._id, c.name]));
    const prod = new Map((productsQ.data?.items ?? []).map((p) => [p._id, p.name]));
    return (p: CommercialPolicy) => {
      if (p.scopeType === "organization") return "Whole business";
      if (p.scopeType === "category" && p.scopeId) return cat.get(p.scopeId) || p.scopeId;
      if (p.scopeType === "product" && p.scopeId) return prod.get(p.scopeId) || p.scopeId;
      return "—";
    };
  }, [categoriesQ.data, productsQ.data]);

  const filtered = useMemo(() => {
    return (listQ.data?.items ?? []).filter((p) => typeFilter === "all" || p.policyType === typeFilter);
  }, [listQ.data, typeFilter]);

  const paged = useClientPagination(filtered, {
    pageSize: LIST_PAGE_SIZE,
    resetKey: `${status}|${typeFilter}`,
  });

  function resetForm() {
    setPolicyType("late");
    setScopeType("organization");
    setScopeId("none");
    setAmountRupees("200");
    setPeriodCode("day");
    setGraceMinutes("120");
    setDepositMode("fixed");
    setDepositPct("25");
  }

  async function onCreate() {
    if (scopeType !== "organization" && (scopeId === "none" || !scopeId)) {
      toast.error("Pick a category or product for this rule");
      return;
    }

    let policy: Record<string, unknown>;
    try {
      if (policyType === "late") {
        const ratePaise = parseRupeesToPaise(amountRupees);
        if (ratePaise == null) throw new Error("Enter a late fee amount");
        policy = { ratePaise, periodCode };
      } else if (policyType === "grace") {
        const n = Number.parseInt(graceMinutes, 10);
        if (!Number.isFinite(n) || n < 0) throw new Error("Enter grace minutes");
        policy = { graceMinutes: n };
      } else if (policyType === "cap") {
        const valuePaise = parseRupeesToPaise(amountRupees);
        if (valuePaise == null) throw new Error("Enter a cap amount");
        policy = { mode: "fixed", valuePaise };
      } else {
        if (depositMode === "percentage") {
          const pct = Number(depositPct);
          if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error("Deposit % must be 0–100");
          policy = { mode: "percentage", valueBps: Math.round(pct * 100) };
        } else {
          const valuePaise = parseRupeesToPaise(amountRupees);
          if (valuePaise == null) throw new Error("Enter a deposit amount");
          policy = { mode: "fixed", valuePaise };
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid values");
      return;
    }

    setSaving(true);
    try {
      await rentalCommand(
        "/admin/commercial-rules",
        "POST",
        {
          scopeType,
          scopeId: scopeType === "organization" ? undefined : scopeId,
          policyType,
          policy,
        },
        { idempotencyKey: createIntentKey() }
      );
      toast.success("Rule saved");
      setOpen(false);
      resetForm();
      await qc.invalidateQueries({ queryKey: rentalKeys.catalog(scope, "commercial-rules") });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate(p: CommercialPolicy) {
    if (!confirm("Deactivate this rule?")) return;
    try {
      await rentalCommand(`/admin/commercial-rules/${p._id}`, "DELETE", undefined, { version: p.version ?? 0 });
      toast.success("Rule deactivated");
      await qc.invalidateQueries({ queryKey: rentalKeys.catalog(scope, "commercial-rules") });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not deactivate");
    }
  }

  if (listQ.isError) {
    return (
      <ErrorState
        message={listQ.error?.message}
        onRetry={() => void listQ.refetch()}
        title="Could not load penalty rules"
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        description="Late fees if returned late, grace time, caps, and security deposits."
        title="Penalties"
      >
        <Button
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
        >
          Add rule
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <Select onValueChange={setTypeFilter} value={typeFilter}>
          <SelectTrigger aria-label="Filter by type" className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {PENALTY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <EmptyState message="No penalty rules yet. Add a late fee for the whole business." />
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
              <TableHead>Type</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.items.map((p) => (
              <TableRow key={p._id}>
                <TableCell className="font-medium">{TYPE_LABEL[p.policyType] || p.policyType}</TableCell>
                <TableCell>
                  <span className="text-muted-foreground">{SCOPE_LABEL[p.scopeType]} · </span>
                  {scopeName(p)}
                </TableCell>
                <TableCell>{summarizePolicy(p)}</TableCell>
                <TableCell>
                  <StatusChip kind="catalog" status={p.status} />
                </TableCell>
                <TableCell className="text-right">
                  <RowActionsMenu
                    actions={[
                      {
                        label: "Deactivate",
                        onSelect: () => void onDeactivate(p),
                        destructive: true,
                        disabled: p.status === "archived",
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add penalty rule</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select onValueChange={(v) => setPolicyType(v as CommercialPolicyType)} value={policyType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PENALTY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Applies to</Label>
              <Select
                onValueChange={(v) => {
                  setScopeType(v as CommercialScopeType);
                  setScopeId("none");
                }}
                value={scopeType}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">Whole business</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                  <SelectItem value="product">Product</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scopeType === "category" ? (
              <div className="space-y-2">
                <Label>Category</Label>
                <Select onValueChange={setScopeId} value={scopeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categoriesQ.data?.items ?? []).map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {scopeType === "product" ? (
              <div className="space-y-2">
                <Label>Product</Label>
                <Select onValueChange={setScopeId} value={scopeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {(productsQ.data?.items ?? []).map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {policyType === "grace" ? (
              <div className="space-y-2">
                <Label htmlFor="grace">Grace (minutes)</Label>
                <Input id="grace" onChange={(e) => setGraceMinutes(e.target.value)} value={graceMinutes} />
              </div>
            ) : null}

            {policyType === "late" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="late-amt">Fee amount (₹)</Label>
                  <Input id="late-amt" onChange={(e) => setAmountRupees(e.target.value)} value={amountRupees} />
                </div>
                <div className="space-y-2">
                  <Label>Per</Label>
                  <Select onValueChange={setPeriodCode} value={periodCode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hour">Hour</SelectItem>
                      <SelectItem value="day">Day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}

            {policyType === "cap" ? (
              <div className="space-y-2">
                <Label htmlFor="cap-amt">Maximum late fee (₹)</Label>
                <Input id="cap-amt" onChange={(e) => setAmountRupees(e.target.value)} value={amountRupees} />
              </div>
            ) : null}

            {policyType === "deposit" ? (
              <>
                <div className="space-y-2">
                  <Label>Deposit type</Label>
                  <Select onValueChange={(v) => setDepositMode(v as "fixed" | "percentage")} value={depositMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed amount</SelectItem>
                      <SelectItem value="percentage">% of rent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {depositMode === "fixed" ? (
                  <div className="space-y-2">
                    <Label htmlFor="dep-amt">Amount (₹)</Label>
                    <Input id="dep-amt" onChange={(e) => setAmountRupees(e.target.value)} value={amountRupees} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="dep-pct">Percent</Label>
                    <Input id="dep-pct" onChange={(e) => setDepositPct(e.target.value)} value={depositPct} />
                  </div>
                )}
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => setOpen(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void onCreate()}>
              {saving ? "Saving…" : "Save rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
