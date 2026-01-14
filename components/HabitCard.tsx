"use client";

import { Check, Trash2, Flame, Pencil, ChevronRight, X, Loader2 } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti"; // Import konfetti

type HabitCardProps = {
    id: string;
    name: string;
    streak: number;
    completedDates: string[]; // Historia dat z bazy
    defaultCompleted?: boolean;
};

export default function HabitCard({ id, name, streak, completedDates, defaultCompleted = false }: HabitCardProps) {
    const router = useRouter();
    const supabase = createClient();
    const [isCompleted, setIsCompleted] = useState(defaultCompleted);
    const [isLoading, setIsLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(name);
    const [isSaving, setIsSaving] = useState(false);

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
                await supabase.from("habit_logs").insert({ habit_id: id, completed_date: today });
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
        if (!nextName) return;

        setIsSaving(true);
        const { error } = await supabase
            .from("habits")
            .update({ name: nextName })
            .eq("id", id);

        setIsSaving(false);

        if (error) {
            alert("Nie udało się zapisać zmian.");
            console.error(error);
            return;
        }

        setIsEditing(false);
        router.refresh();
    };

    // --- LOGIKA HEATMAPY (Ostatnie 7 dni) ---
    // Generujemy tablicę ostatnich 7 dni, żeby narysować krateczki
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i)); // Odwracamy kolejność: 6 dni temu -> dzisiaj
        return d.toISOString().split('T')[0];
    });

    // Dodajemy "dzisiaj" do listy wykonanych, jeśli właśnie kliknęliśmy (dla szybkiego UI)
    const allCompletedDates = isCompleted
        ? [...completedDates, new Date().toISOString().split('T')[0]]
        : completedDates.filter(d => d !== new Date().toISOString().split('T')[0]);

    return (
        <>
            <div
                onClick={toggleHabit}
                className={`
        group flex flex-col p-4 rounded-2xl border transition-all duration-200 cursor-pointer select-none relative overflow-hidden
        ${isCompleted
                    ? "bg-green-900/10 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.1)]"
                    : "bg-gray-900 border-gray-800 hover:border-gray-600 hover:bg-gray-800/80"
                }
      `}
            >
            {/* GÓRA KARTY: Checkbox i Nazwa */}
            <div className="flex items-center justify-between w-full z-10">
                <div className="flex items-center gap-4">
                    <div
                        className={`
              flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300
              ${isCompleted
                                ? "bg-green-500 border-green-500 scale-110"
                                : "border-gray-600 group-hover:border-gray-400"
                            }
            `}
                    >
                        {isCompleted && <Check size={18} className="text-black stroke-[3]" />}
                    </div>

                    <div className="flex flex-col">
                        <span className={`text-lg font-medium transition-colors ${isCompleted ? "text-green-100 line-through decoration-green-500/50" : "text-gray-200"}`}>
                            {name}
                        </span>
                    </div>
                </div>

                {/* IKONY PO PRAWEJ: Streak i Kosz */}
                <div className="flex items-center gap-3">
                    <div className={`text-xs font-mono flex items-center gap-1 ${streak > 0 ? "text-orange-400" : "text-gray-600"}`}>
                        <Flame size={14} className={streak > 0 ? "fill-orange-400" : ""} />
                        <span className="text-sm">{streak}</span>
                    </div>

                    <button
                        onClick={openEdit}
                        className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                        aria-label="Edytuj nawyk"
                    >
                        <Pencil size={18} />
                    </button>

                    <button
                        onClick={goToDetails}
                        className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                        aria-label="Szczegóły nawyku"
                    >
                        <ChevronRight size={18} />
                    </button>

                    <button
                        onClick={deleteHabit}
                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            {/* DÓŁ KARTY: Heatmapa (Krateczki) */}
            <div className="mt-4 flex gap-1.5 ml-12">
                {last7Days.map((date, index) => {
                    const isDone = allCompletedDates.includes(date);
                    const isToday = index === 6; // Ostatni element to dzisiaj

                    return (
                        <div
                            key={date}
                            className={`
                w-2.5 h-2.5 rounded-sm transition-all
                ${isDone
                                    ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                                    : "bg-gray-800"
                                }
                ${isToday ? "ring-1 ring-gray-500" : ""}
              `}
                            title={date} // Po najechaniu pokaże datę
                        />
                    );
                })}
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
        </>
    );
}