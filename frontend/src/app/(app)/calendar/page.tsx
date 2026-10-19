"use client";

import { RequireRole } from "@/features/auth/RequireRole";
import { CalendarApp } from "@/features/calendar/CalendarApp";

export default function CalendarPage() {
  return (
    <RequireRole roles={["ADMIN", "ACCOUNTANT", "MANAGER", "EMPLOYEE"]}>
      <CalendarApp />
    </RequireRole>
  );
}
