// Follow this setup guide to integrate the Deno language server with your editor:
// https://supabase.com/docs/guides/functions/local-development
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { formatInTimeZone, toZonedTime } from 'https://esm.sh/date-fns-tz@2'

console.log("Remind Habits Function initialized!");

serve(async (req) => {
    try {
        // We only want to run this on a scheduled basis or manually
        // Initialize Supabase Admin Client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log("Starting habit reminder check...");

        // 1. Fetch users and their timezones
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, timezone');

        if (profileError) throw profileError;

        const now = new Date();
        const notificationsToSend = [];

        for (const profile of profiles || []) {
            const timezone = profile.timezone || 'UTC';
            // Get the current hour in this user's timezone
            const userTime = toZonedTime(now, timezone);
            const userHour = userTime.getHours();

            // e.g., send reminders only between 20:00 and 20:59 local time
            if (userHour !== 20) {
                continue;
            }

            // 2. Fetch active habits for this user
            const { data: habits, error: habitsError } = await supabase
                .from('habits')
                .select('*')
                .eq('user_id', profile.id)
                .eq('archived', false)
                .eq('frequency_type', 'daily');

            if (habitsError || !habits || habits.length === 0) continue;

            const todayISO = formatInTimeZone(now, timezone, 'yyyy-MM-dd');

            // 3. Fetch logs for today
            const { data: logs } = await supabase
                .from('habit_logs')
                .select('habit_id')
                .in('habit_id', habits.map(h => h.id))
                .eq('completed_date', todayISO);

            const completedHabitIds = new Set(logs?.map(l => l.habit_id) || []);

            // 4. Find pending habits
            const pendingHabits = habits.filter(h => !completedHabitIds.has(h.id));

            if (pendingHabits.length > 0) {
                notificationsToSend.push({
                    userId: profile.id,
                    pendingCount: pendingHabits.length,
                    habitNames: pendingHabits.map(h => h.name)
                });
            }
        }

        // 5. Send notifications
        for (const notification of notificationsToSend) {
            console.log(`[Notification] Would send to ${notification.userId}: You have ${notification.pendingCount} habits left: ${notification.habitNames.join(', ')}`);
            // Here you would integrate with Resend (Email) or Web-Push
            /*
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'Habit Tracker <noreply@yourdomain.com>',
                to: 'user-email@example.com', // Need to fetch email from auth.users
                subject: "Nie zapomnij o dzisiejszych nawykach!",
                html: `<p>Masz jeszcze ${notification.pendingCount} nawyków do odhaczenia dzisiaj!</p>`
              })
            });
            */
        }

        return new Response(
            JSON.stringify({ success: true, processed_users: notificationsToSend.length }),
            { headers: { "Content-Type": "application/json" } },
        )
    } catch (error) {
        console.error(error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { "Content-Type": "application/json" }, status: 500 },
        )
    }
})
