"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import {
  Check,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Shield,
  Sun,
  User,
  X,
} from "lucide-react";
import * as React from "react";

type Tab = "profile" | "appearance" | "security";

const TABS: {
  desc: string;
  icon: React.ElementType;
  id: Tab;
  label: string;
}[] = [
  { desc: "Personal information", icon: User, id: "profile", label: "Profile" },
  {
    desc: "Look and feel",
    icon: Palette,
    id: "appearance",
    label: "Appearance",
  },
  {
    desc: "Sign out and sessions",
    icon: Shield,
    id: "security",
    label: "Security",
  },
];

function ProfilePanel() {
  const { user } = useAuth();
  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";
  const email = user?.email ?? "";
  const role = user?.role ?? "user";

  const initials = React.useMemo(() => {
    const f = firstName.trim().charAt(0).toUpperCase();
    const l = lastName.trim().charAt(0).toUpperCase();
    return f + l || email.slice(0, 2).toUpperCase() || "?";
  }, [firstName, lastName, email]);

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/30 px-4 py-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#E91E63] text-lg font-semibold text-white ring-2 ring-border">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-foreground">
            {firstName || lastName
              ? `${firstName} ${lastName}`.trim()
              : user?.name || "Unnamed user"}
          </p>
          <p className="text-sm text-muted-foreground truncate">{email}</p>
          <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary">
            {role}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            htmlFor="fn"
          >
            First name
          </Label>
          <Input
            className="h-9"
            id="fn"
            readOnly
            value={firstName}
          />
        </div>
        <div className="space-y-1.5">
          <Label
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            htmlFor="ln"
          >
            Last name
          </Label>
          <Input className="h-9" id="ln" readOnly value={lastName} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Email
        </Label>
        <Input className="h-9 cursor-default opacity-60" readOnly value={email} />
        <p className="text-xs text-muted-foreground">
          Profile editing is coming soon.
        </p>
      </div>
    </div>
  );
}

function AppearancePanel() {
  const { setTheme, theme } = useTheme();

  const options = [
    { desc: "Always light", icon: Sun, label: "Light", value: "light" },
    { desc: "Always dark", icon: Moon, label: "Dark", value: "dark" },
    { desc: "Follows OS", icon: Monitor, label: "System", value: "system" },
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Theme</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Select your preferred color scheme.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {options.map(({ desc, icon: Icon, label, value }) => {
          const active = theme === value;
          return (
            <button
              className={cn(
                "group flex flex-col items-center gap-3 rounded-xl border-2 p-4 text-center transition-all",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-border/60 hover:bg-accent/30"
              )}
              key={value}
              onClick={() => setTheme(value)}
              type="button"
            >
              <Icon className="h-5 w-5 text-muted-foreground" />
              <div className="text-sm font-medium">{label}</div>
              <p className="text-xs text-muted-foreground">{desc}</p>
              {active && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SecurityPanel() {
  const { logout } = useAuth();

  return (
    <div className="space-y-7">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Sessions</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Sign out of this device.
        </p>
        <Button
          className="gap-2"
          onClick={() => {
            void logout();
          }}
          size="sm"
          variant="destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

interface SettingsModalProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function SettingsModal({ onOpenChange, open }: SettingsModalProps) {
  const [tab, setTab] = React.useState<Tab>("profile");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-[820px] p-0 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl [&>button]:hidden">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex">
          <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-muted/20 dark:bg-[#0d0d0d]">
            <div className="px-4 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Settings
              </p>
            </div>
            <nav className="flex flex-col gap-0.5 px-2">
              {TABS.map(({ icon: Icon, id, label }) => (
                <button
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left",
                    tab === id
                      ? "bg-primary/10 text-primary dark:bg-white/[0.08] dark:text-white"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  key={id}
                  onClick={() => setTab(id)}
                  type="button"
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                  {label}
                </button>
              ))}
            </nav>
          </aside>

          <div className="flex flex-1 flex-col min-w-0">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {active.label}
                </h2>
                <p className="text-xs text-muted-foreground">{active.desc}</p>
              </div>
              <button
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => onOpenChange(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-6 min-h-[320px] max-h-[480px]">
              {tab === "profile" && <ProfilePanel />}
              {tab === "appearance" && <AppearancePanel />}
              {tab === "security" && <SecurityPanel />}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
