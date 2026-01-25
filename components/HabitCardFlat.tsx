"use client";

import { Check, Trash2, MoreHorizontal, Pencil, X, Loader2, Edit2, Trash } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateHabitName } from "@/app/actions/habitActions";

type HabitCardFlatProps = {
    id: string;
    name: string;
    streak: number;
    completedDates: string[];
    defaultCompleted?: boolean;
    currentDate?: string;
};

export default function HabitCardFlat({
    id,
    name,
    streak,
    completedDates,
    defaultCompleted = false,
    currentDate
}: HabitCardFlatProps) {
    const router = useRouter();
    const supabase = createClient();
    const today = new Date().toISOString().split('T')[0];
    const dateToUse = currentDate || today;

    const [isCompleted, setIsCompleted] = useState(defaultCompleted);
    const [isLoading, setIsLoading] = useState(false);
    const [showActions, setShowActions] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(name);
    const [isSaving, setIsSaving] = useState(false);

    // Swipe state
    const [swipeStart, setSwipeStart] = useState(0);
    const [swipeOffset, setSwipeOffset] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);

    // Aktualizuj status checkboxa gdy zmieni się dzień
    useEffect(() => {
        setIsCompleted(completedDates.includes(dateToUse));
    }, [currentDate, completedDates, dateToUse]);

    // Swipe handlers
    const handleTouchStart = (e: React.TouchEvent) => {
        setSwipeStart(e.touches[0].clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        const currentX = e.touches[0].clientX;
        const offset = currentX - swipeStart;
        // Ogranicza swipe do maksymalnie -100px na lewo
        if (offset < 0) {
            setSwipeOffset(Math.max(offset, -100));
        } else {
            setSwipeOffset(0);
        }
    };

    const handleTouchEnd = () => {
        // Jeśli przesuniętо dostatecznie daleko, pokaż akcje
        if (swipeOffset < -50) {
            setSwipeOffset(-100);
        } else {
            setSwipeOffset(0);
        }
    };

    const closeSwipe = () => {
        setSwipeOffset(0);
    };

    const toggleHabit = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isLoading) return;
        setIsLoading(true);

        const newState = !isCompleted;
        setIsCompleted(newState);

        try {
            if (newState) {
                await supabase.from("habit_logs").delete().eq("habit_id", id).eq("completed_date", dateToUse);
                await supabase.from("habit_logs").insert({ habit_id: id, completed_date: dateToUse, status: "done" });
            } else {
                await supabase.from("habit_logs").delete().eq("habit_id", id).eq("completed_date", dateToUse);
            }
            router.refresh();
        } catch (error) {
            setIsCompleted(!newState);
        } finally {
            setIsLoading(false);
        }
    };

    const saveEdit = async () => {
        if (!editedName.trim() || editedName === name) {
            setIsEditing(false);
            return;
        }

        setIsSaving(true);
        const result = await updateHabitName(id, editedName.trim());
        setIsSaving(false);

        if (result.error) {
            alert("Błąd podczas edycji: " + result.error);
        } else {
            router.refresh();
            setIsEditing(false);
        }
    };

    const deleteHabit = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Usunąć nawyk "${name}"?`)) return;
        await supabase.from("habits").delete().eq("id", id);
        router.refresh();
    };

    // Oblicz procent wykonania (ostatnie 30 dni)
    const last30Days = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
    });
    const completed30 = last30Days.filter(date => completedDates.includes(date)).length;
    const progressPercent = (completed30 / 30) * 100;

    if (isEditing) {
        return (
            <div className="px-4 lg:px-8 py-4 bg-gray-900/50 border-y border-gray-800/30">
                <div className="flex items-center gap-3 mb-3">
                    <input
                        autoFocus
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") setIsEditing(false);
                        }}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                        placeholder="Nazwa nawyku"
                    />
                    <button
                        onClick={saveEdit}
                        disabled={isSaving}
                        className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs rounded transition-colors disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : "OK"}
                    </button>
                    <button
                        onClick={() => setIsEditing(false)}
                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-100 text-xs rounded transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden">
            {/* Tło dla akcji - pokaż się przy swipe */}
            {swipeOffset < 0 && (
                <div className="absolute inset-0 flex items-center justify-end bg-red-500/20 pr-4 gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsEditing(true);
                            closeSwipe();
                        }}
                        className="p-2 text-gray-200 hover:text-white transition-colors"
                        title="Edytuj"
                    >
                        <Edit2 size={18} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            deleteHabit(e as any);
                            closeSwipe();
                        }}
                        className="p-2 text-red-400 hover:text-red-300 transition-colors"
                        title="Usuń"
                    >
                        <Trash size={18} />
                    </button>
                </div>
            )}

            {/* Główna karta */}
            <div
                ref={cardRef}
                className="group px-4 lg:px-8 py-3 lg:py-4 hover:bg-gray-900/30 transition-colors relative cursor-pointer bg-[#0d0d0d]"
                onClick={() => router.push(`/habits/${id}`)}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                    transform: `translateX(${swipeOffset}px)`,
                    transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none'
                }}
            >
                <div className="flex items-center gap-4">
                    {/* CHECKBOX */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleHabit(e);
                        }}
                        disabled={isLoading}
                        className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${isCompleted
                            ? "bg-emerald-500 border-emerald-500 scale-105"
                            : "border-gray-600 hover:border-gray-500"
                            } ${isLoading ? "opacity-50" : ""}`}
                    >
                        {isCompleted && <Check size={14} className="text-white" strokeWidth={3} />}
                    </button>

                    {/* NAZWA NAWYKU */}
                    <div className="flex-1 min-w-0">
                        <p className={`text-base font-medium transition-colors ${isCompleted ? "text-gray-400 line-through" : "text-gray-100"
                            }`}>
                            {name}
                        </p>

                        {/* PROGRESS BAR */}
                        <div className="mt-2 h-[2px] bg-gray-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gray-600 transition-all"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>

                    {/* STREAK BADGE (tylko jeśli > 2) */}
                    {streak > 2 && (
                        <div className="flex-shrink-0 text-xs text-gray-400 font-medium">
                            {streak}🔥
                        </div>
                    )}

                    {/* ACTIONS MENU - tylko na desktop */}
                    <div className="relative flex-shrink-0 hidden lg:block">
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowActions(!showActions);
                            }}
                            className="p-1 text-gray-600 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <MoreHorizontal size={16} />
                        </button>

                        {showActions && (
                            <>
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setShowActions(false)}
                                />
                                <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-20 py-1 min-w-[140px]">
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setIsEditing(true);
                                            setShowActions(false);
                                        }}
                                        className="w-full px-3 py-2 text-left text-xs text-blue-400 hover:bg-gray-800 flex items-center gap-2"
                                    >
                                        <Pencil size={12} />
                                        Edytuj
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            deleteHabit(e as any);
                                            setShowActions(false);
                                        }}
                                        className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-gray-800 flex items-center gap-2"
                                    >
                                        <Trash2 size={12} />
                                        Usuń
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
