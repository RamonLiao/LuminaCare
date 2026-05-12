"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText, User } from "lucide-react";

const tabs = [
  { href: "/today", label: "今日", icon: Home },
  { href: "/records", label: "病歷", icon: FileText },
  { href: "/me", label: "我", icon: User },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 border-t bg-white">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link key={href} href={href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-xs ${active ? "text-sky-600" : "text-slate-500"}`}>
            <Icon size={22} />{label}
          </Link>
        );
      })}
    </nav>
  );
}
