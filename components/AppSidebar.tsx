"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarRange, Settings, User } from "lucide-react";

export default function AppSidebar() {
    const pathname = usePathname();

    const navItems = [
        { name: "Dzisiaj", href: "/", icon: LayoutDashboard },
        { name: "Rok", href: "/yearly-summary", icon: CalendarRange },
    ];

    return (
        <aside className="w-64 border-r border-border bg-surface flex flex-col h-full shadow-sm z-10 flex-shrink-0">
            {/* LOGO */}
            <div className="p-6">
                <Link href="/" className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-green to-primary-teal flex items-center justify-center shadow-sm">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-green to-primary-teal">
                        Habits
                    </span>
                </Link>
            </div>

            {/* NAV LINKS */}
            <nav className="flex-1 px-4 space-y-2 mt-4">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive
                                    ? "bg-primary-green/10 text-primary-green font-medium"
                                    : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
                                }`}
                        >
                            <Icon size={20} className={isActive ? "text-primary-green" : "text-text-secondary"} />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>

            {/* BOTTOM SECTION */}
            <div className="p-4 border-t border-border mt-auto">
                <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-text-secondary hover:bg-surface-alt hover:text-text-primary">
                    <Settings size={20} />
                    <span>Ustawienia</span>
                </button>
            </div>
        </aside>
    );
}
