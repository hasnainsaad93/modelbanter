"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPage } from "@/lib/analytics/client";
export function UsageAnalytics() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    trackPage(pathname);
  }, [pathname]);
  return null;
}
