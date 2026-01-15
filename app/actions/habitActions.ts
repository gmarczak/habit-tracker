"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateHabitName(habitId: string, newName: string) {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Nie jesteś zalogowany" };
    }

    const { error } = await supabase
        .from("habits")
        .update({ name: newName })
        .eq("id", habitId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Update error:", error);
        return { error: error.message };
    }

    revalidatePath("/");
    return { success: true };
}
