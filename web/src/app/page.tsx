"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    router.replace(authenticated ? "/today" : "/login");
  }, [ready, authenticated, router]);
  return null;
}
