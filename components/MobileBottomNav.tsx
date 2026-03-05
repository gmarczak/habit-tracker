"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarRange, Settings } from "lucide-react";
import AddHabitButton from "./AddHabitButton";

export default function MobileBottomNav() {
    const pathname = usePathname();

    const navItems = [
        { name: "Dzisiaj", href: "/", icon: LayoutDashboard },
        { name: "Rok", href: "/yearly-summary", icon: CalendarRange },
    ];

    return (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-md border-t border-border px-6 py-3 pb-safe z-50">
            <div className="flex items-center justify-between max-w-sm mx-auto relative">

                {/* Dzisiaj */}
                <Link
                    href="/"
                    className={`flex flex-col items-center gap-1 p-2 ${pathname === "/" ? "text-primary-green" : "text-text-secondary"}`}
                >
                    <LayoutDashboard size={24} />
                    <span className="text-[10px] font-medium">Dzisiaj</span>
                </Link>

                {/* FAB (Add Habit) - Center */}
                <div className="absolute left-1/2 -translate-x-1/2 -top-8">
                    <AddHabitButton isBottomNav={true} />
                </div>

                {/* Rok */}
                <Link
                    href="/yearly-summary"
                    className={`flex flex-col items-center gap-1 p-2 ${pathname === "/yearly-summary" ? "text-primary-green" : "text-text-secondary"}`}
                >
                    <CalendarRange size={24} />
                    <span className="text-[10px] font-medium">Rok</span>
                </Link>

            </div>
        </div>
    );
}
