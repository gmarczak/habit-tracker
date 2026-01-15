"use client";

import { Check, Trash2, Flame, Pencil, ChevronRight, X, Loader2 } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import MiniHeatmap from "./MiniHeatmap";
import { updateHabitName } from "@/app/actions/habitActions";

type HabitCardProps = {
    id: string;
    name: string;
    streak: number;
    completedDates: string[]; // Historia dat z bazy
    skippedDates?: string[];
    tags?: string[];
    archived?: boolean;
    defaultCompleted?: boolean;
};

export default function HabitCard({ id, name, streak, completedDates, skippedDates = [], tags = [], archived = false, defaultCompleted = false }: HabitCardProps) {
    const router = useRouter();
    const supabase = createClient();
    const [isCompleted, setIsCompleted] = useState(defaultCompleted);
    const [isLoading, setIsLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(name);
    const [isSaving, setIsSaving] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);

    // Funkcja wywołująca konfetti
    const triggerConfetti = () => {
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 999 };
        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval = window.setInterval(() => {
            const timeLeft = 500; // Czas trwania animacji
            // ...skrócona logika konfetti dla efektu "wybuchu"
        }, 250);

        confetti({
            origin: { y: 0.7 },
            particleCount: 100,
            spread: 70,
        });
    };

    const toggleHabit = async () => {
        if (isLoading) return;
        setIsLoading(true);

        const newState = !isCompleted;
        setIsCompleted(newState);

        // Jeśli odhaczamy (robimy na zielono), strzelamy konfetti!
        if (newState) {
            triggerConfetti();
        }

        const today = new Date().toISOString().split('T')[0];

        try {
            if (newState) {
                // robust: delete then insert (works even without unique constraints)
                await supabase
                    .from("habit_logs")
                    .delete()
                    .eq("habit_id", id)
                    .eq("completed_date", today);
                await supabase.from("habit_logs").insert({ habit_id: id, completed_date: today, status: "done" });
            } else {
                await supabase
                    .from("habit_logs")
                    .delete()
                    .eq("habit_id", id)
                    .eq("completed_date", today);
            }
            router.refresh();
        } catch (error) {
            console.error("Błąd zapisu:", error);
            setIsCompleted(!newState);
        } finally {
            setIsLoading(false);
        }
    };

    const archiveHabit = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const { error } = await supabase
            .from("habits")
            .update({ archived: true })
            .eq("id", id);
        if (error) {
            alert("Nie udało się zarchiwizować. Dodaj kolumnę 'archived' w tabeli habits.");
            console.error(error);
            return;
        }
        router.refresh();
    };

    const restoreHabit = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const { error } = await supabase
            .from("habits")
            .update({ archived: false })
            .eq("id", id);
        if (error) {
            alert("Nie udało się przywrócić. Dodaj kolumnę 'archived' w tabeli habits.");
            console.error(error);
            return;
        }
        router.refresh();
    };

    const deleteHabit = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Czy na pewno chcesz usunąć ten nawyk?")) return;
        const { error } = await supabase.from("habits").delete().eq("id", id);
        if (!error) router.refresh();
    };

    const openEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditedName(name);
        setIsEditing(true);
    };

    const goToDetails = (e: React.MouseEvent) => {
        e.stopPropagation();
        router.push(`/habits/${id}`);
    };

    const handleLongPressStart = (e: React.TouchEvent) => {
        const timer = setTimeout(() => {
            setShowMobileMenu(true);
        }, 500); // 500ms long press
        setLongPressTimer(timer);
    };

    const handleLongPressEnd = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            setLongPressTimer(null);
        }
    };

    const saveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        const nextName = editedName.trim();
        if (!nextName || nextName === name) {
            setIsEditing(false);
            return;
        }

        setIsSaving(true);

        const result = await updateHabitName(id, nextName);

        setIsSaving(false);

        if (result.error) {
            alert("Błąd: " + result.error);
            return;
        }

        // Sukces
        setIsEditing(false);
        router.refresh();
    };

    // --- LOGIKA HEATMAPY (Ostatnie dni) ---
    const last30Days = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        return d.toISOString().split('T')[0];
    });

    return (
        <>
            <div
                className={`
                    group grid grid-cols-[auto,1fr] gap-4
                    p-4 md:p-5 rounded-2xl border transition-colors duration-200
                    select-none relative overflow-hidden backdrop-blur-sm
                    border-white/10 hover:border-white/20 hover:bg-white/[0.03]
                    ${isCompleted ? "ring-1 ring-emerald-500/20" : ""}
                `}
                onTouchStart={handleLongPressStart}
                onTouchEnd={handleLongPressEnd}
                onTouchMove={handleLongPressEnd}
            >
                {/* Streak badge in top-right */}
                <div className="absolute top-3 right-3">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                        bg-orange-500/15 text-orange-300 border border-orange-500/30 shadow-sm">
                        <Flame size={14} className="fill-orange-300" />
                        <span className="text-xs font-semibold tabular-nums">{streak}</span>
                    </div>
                </div>
                {/* Checkbox column (left), vertically centered */}
                <div className="self-stretch flex items-center">
                    <button
                        onClick={toggleHabit}
                        className={`
                            flex-shrink-0 flex items-center justify-center
                            w-10 h-10 md:w-11 md:h-11 rounded-xl border-2 transition-all duration-200
                            shadow-md cursor-pointer
                            ${isCompleted
                                ? "bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-400 shadow-emerald-500/40"
                                : "bg-gray-800/60 border-gray-600/70 hover:border-gray-500 hover:bg-gray-700/50"
                            }
                        `}
                    >
                        {isCompleted && <Check size={18} className="text-white stroke-[3]" />}
                    </button>
                </div>

                {/* Content column (right) */}
                <div className="flex flex-col gap-2 min-w-0">
                    {/* Top row: habit name */}
                    <div className="flex items-start justify-between">
                        <div className="min-w-0">
                            <h3 className={`
                                text-lg md:text-xl font-semibold truncate
                                ${isCompleted ? "text-emerald-50 line-through decoration-emerald-400/60" : "text-white"}
                            `}>
                                {name}
                            </h3>
                            {tags.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                    {tags.slice(0, 2).map((t) => (
                                        <span
                                            key={t}
                                            className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800/60 text-gray-400 border border-gray-700/50"
                                        >
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Heatmap row under the name (GitHub-like) */}
                    <div className="flex items-center">
                        <div className="flex lg:hidden">
                            <MiniHeatmap
                                completedDates={completedDates}
                                skippedDates={skippedDates}
                                days={7}
                                className="gap-1.5"
                            />
                        </div>
                        <div className="hidden lg:flex">
                            <MiniHeatmap
                                completedDates={completedDates}
                                skippedDates={skippedDates}
                                days={30}
                                className="gap-1.5"
                            />
                        </div>
                    </div>
                </div>

                {/* Akcje (tylko desktop, na hover) */}
                <div className="hidden md:flex items-center gap-1 col-span-2 justify-end z-10">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            openEdit(e);
                        }}
                        className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hover:scale-110"
                        aria-label="Edytuj nawyk"
                    >
                        <Pencil size={16} />
                    </button>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            goToDetails(e);
                        }}
                        className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hover:scale-110"
                        aria-label="Szczegóły nawyku"
                    >
                        <ChevronRight size={16} />
                    </button>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            deleteHabit(e);
                        }}
                        className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hover:scale-110"
                        aria-label="Usuń nawyk"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            {isEditing && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setIsEditing(false)}
                >
                    <div
                        className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setIsEditing(false)}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                            aria-label="Zamknij"
                        >
                            <X size={20} />
                        </button>

                        <h2 className="text-xl font-bold text-white mb-1">Edytuj nawyk</h2>
                        <p className="text-gray-400 text-sm mb-6">Zmień nazwę nawyku.</p>

                        <form onSubmit={saveEdit} className="flex flex-col gap-4">
                            <input
                                autoFocus
                                type="text"
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                placeholder="Np. Czytanie 10 minut..."
                            />

                            <div className="flex gap-3 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(false)}
                                    className="flex-1 py-3 px-4 rounded-lg bg-gray-800 text-gray-300 font-medium hover:bg-gray-700 transition-colors"
                                >
                                    Anuluj
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving || !editedName.trim()}
                                    className="flex-1 py-3 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    {isSaving ? <Loader2 className="animate-spin" /> : "Zapisz"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Mobile Menu Modal */}
            {showMobileMenu && (
                <div
                    className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowMobileMenu(false)}
                >
                    <div
                        className="bg-gray-900 border-t md:border border-gray-800 w-full md:max-w-sm md:rounded-2xl shadow-2xl p-6 relative rounded-t-3xl md:rounded-b-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-12 h-1 bg-gray-700 rounded-full mx-auto mb-4 md:hidden"></div>

                        <h2 className="text-xl font-bold text-white mb-4">{name}</h2>

                        <div className="flex flex-col gap-2">
                            <button
                                onClick={(e) => {
                                    setShowMobileMenu(false);
                                    openEdit(e);
                                }}
                                className="w-full py-3 px-4 rounded-lg bg-gray-800 text-white font-medium hover:bg-gray-700 transition-colors flex items-center gap-3"
                            >
                                <Pencil size={18} />
                                <span>Edytuj nazwę</span>
                            </button>

                            <button
                                onClick={(e) => {
                                    setShowMobileMenu(false);
                                    goToDetails(e);
                                }}
                                className="w-full py-3 px-4 rounded-lg bg-gray-800 text-white font-medium hover:bg-gray-700 transition-colors flex items-center gap-3"
                            >
                                <ChevronRight size={18} />
                                <span>Zobacz szczegóły</span>
                            </button>

                            <button
                                onClick={(e) => {
                                    setShowMobileMenu(false);
                                    deleteHabit(e);
                                }}
                                className="w-full py-3 px-4 rounded-lg bg-red-900/30 text-red-400 font-medium hover:bg-red-900/50 transition-colors flex items-center gap-3"
                            >
                                <Trash2 size={18} />
                                <span>Usuń nawyk</span>
                            </button>

                            <button
                                onClick={() => setShowMobileMenu(false)}
                                className="w-full py-3 px-4 rounded-lg bg-gray-800 text-gray-300 font-medium hover:bg-gray-700 transition-colors mt-2"
                            >
                                Anuluj
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}