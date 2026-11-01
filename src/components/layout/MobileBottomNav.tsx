"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calculator,
  Eraser,
  Sparkles,
  Brain,
  Menu,
} from "lucide-react";

interface MobileBottomNavProps {
  onOpenSidebar: () => void;
}

export function MobileBottomNav({ onOpenSidebar }: MobileBottomNavProps) {
  const pathname = usePathname();

  const navItems = [
    {
      label: "ទំព័រដើម",
      subLabel: "Home",
      href: "/",
      icon: LayoutDashboard,
      activeColor: "text-indigo-400",
      activeBg: "bg-indigo-500/10",
      activeBorder: "border-indigo-500/40",
    },
    {
      label: "OCR",
      subLabel: "Formula",
      href: "/plp-math-content",
      icon: Calculator,
      activeColor: "text-cyan-400",
      activeBg: "bg-cyan-500/10",
      activeBorder: "border-cyan-500/40",
    },
    {
      label: "កាត់រូប",
      subLabel: "Cutout",
      href: "/bg-remover",
      icon: Eraser,
      activeColor: "text-emerald-400",
      activeBg: "bg-emerald-500/10",
      activeBorder: "border-emerald-500/40",
    },
    {
      label: "ពង្រីក HD",
      subLabel: "Upscale",
      href: "/image-upscaler",
      icon: Sparkles,
      activeColor: "text-amber-400",
      activeBg: "bg-amber-500/10",
      activeBorder: "border-amber-500/40",
    },
    {
      label: "ដោះស្រាយ",
      subLabel: "Solver",
      href: "/math-solver",
      icon: Brain,
      activeColor: "text-violet-400",
      activeBg: "bg-violet-500/10",
      activeBorder: "border-violet-500/40",
    },
  ];

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-slate-800/80 bg-slate-950/95 backdrop-blur-md px-1.5 safe-area-bottom-bar shadow-2xl"
      aria-label="Mobile Navigation"
    >
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 ${
                isActive
                  ? `${item.activeColor} ${item.activeBg} font-semibold`
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="h-5 w-5 mb-0.5" />
              <span className="text-[10px] leading-tight tracking-tight font-sans">
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Drawer Menu Button */}
        <button
          type="button"
          onClick={onOpenSidebar}
          className="flex flex-1 flex-col items-center justify-center py-1 px-1 rounded-xl text-slate-400 hover:text-slate-200 transition-all duration-150"
          aria-label="More navigation options"
        >
          <Menu className="h-5 w-5 mb-0.5 text-slate-400" />
          <span className="text-[10px] leading-tight tracking-tight font-sans text-slate-400">
            ម៉ឺនុយ
          </span>
        </button>
      </div>
    </nav>
  );
}

