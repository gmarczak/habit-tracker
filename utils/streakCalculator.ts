export function calculateStreak(completedDates: string[]): number {
    if (!completedDates.length) return 0;


    const sortedDates = [...new Set(completedDates)].sort((a, b) =>
        new Date(b).getTime() - new Date(a).getTime()
    );

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];


    if (sortedDates[0] !== today && sortedDates[0] !== yesterday) {
        return 0;
    }

    let streak = 0;
    let currentDate = new Date(today);


    for (let i = 0; i < sortedDates.length; i++) {
        const logDate = sortedDates[i];


        const checkDateStr = currentDate.toISOString().split('T')[0];

        if (logDate === checkDateStr) {
            streak++;

            currentDate.setDate(currentDate.getDate() - 1);
        } else if (logDate === today && i === 0) {

            continue;
        } else {

            const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            if (checkDateStr === today && logDate === yesterdayStr) {
                streak++;
                currentDate.setDate(currentDate.getDate() - 2);
            } else {
                break;
            }
        }
    }

    return streak;
}

export function calculateBestStreak(completedDates: string[]): number {
    if (!completedDates.length) return 0;

    const uniqueSorted = [...new Set(completedDates)].sort((a, b) =>
        new Date(a).getTime() - new Date(b).getTime()
    );

    let best = 1;
    let current = 1;

    for (let i = 1; i < uniqueSorted.length; i++) {
        const prev = new Date(uniqueSorted[i - 1]);
        const cur = new Date(uniqueSorted[i]);
        const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);

        if (diffDays === 1) {
            current++;
            best = Math.max(best, current);
        } else {
            current = 1;
        }
    }

    return best;
}

export function calculateCompletionRate(completedDates: string[], days: number): number {
    if (days <= 0) return 0;

    const set = new Set(completedDates);
    const today = new Date();
    let done = 0;

    for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        if (set.has(iso)) done++;
    }

    return Math.round((done / days) * 100);
}

export type HabitLogStatus = 'done' | 'skip';

export type HabitLogEntry = {
    completed_date: string;
    status?: HabitLogStatus | null;
    note?: string | null;
};

const addDays = (isoDate: string, days: number) => {
    const d = new Date(isoDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
};

export function calculateStreakFromLogs(logs: HabitLogEntry[]): number {
    if (!logs.length) return 0;

    const map = new Map<string, HabitLogStatus>();
    for (const l of logs) {
        if (!l?.completed_date) continue;
        const status = (l.status ?? 'done') as HabitLogStatus;
        // If duplicates exist, prefer 'done' over 'skip'
        const prev = map.get(l.completed_date);
        if (prev === 'done') continue;
        map.set(l.completed_date, status);
    }

    const today = new Date().toISOString().split('T')[0];
    let cursor = today;
    let streak = 0;

    // Walk backwards day-by-day.
    // - done: increments streak
    // - skip: does not increment, but does not break streak
    // - missing: breaks
    // If today is missing, we still allow streak to start from yesterday if yesterday is done/skip.
    for (let i = 0; i < 3660; i++) {
        const status = map.get(cursor);
        if (!status) {
            if (cursor === today) {
                cursor = addDays(cursor, -1);
                continue;
            }
            break;
        }

        if (status === 'done') streak++;
        cursor = addDays(cursor, -1);
    }

    return streak;
}

export function calculateBestStreakFromLogs(logs: HabitLogEntry[]): number {
    if (!logs.length) return 0;

    const map = new Map<string, HabitLogStatus>();
    for (const l of logs) {
        if (!l?.completed_date) continue;
        const status = (l.status ?? 'done') as HabitLogStatus;
        const prev = map.get(l.completed_date);
        if (prev === 'done') continue;
        map.set(l.completed_date, status);
    }

    const dates = [...map.keys()].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    let best = 0;
    let segmentDone = 0;

    for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const status = map.get(date);

        if (i === 0) {
            segmentDone = status === 'done' ? 1 : 0;
            best = Math.max(best, segmentDone);
            continue;
        }

        const prevDate = dates[i - 1];
        const isConsecutive = addDays(prevDate, 1) === date;

        if (!isConsecutive) {
            segmentDone = status === 'done' ? 1 : 0;
            best = Math.max(best, segmentDone);
            continue;
        }

        if (status === 'done') segmentDone++;
        best = Math.max(best, segmentDone);
    }

    return best;
}

export function calculateCompletionRateFromLogs(logs: HabitLogEntry[], days: number): number {
    if (days <= 0) return 0;

    const map = new Map<string, HabitLogStatus>();
    for (const l of logs) {
        if (!l?.completed_date) continue;
        const status = (l.status ?? 'done') as HabitLogStatus;
        const prev = map.get(l.completed_date);
        if (prev === 'done') continue;
        map.set(l.completed_date, status);
    }

    const today = new Date().toISOString().split('T')[0];
    let done = 0;
    let skipped = 0;

    for (let i = 0; i < days; i++) {
        const date = addDays(today, -i);
        const status = map.get(date);
        if (status === 'done') done++;
        if (status === 'skip') skipped++;
    }

    const denom = days - skipped;
    if (denom <= 0) return 0;

    return Math.round((done / denom) * 100);
}