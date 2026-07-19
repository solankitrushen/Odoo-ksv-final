"use client";

import { useAuth } from "@/contexts/auth-context";

/** Query-key scope for rental data; "default" until the operator is resolved. */
export function useRentalScope(): string {
  const { rentalScope } = useAuth();
  return rentalScope ?? "default";
}
