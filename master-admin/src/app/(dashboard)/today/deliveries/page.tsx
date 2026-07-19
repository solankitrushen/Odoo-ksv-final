"use client";

import { TodayWorklistPage } from "@/components/features/ops/today-worklist-page";

export default function TodayDeliveriesPage() {
  return (
    <TodayWorklistPage
      emptyMessage="No deliveries for today."
      endpoint="/admin/deliveries"
      queryKey="deliveries"
      title="Today's deliveries"
    />
  );
}
