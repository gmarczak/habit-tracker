"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import HabitCalendar from "./HabitCalendar";
import HabitChart from "./HabitChart";

type HabitDetailsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    habitId: string;
    habitName: string;
    completedDates: string[];
    currentStreak: number;
    bestStreak: number;
    completion7: number;
    completion30: number;
    totalCompletions: number;
};

export default function HabitDetailsModal({
    isOpen,
    onClose,
    habitId,
    habitName,
    completedDates,
    currentStreak,
    bestStreak,
    completion7,
    completion30,
    totalCompletions,
}: HabitDetailsModalProps) {
    const sheetRef = useRef<HTMLDivElement>(null);
    const startYRef = useRef(0);

    useEffect(() => {
        if (!isOpen) return;

        const handleTouchStart = (e: TouchEvent) => {
            startYRef.current = e.targetTouches[0].clientY;
        };

        const handleTouchEnd = (e: TouchEvent) => {
            const endY = e.changedTouches[0].clientY;
            const diff = endY - startYRef.current;
            const minSwipeDistance = 100;

            if (diff > minSwipeDistance) {
                onClose();
            }
        };

        const element = sheetRef.current;
        element?.addEventListener("touchstart", handleTouchStart);
        element?.addEventListener("touchend", handleTouchEnd);

        return () => {
            element?.removeEventListener("touchstart", handleTouchStart);
            element?.removeEventListener("touchend", handleTouchEnd);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <>
            {/* BACKDROP */}
            <div
                className="fixed inset-0 bg-black/40 z-40 transition-opacity"
                onClick={onClose}
            />

            {/* BOTTOM SHEET */}
            <div
                ref={sheetRef}
                className="fixed bottom-0 left-0 right-0 bg-[#0d0d0d] rounded-t-2xl z-50 flex flex-col max-h-[92vh] overflow-hidden animate-in slide-in-from-bottom"
            >
                {/* HANDLE + HEADER */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-800/30">
                    <div className="flex-1">
                        <h2 className="text-xl font-semibold text-gray-100">{habitName}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                        aria-label="Close"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* DRAG INDICATOR */}
                <div className="flex-shrink-0 flex justify-center py-2">
                    <div className="w-10 h-1 bg-gray-700 rounded-full" />
                </div>

                {/* CONTENT - SCROLLABLE */}
                <div className="flex-1 overflow-y-auto px-6 pb-8">
                    {/* QUICK STATS - 2x2 GRID */}
                    <div className="mt-4 grid grid-cols-2 gap-3 mb-6">
                        <div className="bg-gray-900/50 rounded-lg p-3">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Aktualny</p>
                            <p className="text-2xl font-bold text-orange-400">{currentStreak}🔥</p>
                        </div>
                        <div className="bg-gray-900/50 rounded-lg p-3">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Best</p>
                            <p className="text-2xl font-bold text-yellow-400">{bestStreak}🏆</p>
                        </div>
                        <div className="bg-gray-900/50 rounded-lg p-3">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">7 dni</p>
                            <p className="text-2xl font-bold text-emerald-400">{completion7}%</p>
                        </div>
                        <div className="bg-gray-900/50 rounded-lg p-3">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">30 dni</p>
                            <p className="text-2xl font-bold text-blue-400">{completion30}%</p>
                        </div>
                    </div>

                    {/* CALENDAR */}
                    <div className="mb-6">
                        <h3 className="text-sm font-semibold text-gray-300 mb-3">Kalendarz</h3>
                        <div className="bg-gray-900/20 rounded-lg border border-gray-800/30 p-4">
                            <HabitCalendar completedDates={completedDates} />
                        </div>
                    </div>

                    {/* CHART */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-300 mb-3">Postępy (30 dni)</h3>
                        <div className="bg-gray-900/20 rounded-lg border border-gray-800/30 p-4">
                            <HabitChart completedDates={completedDates} days={30} />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
