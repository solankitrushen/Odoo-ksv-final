"use client";

import { PageHeader } from "@/components/features/data-table/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePageTitle } from "@/contexts/page-title-context";
import { createIntentKey, rentalCommand } from "@/lib/rental-api";
import type { Customer } from "@/lib/rental-types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function NewCustomerPage() {
  const { setPageTitle } = usePageTitle();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPageTitle({ title: "Add customer", description: "Name, email, and phone are required" });
    return () => setPageTitle(null);
  }, [setPageTitle]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    const mail = email.trim();
    const tel = phone.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    if (!mail) {
      toast.error("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      toast.error("Enter a valid email");
      return;
    }
    if (!tel) {
      toast.error("Phone number is required");
      return;
    }
    if (tel.length < 6 || tel.length > 20) {
      toast.error("Phone must be 6–20 characters");
      return;
    }
    setLoading(true);
    try {
      const out = await rentalCommand<{ customer: Customer }>(
        "/admin/customers",
        "POST",
        {
          displayName: name,
          email: mail,
          phone: tel,
        },
        { idempotencyKey: createIntentKey() }
      );
      toast.success("Customer saved");
      router.push(`/customers/${out.customer._id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <PageHeader title="Add customer" description="Name, email, and phone are required." />
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="displayName">Name</Label>
          <Input id="displayName" onChange={(e) => setDisplayName(e.target.value)} required value={displayName} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" onChange={(e) => setEmail(e.target.value)} required type="email" value={email} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" onChange={(e) => setPhone(e.target.value)} required value={phone} />
        </div>
        <div className="flex gap-2">
          <Button disabled={loading} type="submit">
            {loading ? "Saving…" : "Save customer"}
          </Button>
          <Button onClick={() => router.back()} type="button" variant="outline">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
