"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Settings, LogOut, ChevronRight, HelpCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/auth-context";

function getInitials(
  user: { email?: string; firstName?: string; lastName?: string } | null
): string {
  if (!user) return "??";
  const first = user.firstName?.trim().charAt(0) ?? "";
  const last = user.lastName?.trim().charAt(0) ?? "";
  if (first && last) return `${first}${last}`.toUpperCase();
  if (first) return `${first}${first}`.toUpperCase();
  const email = user.email ?? "";
  if (email.length >= 2) return email.slice(0, 2).toUpperCase();
  return "??";
}

interface ProfileDropdownProps extends React.HTMLAttributes<HTMLDivElement> {
  showTopbar?: boolean;
  onOpenSettings?: () => void;
}

export default function ProfileDropdown({
  className,
  onOpenSettings,
  ...props
}: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [triggerWidth, setTriggerWidth] = React.useState<number | null>(null);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  const router = useRouter();

  const name =
    user
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
        user.email ||
        "User"
      : "User";
  const email = user?.email ?? "";
  const displayName = name || "User";
  const initials = getInitials(user);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && triggerRef.current) {
      setTriggerWidth(triggerRef.current.offsetWidth);
    } else {
      setTriggerWidth(null);
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.push("/auth/login");
  };

  return (
    <div className={cn("relative w-full", className)} {...props}>
      <DropdownMenu onOpenChange={handleOpenChange}>
        <div ref={triggerRef} className="w-full">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 bg-transparent dark:bg-transparent border-0 rounded-none hover:bg-accent/50 dark:hover:bg-[#2a2a2a] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset text-left"
            >
              <div className="w-9 h-9 rounded-full bg-[#E91E63] flex items-center justify-center text-white text-sm font-semibold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground dark:text-white truncate">
                  {displayName}
                </div>
                <div className="text-xs text-muted-foreground dark:text-[#a3a3a3] truncate">{email || "—"}</div>
              </div>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            side="top"
            sideOffset={8}
            style={triggerWidth != null ? { width: Math.max(triggerWidth, 280) } : undefined}
            className={cn(
              "p-0 overflow-hidden rounded-xl border border-border dark:border-[#2a2a2a] bg-popover dark:bg-[#1c1c1c] text-popover-foreground dark:text-[#fafafa] shadow-xl",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "data-[side=top]:slide-in-from-bottom-2 origin-bottom"
            )}
          >
            {/* User block at top */}
            <div className="flex items-center gap-2.5 p-3">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#E91E63] via-purple-500 to-orange-500 p-0.5">
                  <div className="w-full h-full rounded-full bg-background dark:bg-[#0a0a0a] flex items-center justify-center text-foreground dark:text-white text-sm font-semibold">
                    {initials}
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground dark:text-white truncate">
                  {displayName}
                </div>
                <div className="text-xs text-muted-foreground dark:text-[#a3a3a3] truncate">
                  {email || "—"}
                </div>
              </div>
            </div>

            <DropdownMenuSeparator className="bg-border dark:bg-[#2a2a2a]" />

            <div className="p-1">
              {onOpenSettings ? (
                <DropdownMenuItem asChild>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSettings();
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-foreground dark:text-[#fafafa] hover:bg-accent dark:hover:bg-[#252525] focus:bg-accent dark:focus:bg-[#252525] outline-none cursor-pointer text-left"
                  >
                    <Settings className="h-4 w-4 shrink-0 text-muted-foreground dark:text-[#a3a3a3]" />
                    <span>Settings</span>
                  </button>
                </DropdownMenuItem>
              ) : null}
            </div>


            <div className="p-1">
              <DropdownMenuItem asChild>
                <Link
                  href="#"
                  className="flex items-center justify-between gap-2 w-full px-2.5 py-2 rounded-lg text-sm font-medium text-foreground dark:text-[#fafafa] hover:bg-accent dark:hover:bg-[#252525] focus:bg-accent dark:focus:bg-[#252525] outline-none cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground dark:text-[#a3a3a3]" />
                    Help
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground dark:text-[#737373]" />
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-sm font-medium text-foreground dark:text-[#fafafa] hover:bg-accent dark:hover:bg-[#252525] focus:bg-accent dark:focus:bg-[#252525] outline-none cursor-pointer text-left"
                >
                  <LogOut className="h-4 w-4 shrink-0 text-muted-foreground dark:text-[#a3a3a3]" />
                  <span>Log out</span>
                </button>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </div>
      </DropdownMenu>
    </div>
  );
}
