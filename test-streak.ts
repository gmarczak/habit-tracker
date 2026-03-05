import { startOfWeek, subWeeks, format, parseISO, isAfter, isBefore, endOfWeek } from 'date-fns';

export type HabitLogStatus = 'done' | 'skip';

export type HabitLogEntry = {
    completed_date: string;
    status?: HabitLogStatus | null;
    note?: string | null;
};

export type HabitFrequencyType = 'daily' | 'specific_days' | 'weekly_target';

const addDays = (isoDate: string, days: number) => {
    const d = new Date(isoDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
};

export function calculateStreakFromLogsV2(
    logs: HabitLogEntry[],
    frequency_type: HabitFrequencyType = 'daily',
    frequency_value: any = null
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

    const todayObj = new Date(); // Warning: Server timezone dependent, better to just use current date string
    // Let's assume today is the maximum date in the logs or actually today.
    // For testing, we mock today:
    const today = new Date().toISOString().split('T')[0];
    let streak = 0;

    if (frequency_type === 'daily') {
        let cursor = today;
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
    } else if (frequency_type === 'specific_days') {
        const requiredDays = Array.isArray(frequency_value) ? frequency_value : [];
        let cursor = today;
        for (let i = 0; i < 3660; i++) {
            const status = map.get(cursor);
            // JS getDay(): 0 = Sun, 1 = Mon ... 6 = Sat
            const dStr = cursor + 'T12:00:00Z'; // avoid timezone shift
            const d = new Date(dStr).getDay();
            const isRequired = requiredDays.includes(d);

            if (!status) {
                if (cursor === today) {
                    cursor = addDays(cursor, -1);
                    continue; // Today's missing doesn't break streak yet
                }
                if (isRequired) {
                    break; // Streak broken because a required day was missed
                }
            } else {
                if (status === 'done') streak++;
            }
            cursor = addDays(cursor, -1);
        }
    } else if (frequency_type === 'weekly_target') {
        const target = typeof frequency_value === 'number' ? frequency_value : parseInt(frequency_value?.target || frequency_value || '0', 10);
        if (!target || target <= 0) return 0;

        let currentWeekStart = startOfWeek(parseISO(today), { weekStartsOn: 1 }); // Monday

        let consecutiveWeeks = 0;
        let streakFromDone = 0;

        for (let weekOffset = 0; weekOffset < 520; weekOffset++) {
            const weekStart = subWeeks(currentWeekStart, weekOffset);
            const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

            // Count 'done' in this week
            let doneCountInWeek = 0;
            let cursor = format(weekEnd, 'yyyy-MM-dd');
            const endLimitStr = format(weekStart, 'yyyy-MM-dd');

            while (cursor >= endLimitStr) {
                if (map.get(cursor) === 'done') {
                    doneCountInWeek++;
                    streakFromDone++;
                }
                cursor = addDays(cursor, -1);
            }

            if (weekOffset === 0) {
                // Current week: doesn't break streak if target not met yet
                // But if we want streak to only count full successful weeks?
                // Usually we just count the total times done.
            } else {
                // Past week: must meet target
                if (doneCountInWeek < target) {
                    // Streak broken at this week
                    // So we only return streakFromDone collected up to the PREVIOUS week + this week's
                    // Wait, streakFromDone already included this week's done. But this week failed!
                    // So any done in this failed week shouldn't count? Or they do but they don't connect to older weeks.
                    // Actually, if a week fails, the streak is completely dead. We should just return the streak counted *before* checking this week.
                    streakFromDone -= doneCountInWeek; // Remove this failed week's items
                    break;
                }
            }
        }
        streak = streakFromDone;
    }

    return streak;
}

// ---------------- TESTING ----------------

const td = new Date().toISOString().split('T')[0];
const y1 = addDays(td, -1);
const y2 = addDays(td, -2);
const y3 = addDays(td, -3);
const y4 = addDays(td, -4);
const y5 = addDays(td, -5);

console.log("=== DAILY ===");
console.log(calculateStreakFromLogsV2([{ completed_date: y1, status: 'done' }], 'daily')); // 1
console.log(calculateStreakFromLogsV2([{ completed_date: y1, status: 'done' }, { completed_date: y2, status: 'done' }], 'daily')); // 2
console.log(calculateStreakFromLogsV2([{ completed_date: y1, status: 'done' }, { completed_date: y3, status: 'done' }], 'daily')); // 1 (y2 missed)

console.log("\n=== SPECIFIC DAYS (Let's say y1 is required, y2 is not, y3 is required) ===");
const dayY1 = new Date(y1 + 'T12:00:00Z').getDay();
const dayY2 = new Date(y2 + 'T12:00:00Z').getDay();
const dayY3 = new Date(y3 + 'T12:00:00Z').getDay();

console.log("Required:", [dayY1, dayY3]);
console.log(calculateStreakFromLogsV2([
    { completed_date: y1, status: 'done' },
    { completed_date: y3, status: 'done' }
], 'specific_days', [dayY1, dayY3])); // Should be 2 (missed y2 is fine)
console.log(calculateStreakFromLogsV2([
    { completed_date: y1, status: 'done' }
], 'specific_days', [dayY1, dayY3])); // Should be 1 (missed y3 breaks it before y3)

console.log("\n=== WEEKLY TARGET (Target 2) ===");
// Let's create specific dates
// Mon 2023-10-02 -> Sun 2023-10-08
// Mon 2023-10-09 -> Sun 2023-10-15 (Today: Wed 2023-10-11)
const mapDatesToStatus = (dates: string[]) => dates.map(d => ({ completed_date: d, status: 'done' as any }));
// Overriding 'today' inside function is hard in this test script without passing it. Let's pass today as an argument to our v2 function for testability!
