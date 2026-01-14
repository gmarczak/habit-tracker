"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";

type HabitHistoryGridProps = {
    habitId: string;
    initialLogs: Array<{ completed_date: string; status?: "done" | "skip" | null; note?: string | null }>;
    days?: number;
};

const toISODate = (d: Date) => d.toISOString().split("T")[0];

export default function HabitHistoryGrid({
    habitId,
    initialLogs,
    days = 30,
}: HabitHistoryGridProps) {
    const router = useRouter();
    const supabase = createClient();

    const [logs, setLogs] = useState(
        initialLogs ?? []
    );
    const [pendingDate, setPendingDate] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<"done" | "skip" | "none">("none");
    const [selectedNote, setSelectedNote] = useState<string>("");

    const dates = useMemo(() => {
        const result: string[] = [];
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            result.push(toISODate(d));
        }
        return result;
    }, [days]);

    const byDate = useMemo(() => {
        const map = new Map<string, { status: "done" | "skip"; note: string }>();
        for (const l of logs) {
            if (!l?.completed_date) continue;
            const status = (l.status ?? "done") as "done" | "skip";
            const note = l.note ?? "";
            const prev = map.get(l.completed_date);
            if (prev?.status === "done") continue;
            map.set(l.completed_date, { status, note });
        }
        return map;
    }, [logs]);

    const openDay = (date: string) => {
        const existing = byDate.get(date);
        setSelectedDate(date);
        setSelectedStatus(existing?.status ?? "none");
        setSelectedNote(existing?.note ?? "");
    };

    const closeModal = () => {
        setSelectedDate(null);
        setSelectedStatus("none");
        setSelectedNote("");
    };

    const saveSelected = async () => {
        if (!selectedDate) return;
        if (pendingDate) return;

        const date = selectedDate;
        setPendingDate(date);

        const prev = logs;

        // optimistic update
        const nextLogs = prev.filter((l) => l.completed_date !== date);
        if (selectedStatus !== "none") {
            nextLogs.push({
                completed_date: date,
                status: selectedStatus,
                note: selectedNote.trim() ? selectedNote.trim() : null,
            });
        }
        setLogs(nextLogs);

        try {
            // Keep it simple and robust even without unique constraints: delete then (optionally) insert.
            const { error: delError } = await supabase
                .from("habit_logs")
                .delete()
                .eq("habit_id", habitId)
                .eq("completed_date", date);
            if (delError) throw delError;

            if (selectedStatus !== "none") {
                const { error: insError } = await supabase
                    .from("habit_logs")
                    .insert({
                        habit_id: habitId,
                        completed_date: date,
                        status: selectedStatus,
                        note: selectedNote.trim() ? selectedNote.trim() : null,
                    });
                if (insError) throw insError;
            }

            router.refresh();
            closeModal();
        } catch (e) {
            setLogs(prev);
            console.error(e);
            alert("Nie udało się zapisać zmiany. Upewnij się, że masz kolumny 'status' i 'note' w tabeli habit_logs.");
        } finally {
            setPendingDate(null);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <h3 className="text-sm text-gray-400 uppercase tracking-wider font-semibold">
                    Historia ({days} dni)
                </h3>
                <div className="text-xs text-gray-500">Kliknij dzień, aby zmienić</div>
            </div>

            <div className="grid grid-cols-10 gap-2">
                {dates.map((date) => {
                    const entry = byDate.get(date);
                    const isDone = entry?.status === "done";
                    const isSkip = entry?.status === "skip";
                    const isPending = pendingDate === date;

                    return (
                        <button
                            key={date}
                            type="button"
                            onClick={() => openDay(date)}
                            disabled={!!pendingDate}
                            title={entry?.note ? `${date}\n${entry.note}` : date}
                            className={`
                h-7 w-full rounded-md border transition-all
                ${isDone ? "bg-green-500/90 border-green-400" : isSkip ? "bg-yellow-500/70 border-yellow-400" : "bg-gray-900 border-gray-800"}
                ${isPending ? "opacity-60" : "hover:scale-[1.03]"}
              `}
                        />
                    );
                })}
            </div>

            <div className="text-xs text-gray-500">
                Zielone = wykonane, żółte = pominięte, szare = brak
            </div>

            {selectedDate && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={closeModal}
                >
                    <div
                        className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={closeModal}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                            aria-label="Zamknij"
                        >
                            <X size={20} />
                        </button>

                        <h2 className="text-xl font-bold text-white mb-1">{selectedDate}</h2>
                        <p className="text-gray-400 text-sm mb-4">Ustaw status i (opcjonalnie) notatkę.</p>

                        <div className="flex gap-2 mb-4">
                            <button
                                type="button"
                                onClick={() => setSelectedStatus("done")}
                                className={`flex-1 py-2 px-3 rounded-lg border transition-colors ${selectedStatus === "done" ? "bg-green-600 border-green-500 text-white" : "bg-gray-950 border-gray-800 text-gray-300 hover:bg-gray-800"}`}
                            >
                                Wykonane
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedStatus("skip")}
                                className={`flex-1 py-2 px-3 rounded-lg border transition-colors ${selectedStatus === "skip" ? "bg-yellow-500/80 border-yellow-400 text-black" : "bg-gray-950 border-gray-800 text-gray-300 hover:bg-gray-800"}`}
                            >
                                Pomiń
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedStatus("none")}
                                className={`flex-1 py-2 px-3 rounded-lg border transition-colors ${selectedStatus === "none" ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-950 border-gray-800 text-gray-300 hover:bg-gray-800"}`}
                            >
                                Wyczyść
                            </button>
                        </div>

                        <textarea
                            value={selectedNote}
                            onChange={(e) => setSelectedNote(e.target.value)}
                            placeholder="Notatka (opcjonalnie)…"
                            rows={3}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />

                        <div className="flex gap-3 mt-4">
                            <button
                                type="button"
                                onClick={closeModal}
                                className="flex-1 py-3 px-4 rounded-lg bg-gray-800 text-gray-300 font-medium hover:bg-gray-700 transition-colors"
                            >
                                Anuluj
                            </button>
                            <button
                                type="button"
                                onClick={saveSelected}
                                disabled={!!pendingDate}
                                className="flex-1 py-3 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                                {pendingDate ? <Loader2 className="animate-spin" /> : "Zapisz"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
