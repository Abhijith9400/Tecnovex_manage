"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { homeFor } from "@/lib/navigation";

/** Sends each role to the first section it can use. */
export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => router.replace(homeFor(user.role)), [router, user.role]);
  return <Spinner />;
}
