export function calculateYearlyStats(
    allLogs: Array<{
        completed_date: string;
        status?: "done" | "skip" | null;
    }>,
    year: number
) {
    const yearLogs = allLogs.filter(log => {
        const logYear = new Date(log.completed_date).getFullYear();
        return logYear === year && log.status !== "skip";
    });

    // Total days with at least one habit completed
    const uniqueDates = new Set(yearLogs.map(log => log.completed_date));
    const totalActiveDays = uniqueDates.size;

    // Total completions
    const totalCompletions = yearLogs.length;

    // Calculate by month
    const monthlyStats = Array.from({ length: 12 }, (_, i) => {
        const monthLogs = yearLogs.filter(log => {
            const logDate = new Date(log.completed_date);
            return logDate.getMonth() === i;
        });
        const uniqueMonthDates = new Set(monthLogs.map(log => log.completed_date));
        return {
            month: i,
            activeDays: uniqueMonthDates.size,
            completions: monthLogs.length
        };
    });

    // Find best month
    const bestMonth = monthlyStats.reduce((best, current) =>
        current.completions > best.completions ? current : best
        , monthlyStats[0]);

    // Calculate longest streak in the year
    const sortedDates = Array.from(uniqueDates).sort();
    let longestStreak = 0;
    let currentStreak = 0;
    let prevDate: Date | null = null;

    sortedDates.forEach(dateStr => {
        const currentDate = new Date(dateStr);
        if (prevDate) {
            const diffDays = Math.floor((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
                currentStreak++;
            } else {
                longestStreak = Math.max(longestStreak, currentStreak);
                currentStreak = 1;
            }
        } else {
            currentStreak = 1;
        }
        prevDate = currentDate;
    });
    longestStreak = Math.max(longestStreak, currentStreak);

    // Days in year
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInYear = isLeapYear ? 366 : 365;

    // Completion rate
    const completionRate = totalActiveDays > 0
        ? Math.round((totalActiveDays / daysInYear) * 100)
        : 0;

    return {
        totalActiveDays,
        totalCompletions,
        bestMonth,
        longestStreak,
        completionRate,
        daysInYear,
        monthlyStats
    };
}

export function getMonthNamePL(monthIndex: number): string {
    const months = [
        "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
        "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
    ];
    return months[monthIndex] || "";
}

export function calculateHabitYearlyStats(
    logs: Array<{
        completed_date: string;
        status?: "done" | "skip" | null;
    }>,
    year: number
) {
    const yearLogs = logs.filter(log => {
        const logYear = new Date(log.completed_date).getFullYear();
        return logYear === year && log.status !== "skip";
    });

    const totalDays = yearLogs.length;
    const uniqueDates = new Set(yearLogs.map(log => log.completed_date));

    // Calculate streak for this habit
    const sortedDates = Array.from(uniqueDates).sort();
    let longestStreak = 0;
    let currentStreak = 0;
    let prevDate: Date | null = null;

    sortedDates.forEach(dateStr => {
        const currentDate = new Date(dateStr);
        if (prevDate) {
            const diffDays = Math.floor((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
                currentStreak++;
            } else {
                longestStreak = Math.max(longestStreak, currentStreak);
                currentStreak = 1;
            }
        } else {
            currentStreak = 1;
        }
        prevDate = currentDate;
    });
    longestStreak = Math.max(longestStreak, currentStreak);

    return {
        totalDays,
        longestStreak
    };
}
