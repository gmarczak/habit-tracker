"use client";

import { Check, Trash2, Flame, Pencil, ChevronRight, X, Loader2, Edit2, Trash } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
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
    currentDate?: string;
};

export default function HabitCard({ id, name, streak, completedDates, skippedDates = [], tags = [], archived = false, defaultCompleted = false, currentDate }: HabitCardProps) {
    const router = useRouter();
    const supabase = createClient();
    const [isCompleted, setIsCompleted] = useState(defaultCompleted);
    const [isLoading, setIsLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(name);
    const [isSaving, setIsSaving] = useState(false);

    const today = new Date().toISOString().split('T')[0];
    const dateToUse = currentDate || today;

    useEffect(() => {
        setIsCompleted(completedDates.includes(dateToUse));
    }, [currentDate, completedDates, dateToUse]);

    // Swipe state
    const [swipeStart, setSwipeStart] = useState(0);
    const [swipeOffset, setSwipeOffset] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);

    // Swipe handlers
    const handleTouchStart = (e: React.TouchEvent) => {
        setSwipeStart(e.touches[0].clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        const currentX = e.touches[0].clientX;
        const offset = currentX - swipeStart;
        if (offset < 0) {
            setSwipeOffset(Math.max(offset, -100));
        } else {
            setSwipeOffset(0);
        }
    };

    const handleTouchEnd = () => {
        if (swipeOffset < -50) {
            setSwipeOffset(-100);
        } else {
            setSwipeOffset(0);
        }
    };

    const closeSwipe = () => {
        setSwipeOffset(0);
    };

    const toggleHabit = async () => {
        if (isLoading) return;
        setIsLoading(true);

        const newState = !isCompleted;
        setIsCompleted(newState);

        try {
            if (newState) {
                // robust: delete then insert (works even without unique constraints)
                await supabase
                    .from("habit_logs")
                    .delete()
                    .eq("habit_id", id)
                    .eq("completed_date", dateToUse);
                await supabase.from("habit_logs").insert({ habit_id: id, completed_date: dateToUse, status: "done" });
            } else {
                await supabase
                    .from("habit_logs")
                    .delete()
                    .eq("habit_id", id)
                    .eq("completed_date", dateToUse);
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

    return (
        <>
            <div className="relative overflow-hidden">
                {/* Tło dla akcji - pokaż się przy swipe */}
                {swipeOffset < 0 && (
                    <div className="absolute inset-0 flex items-center justify-end bg-danger/20 pr-4 gap-2 z-0">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsEditing(true);
                                closeSwipe();
                            }}
                            className="p-2 text-text-primary hover:text-text-secondary transition-colors"
                            title="Edytuj"
                        >
                            <Edit2 size={18} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                deleteHabit(e);
                                closeSwipe();
                            }}
                            className="p-2 text-danger hover:opacity-80 transition-colors"
                            title="Usuń"
                        >
                            <Trash size={18} />
                        </button>
                    </div>
                )}

                {/* Główna karta */}
                <div
                    ref={cardRef}
                    className={`
                    group grid grid-cols-[auto,1fr] gap-4
                    p-4 md:p-5 rounded-2xl border transition-colors duration-200
                    select-none relative overflow-hidden
                    border-border hover:border-border-alt hover:bg-surface-alt
                    ${isCompleted ? "ring-1 ring-primary-green/20" : ""}
                    bg-surface shadow-sm z-10
                `}
                    onClick={(e) => goToDetails(e)}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    style={{
                        transform: `translateX(${swipeOffset}px)`,
                        transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none'
                    }}
                >
                    {/* Streak badge in top-right */}
                    <div className="absolute top-3 right-3">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                        bg-surface-alt text-orange-500 border border-border shadow-sm">
                            <Flame size={14} className="fill-orange-500" />
                            <span className="text-xs font-semibold tabular-nums">{streak}</span>
                        </div>
                    </div>
                    {/* Checkbox column (left), vertically centered */}
                    <div className="self-stretch flex items-center">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleHabit();
                            }}
                            className={`
                            flex-shrink-0 flex items-center justify-center
                            w-10 h-10 md:w-11 md:h-11 rounded-xl border-2 transition-all duration-200
                            shadow-md cursor-pointer
                            ${isCompleted
                                    ? "bg-primary-green border-primary-green shadow-sm text-white"
                                    : "bg-surface border-border-alt hover:border-text-secondary"
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
                                ${isCompleted ? "text-text-secondary line-through decoration-primary-green/60" : "text-text-primary"}
                            `}>
                                    {name}
                                </h3>
                                {tags.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                        {tags.slice(0, 2).map((t) => (
                                            <span
                                                key={t}
                                                className="text-[10px] px-2 py-0.5 rounded-full bg-surface-alt text-text-secondary border border-border"
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
                            className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hover:scale-110"
                            aria-label="Edytuj nawyk"
                        >
                            <Pencil size={16} />
                        </button>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                goToDetails(e);
                            }}
                            className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hover:scale-110"
                            aria-label="Szczegóły nawyku"
                        >
                            <ChevronRight size={16} />
                        </button>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                deleteHabit(e);
                            }}
                            className="p-2 text-text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hover:scale-110"
                            aria-label="Usuń nawyk"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>

                </div>
            </div>

            {isEditing && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text-primary/40 backdrop-blur-sm"
                    onClick={() => setIsEditing(false)}
                >
                    <div
                        className="bg-surface border border-border w-full max-w-sm rounded-2xl shadow-2xl p-6 relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setIsEditing(false)}
                            className="absolute top-4 right-4 text-text-secondary hover:text-text-primary transition-colors"
                            aria-label="Zamknij"
                        >
                            <X size={20} />
                        </button>

                        <h2 className="text-xl font-bold text-text-primary mb-1">Edytuj nawyk</h2>
                        <p className="text-text-secondary text-sm mb-6">Zmień nazwę nawyku.</p>

                        <form onSubmit={saveEdit} className="flex flex-col gap-4">
                            <input
                                autoFocus
                                type="text"
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary-green focus:ring-1 focus:ring-primary-green transition-all"
                                placeholder="Np. Czytanie 10 minut..."
                            />

                            <div className="flex gap-3 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(false)}
                                    className="flex-1 py-3 px-4 rounded-lg bg-surface-alt text-text-secondary font-medium hover:bg-border transition-colors"
                                >
                                    Anuluj
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving || !editedName.trim()}
                                    className="flex-1 py-3 px-4 rounded-lg bg-primary-green text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    {isSaving ? <Loader2 className="animate-spin" /> : "Zapisz"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </>
    );
}