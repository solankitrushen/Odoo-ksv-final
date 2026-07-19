"use client";

import { TodayWorklistPage } from "@/components/features/ops/today-worklist-page";

export default function TodayReturnsPage() {
  return (
    <TodayWorklistPage
      emptyMessage="No returns due today."
      endpoint="/admin/returns"
      queryKey="returns"
      title="Today's returns"
    />
  );
}
