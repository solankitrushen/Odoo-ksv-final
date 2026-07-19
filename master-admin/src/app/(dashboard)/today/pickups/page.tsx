"use client";

import { TodayWorklistPage } from "@/components/features/ops/today-worklist-page";

export default function TodayPickupsPage() {
  return (
    <TodayWorklistPage
      emptyMessage="No pickups scheduled for today."
      endpoint="/admin/pickups"
      queryKey="pickups"
      title="Today's pickups"
    />
  );
}
