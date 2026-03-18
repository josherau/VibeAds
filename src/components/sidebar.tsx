"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Brain,
  Palette,
  Settings,
  Sparkles,
  Zap,
  Menu,
  Building2,
  ChevronDown,
  Check,
  Plus,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBrand } from "@/lib/brand-context";

const navItems = [
  { href: "/setup", label: "Setup", icon: Sparkles },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/competitors", label: "Competitors", icon: Users },
  { href: "/briefing", label: "CMO Briefing", icon: ClipboardList },
  { href: "/intelligence", label: "Intelligence", icon: Brain },
  { href: "/creatives", label: "Creatives", icon: Palette },
  { href: "/settings", label: "Settings", icon: Settings },
];

function BrandSelector() {
  const { brands, selectedBrand, setSelectedBrandId } = useBrand();

  if (brands.length === 0) {
    return (
      <Link href="/setup">
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors cursor-pointer">
          <Plus className="h-4 w-4" />
          Add a business
        </div>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="flex w-full items-center gap-2 rounded-lg border border-border bg-accent/50 px-3 py-2 text-left text-sm hover:bg-accent transition-colors">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{
                backgroundColor: selectedBrand?.primary_color || "#6366f1",
              }}
            >
              {selectedBrand?.name?.charAt(0).toUpperCase() || "?"}
            </div>
            <span className="flex-1 truncate font-medium">
              {selectedBrand?.name || "Select business"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-[calc(240px-24px)]">
        {brands.map((brand) => (
          <DropdownMenuItem
            key={brand.id}
            onClick={() => setSelectedBrandId(brand.id)}
            className="flex items-center gap-2"
          >
            <div
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
              style={{
                backgroundColor: brand.primary_color || "#6366f1",
              }}
            >
              {brand.name.charAt(0).toUpperCase()}
            </div>
            <span className="flex-1 truncate">{brand.name}</span>
            {brand.id === selectedBrand?.id && (
              <Check className="h-3.5 w-3.5 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<Link href="/setup" className="flex items-center gap-2" />}
        >
          <Plus className="h-4 w-4" />
          Add new business
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold tracking-tight">VibeAds</span>
      </div>

      {/* Brand Selector */}
      <div className="px-3 pb-4">
        <BrandSelector />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-4 py-4">
        <p className="text-xs text-muted-foreground">
          VibeAds v0.2.0
        </p>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-60 lg:flex-col border-r border-border bg-card">
      <NavContent />
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-40 flex items-center gap-4 border-b border-border bg-card px-4 py-3 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={<Button variant="ghost" size="icon" className="-ml-2" />}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle navigation</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <NavContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <Zap className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="text-base font-bold tracking-tight">VibeAds</span>
      </div>
    </div>
  );
}
