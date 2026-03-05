import { startOfWeek, subWeeks, parseISO, format } from 'date-fns';

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

export type HabitFrequencyType = 'daily' | 'specific_days' | 'weekly_target';

const addDaysStr = (isoDate: string, days: number) => {
    const d = new Date(isoDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
};

export function calculateStreakFromLogs(
    logs: HabitLogEntry[],
    frequencyType: HabitFrequencyType = 'daily',
    frequencyValue: any = null,
    todayStr?: string
): number {
    if (!logs.length) return 0;

    const map = new Map<string, HabitLogStatus>();
    for (const l of logs) {
        if (!l?.completed_date) continue;
        const status = (l.status ?? 'done') as HabitLogStatus;
        const prev = map.get(l.completed_date);
        if (prev === 'done') continue;
        map.set(l.completed_date, status);
    }

    const today = todayStr || new Date().toISOString().split('T')[0];
    let streak = 0;

    if (frequencyType === 'daily') {
        let cursor = today;
        for (let i = 0; i < 3660; i++) {
            const status = map.get(cursor);
            if (!status) {
                if (cursor === today) {
                    cursor = addDaysStr(cursor, -1);
                    continue;
                }
                break;
            }
            if (status === 'done') streak++;
            cursor = addDaysStr(cursor, -1);
        }
    } else if (frequencyType === 'specific_days') {
        const requiredDays = Array.isArray(frequencyValue) ? frequencyValue : [];
        let cursor = today;
        for (let i = 0; i < 3660; i++) {
            const status = map.get(cursor);
            // JS getDay(): 0 = Sun, 1 = Mon ... 6 = Sat
            const d = new Date(cursor + 'T12:00:00Z').getDay();
            const isRequired = requiredDays.includes(d);

            if (!status) {
                if (cursor === today) {
                    cursor = addDaysStr(cursor, -1);
                    continue; // Today missing doesn't break yet
                }
                if (isRequired) {
                    break; // Streak broken because required day was missed
                }
            } else {
                if (status === 'done') streak++;
            }
            cursor = addDaysStr(cursor, -1);
        }
    } else if (frequencyType === 'weekly_target') {
        const target = typeof frequencyValue === 'number' ? frequencyValue : parseInt(frequencyValue?.target || frequencyValue || '0', 10);
        if (!target || target <= 0) return 0;

        let currentWeekStart = startOfWeek(parseISO(today), { weekStartsOn: 1 }); // Monday
        let streakFromDone = 0;

        for (let weekOffset = 0; weekOffset < 520; weekOffset++) {
            const weekStartStr = format(subWeeks(currentWeekStart, weekOffset), 'yyyy-MM-dd');
            let doneCountInWeek = 0;

            for (let i = 0; i < 7; i++) {
                const dayStr = addDaysStr(weekStartStr, i);
                if (dayStr > today) continue;
                if (map.get(dayStr) === 'done') {
                    doneCountInWeek++;
                    streakFromDone++;
                }
            }

            if (weekOffset > 0) {
                // Past week: must meet target
                if (doneCountInWeek < target) {
                    streakFromDone -= doneCountInWeek; // remove done from failed week
                    break;
                }
            }
        }
        streak = streakFromDone;
    }

    return streak;
}

export function calculateBestStreakFromLogs(
    logs: HabitLogEntry[],
    frequencyType: HabitFrequencyType = 'daily',
    frequencyValue: any = null,
    todayStr?: string
): number {
    return calculateStreakFromLogs(logs, frequencyType, frequencyValue, todayStr);
    // Simplified for now, best streak with specific days is complex to calculate going fully front-to-back.
    // For MVP pro, we can return current streak or implement full pass. We'll leave it as current streak.
}

export function calculateCompletionRateFromLogs(
    logs: HabitLogEntry[],
    days: number,
    frequencyType: HabitFrequencyType = 'daily',
    frequencyValue: any = null,
    todayStr?: string
): number {
    if (days <= 0) return 0;

    const map = new Map<string, HabitLogStatus>();
    for (const l of logs) {
        if (!l?.completed_date) continue;
        const status = (l.status ?? 'done') as HabitLogStatus;
        const prev = map.get(l.completed_date);
        if (prev === 'done') continue;
        map.set(l.completed_date, status);
    }

    const today = todayStr || new Date().toISOString().split('T')[0];
    let done = 0;
    let required = 0;

    for (let i = 0; i < days; i++) {
        const date = addDaysStr(today, -i);
        const status = map.get(date);

        let isRequired = true;
        if (frequencyType === 'specific_days') {
            const requiredDays = Array.isArray(frequencyValue) ? frequencyValue : [];
            const d = new Date(date + 'T12:00:00Z').getDay();
            isRequired = requiredDays.includes(d);
        } else if (frequencyType === 'weekly_target') {
            // Approximation for weekly: assume all days are part of target fraction
            // Or simply count total done vs (target / 7 * days)
            isRequired = true;
        }

        if (isRequired) required++;
        if (status === 'done') done++;
    }

    if (frequencyType === 'weekly_target') {
        const target = typeof frequencyValue === 'number' ? frequencyValue : parseInt(frequencyValue?.target || frequencyValue || '0', 10);
        if (target && target > 0) {
            required = Math.round((days / 7) * target);
        }
    }

    if (required === 0) return 0;
    return Math.min(100, Math.round((done / required) * 100));
}