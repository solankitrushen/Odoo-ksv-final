"use client";

import { useState } from "react";
import { MapPin, Plus, Trash2, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import type { Address } from "@/lib/domain/types";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const EMPTY = {
  label: "",
  fullName: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  phone: "",
};

export default function AddressesPage() {
  const { addresses, saveAddresses } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  function set(key: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function persist(next: Address[]) {
    try {
      await saveAddresses(next);
    } catch (err) {
      toast("Could not save addresses", {
        description: err instanceof Error ? err.message : "Try again",
        tone: "error",
      });
      throw err;
    }
  }

  async function addAddress(e: React.FormEvent) {
    e.preventDefault();
    const addr: Address = {
      id: `a${Date.now()}`,
      ...form,
      line2: form.line2 || undefined,
      isDefault: addresses.length === 0,
    };
    try {
      await persist([...addresses, addr]);
      setForm(EMPTY);
      setOpen(false);
      toast("Address added", { description: "It will show up at checkout.", tone: "success" });
    } catch {
      // toast already shown
    }
  }

  async function remove(id: string) {
    try {
      await persist(addresses.filter((a) => a.id !== id));
    } catch {
      // toast already shown
    }
  }

  async function makeDefault(id: string) {
    try {
      await persist(addresses.map((a) => ({ ...a, isDefault: a.id === id })));
    } catch {
      // toast already shown
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Addresses</h1>
          <p className="mt-1 text-ink-soft">Saved to your account — available every time you check out.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Add address
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New address</DialogTitle>
            </DialogHeader>
            <form onSubmit={addAddress} className="grid grid-cols-2 gap-4">
              <Field id="label" label="Label" placeholder="Home, Studio…" value={form.label} onChange={set("label")} required />
              <Field id="fullName" label="Full name" value={form.fullName} onChange={set("fullName")} required />
              <Field id="line1" label="Address line 1" className="col-span-2" value={form.line1} onChange={set("line1")} required />
              <Field id="line2" label="Address line 2" className="col-span-2" value={form.line2} onChange={set("line2")} />
              <Field id="city" label="City" value={form.city} onChange={set("city")} required />
              <Field id="state" label="State" value={form.state} onChange={set("state")} required />
              <Field id="pincode" label="PIN code" value={form.pincode} onChange={set("pincode")} required />
              <Field id="phone" label="Phone" value={form.phone} onChange={set("phone")} required />
              <DialogFooter className="col-span-2 mt-2">
                <Button type="submit">Save address</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {addresses.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line py-16 text-center">
          <MapPin className="mx-auto h-6 w-6 text-ink-soft" />
          <p className="mt-3 text-sm font-medium text-ink">No addresses yet</p>
          <p className="mt-1 text-sm text-ink-soft">Add one to speed up checkout.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {addresses.map((a) => (
            <div
              key={a.id}
              className={cn(
                "rounded-xl border bg-card p-5",
                a.isDefault ? "border-ink" : "border-line",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{a.label}</span>
                {a.isDefault && (
                  <span className="inline-flex items-center gap-1 text-2xs uppercase tracking-wide text-ink-soft">
                    <Check className="h-3 w-3" /> Default
                  </span>
                )}
              </div>
              <address className="mt-2 text-sm not-italic leading-relaxed text-ink-soft">
                {a.fullName}
                <br />
                {a.line1}
                {a.line2 && (
                  <>
                    <br />
                    {a.line2}
                  </>
                )}
                <br />
                {a.city}, {a.state} {a.pincode}
                <br />
                {a.phone}
              </address>
              <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
                {!a.isDefault && (
                  <button
                    onClick={() => makeDefault(a.id)}
                    className="text-xs font-medium text-ink hover:underline"
                  >
                    Make default
                  </button>
                )}
                <button
                  onClick={() => remove(a.id)}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-ink-soft hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  className,
  ...props
}: { id: string; label: string; className?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5 block">
        {label}
      </Label>
      <Input id={id} {...props} />
    </div>
  );
}
