"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Zap } from "lucide-react";

export default function AddHabitButton({ isBottomNav }: { isBottomNav?: boolean }) {
    const supabase = createClient();
    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState("");
    const [frequencyType, setFrequencyType] = useState<"daily" | "weekly_target" | "specific_days">("daily");
    const [frequencyValue, setFrequencyValue] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
    }, []);

    // Skrót klawiszowy Ctrl/Cmd + N
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                setIsOpen(true);
            }
            // ESC zamyka modal
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent, keepOpen = false) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsLoading(true);

        const { error } = await supabase
            .from("habits")
            .insert({
                name: name.trim(),
                archived: false,
                tags: [],
                schedule_type: "daily", // legacy field
                frequency_type: frequencyType,
                frequency_value: frequencyValue,
            });

        setIsLoading(false);

        if (error) {
            alert("Wystąpił błąd podczas dodawania.");
            console.error(error);
        } else {
            setName("");
            setFrequencyType("daily");
            setFrequencyValue(null);
            if (!keepOpen) {
                setIsOpen(false);
            }
            router.refresh();
        }
    };

    const quickAdd = async () => {
        if (!name.trim()) return;
        await handleSubmit(new Event('submit') as any, true);
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="bg-primary-green hover:opacity-90 text-white lg:w-12 lg:h-12 w-14 h-14 rounded-full shadow-lg lg:shadow-lg shadow-2xl flex items-center justify-center transition-all hover:scale-105 lg:hover:scale-110 active:scale-95 z-40 border-2 lg:border-0 border-primary-green/50"
                title="Dodaj nawyk (Ctrl+N)"
            >
                <Plus size={20} className="hidden lg:block" />
                <Plus size={24} strokeWidth={2.5} className="lg:hidden" />
            </button>


            {mounted && isOpen && createPortal(
                <>
                    {/* Overlay */}
                    <div
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Modal Container */}
                    <div className="fixed top-[15dvh] left-1/2 -translate-x-1/2 w-[92%] max-w-lg bg-zinc-900 z-[101] rounded-2xl p-6 border border-zinc-800 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-2">
                                <Zap size={24} className="text-primary-green shrink-0" />
                                <h2 className="text-xl font-bold text-white text-left">Szybkie dodawanie</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="p-2 text-zinc-400 hover:text-white transition-colors"
                                title="Zamknij (ESC)"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={(e) => handleSubmit(e, false)} className="flex flex-col gap-6">
                            <div>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="np. Bieganie"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && e.shiftKey) {
                                            e.preventDefault();
                                            quickAdd();
                                        }
                                    }}
                                    className="w-full block bg-zinc-800 border border-zinc-700 rounded-xl px-5 py-4 text-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-primary-green focus:ring-1 focus:ring-primary-green transition-all"
                                />
                                <div className="text-xs text-zinc-500 mt-2 flex justify-between">
                                    <div className="hidden sm:flex items-center gap-1">
                                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700">Enter</kbd>
                                        <span>aby dodać</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700">Shift+Enter</kbd>
                                        <span>dodaj kolejny</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <label className="text-sm font-medium text-white text-left">Częstotliwość</label>
                                <select
                                    value={frequencyType}
                                    onChange={(e) => {
                                        setFrequencyType(e.target.value as any);
                                        if (e.target.value === "specific_days") setFrequencyValue([1, 2, 3, 4, 5]);
                                        else if (e.target.value === "weekly_target") setFrequencyValue(3);
                                        else setFrequencyValue(null);
                                    }}
                                    className="w-full block bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-base text-white focus:outline-none focus:border-primary-green focus:ring-1 focus:ring-primary-green outline-none"
                                >
                                    <option value="daily">Codziennie</option>
                                    <option value="specific_days">Wybrane dni tygodnia</option>
                                    <option value="weekly_target">Cel tygodniowy</option>
                                </select>

                                {frequencyType === "specific_days" && (
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                                            const days = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];
                                            const isSelected = (frequencyValue || []).includes(day);
                                            return (
                                                <button
                                                    key={day}
                                                    type="button"
                                                    onClick={() => {
                                                        const current = frequencyValue || [];
                                                        if (isSelected) {
                                                            setFrequencyValue(current.filter((d: number) => d !== day));
                                                        } else {
                                                            setFrequencyValue([...current, day]);
                                                        }
                                                    }}
                                                    className={`w-10 h-10 flex items-center justify-center text-sm font-medium rounded-full border transition-colors ${isSelected ? 'bg-primary-green text-white border-primary-green' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'}`}
                                                >
                                                    {days[day]}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}

                                {frequencyType === "weekly_target" && (
                                    <div className="flex items-center gap-3 mt-1 bg-zinc-800 p-3 rounded-xl border border-zinc-700">
                                        <input
                                            type="number"
                                            min="1"
                                            max="7"
                                            value={frequencyValue || 3}
                                            onChange={(e) => setFrequencyValue(parseInt(e.target.value))}
                                            className="w-16 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-white text-center font-bold focus:outline-none focus:border-primary-green focus:ring-1 focus:ring-primary-green"
                                        />
                                        <span className="text-base font-medium text-white">razy w tygodniu</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-row gap-3 mt-2 w-full">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="flex-1 px-5 py-4 rounded-xl bg-zinc-800 text-zinc-300 font-medium hover:bg-zinc-700 transition-colors border border-zinc-700"
                                >
                                    Anuluj
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading || !name.trim()}
                                    className="flex-1 py-4 px-6 rounded-xl bg-primary-green text-white font-bold text-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isLoading ? <Loader2 className="animate-spin" /> : (
                                        <>
                                            <Plus strokeWidth={3} size={20} />
                                            <span>Dodaj</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </>,
                document.body
            )}
        </>
    );
}