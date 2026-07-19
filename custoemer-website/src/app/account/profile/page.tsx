"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-store";
import { fetchMe, RentalApiError } from "@/lib/rental-api";
import { toast } from "@/components/ui/toaster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfilePage() {
  const { session, isAuthenticated, updateProfile } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchMe(),
    enabled: isAuthenticated,
  });

  const me = data?.customer;
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(me?.displayName ?? session?.displayName ?? "");
    setPhone(me?.phone ?? session?.phone ?? "");
  }, [me, session]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      await updateProfile({ displayName: displayName.trim(), phone: phone.trim() });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast("Profile updated", { tone: "success" });
    } catch (err) {
      toast("Could not save", {
        description: err instanceof RentalApiError ? err.message : "Try again",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Profile</h1>
      <p className="mt-1 text-ink-soft">Update your name and phone — used for deliveries and pickup.</p>

      <form onSubmit={save} className="mt-6 max-w-lg rounded-xl border border-line bg-card p-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <Label htmlFor="displayName" className="mb-1.5 block">
                Name
              </Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="email" className="mb-1.5 block">
                Email
              </Label>
              <Input id="email" value={me?.email ?? ""} readOnly className="bg-muted" />
              <p className="mt-1 text-xs text-ink-soft">Login email can&apos;t be changed here.</p>
            </div>
            <div>
              <Label htmlFor="phone" className="mb-1.5 block">
                Phone
              </Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91…"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Status</Label>
              <Badge variant={me?.status === "active" ? "success" : "muted"}>
                {me?.status ? me.status[0].toUpperCase() + me.status.slice(1) : "—"}
              </Badge>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
