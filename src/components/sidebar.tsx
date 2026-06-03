"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Building2,
  Users,
  Mail,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/applications", label: "Applications", icon: Briefcase },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/email-allowlist", label: "Email allowlist", icon: Mail },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  userSlot: React.ReactNode;
}

export function Sidebar({ userSlot }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center gap-2 px-5">
        <div className="grid h-6 w-6 place-items-center rounded-md bg-accent/15 text-accent">
          <span className="text-xs font-semibold">OT</span>
        </div>
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Opportunities
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 pt-2">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-surface-elevated text-foreground"
                  : "text-foreground-muted hover:bg-surface-elevated hover:text-foreground",
              )}
            >
              <Icon size={15} strokeWidth={1.75} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {userSlot}
    </aside>
  );
}
