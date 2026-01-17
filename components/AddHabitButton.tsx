"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Zap } from "lucide-react";

export default function AddHabitButton() {
    const supabase = createClient();
    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

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
                schedule_type: "daily",
            });

        setIsLoading(false);

        if (error) {
            alert("Wystąpił błąd podczas dodawania.");
            console.error(error);
        } else {
            setName("");
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
                className="bg-emerald-500 hover:bg-emerald-600 text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 z-40"
                title="Dodaj nawyk (Ctrl+N)"
            >
                <Plus size={20} />
            </button>


            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">

                    <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-200">


                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                            title="Zamknij (ESC)"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex items-center gap-2 mb-1">
                            <Zap size={20} className="text-blue-500" />
                            <h2 className="text-xl font-bold text-white">Szybkie dodawanie</h2>
                        </div>
                        <p className="text-gray-400 text-sm mb-6">Co chcesz robić codziennie?</p>

                        <form onSubmit={(e) => handleSubmit(e, false)} className="flex flex-col gap-4">
                            <div className="relative">
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Np. Czytanie 10 minut..."
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && e.shiftKey) {
                                            e.preventDefault();
                                            quickAdd();
                                        }
                                    }}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                />
                                <div className="text-xs text-gray-600 mt-1.5 flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-[10px]">Enter</kbd>
                                    <span>dodaj</span>
                                    <span className="mx-1">•</span>
                                    <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-[10px]">Shift+Enter</kbd>
                                    <span>dodaj kolejny</span>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-3 rounded-lg bg-gray-800 text-gray-300 font-medium hover:bg-gray-700 transition-colors"
                                >
                                    Anuluj
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSubmit(new Event('submit') as any, true)}
                                    disabled={isLoading || !name.trim()}
                                    className="flex-1 py-3 px-4 rounded-lg bg-gray-700 text-white font-medium hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    title="Shift+Enter"
                                >
                                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                    <span>Dodaj kolejny</span>
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading || !name.trim()}
                                    className="flex-1 py-3 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    {isLoading ? <Loader2 className="animate-spin" /> : "Dodaj"}
                                </button>
                            </div>
                        </form>

                    </div>
                </div>
            )}
        </>
    );
}