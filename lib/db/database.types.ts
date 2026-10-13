// Wygenerowane z bazy Supabase (projekt habit-tracker). Nie edytuj ręcznie: `npm run db:types`.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          user_id?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      habit_entries: {
        Row: {
          created_at: string
          entry_date: string
          habit_id: string
          id: string
          note: string | null
          skipped: boolean
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          created_at?: string
          entry_date: string
          habit_id: string
          id?: string
          note?: string | null
          skipped?: boolean
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Update: {
          created_at?: string
          entry_date?: string
          habit_id?: string
          id?: string
          note?: string | null
          skipped?: boolean
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "habit_entries_habit_id_user_id_fkey"
            columns: ["habit_id", "user_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      habit_pauses: {
        Row: {
          created_at: string
          end_date: string
          habit_id: string | null
          id: string
          reason: string | null
          start_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          habit_id?: string | null
          id?: string
          reason?: string | null
          start_date: string
          user_id?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          habit_id?: string | null
          id?: string
          reason?: string | null
          start_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_pauses_habit_id_user_id_fkey"
            columns: ["habit_id", "user_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      habit_plans: {
        Row: {
          created_at: string
          frequency: Database["public"]["Enums"]["plan_frequency"]
          habit_id: string
          id: string
          interval_days: number | null
          target_value: number
          times_per_week: number | null
          user_id: string
          valid_from: string
          weekdays: number[] | null
        }
        Insert: {
          created_at?: string
          frequency: Database["public"]["Enums"]["plan_frequency"]
          habit_id: string
          id?: string
          interval_days?: number | null
          target_value?: number
          times_per_week?: number | null
          user_id?: string
          valid_from: string
          weekdays?: number[] | null
        }
        Update: {
          created_at?: string
          frequency?: Database["public"]["Enums"]["plan_frequency"]
          habit_id?: string
          id?: string
          interval_days?: number | null
          target_value?: number
          times_per_week?: number | null
          user_id?: string
          valid_from?: string
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "habit_plans_habit_id_user_id_fkey"
            columns: ["habit_id", "user_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      habits: {
        Row: {
          archived_at: string | null
          category_id: string | null
          color: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          kind: Database["public"]["Enums"]["habit_kind"]
          name: string
          sort_order: number
          start_date: string
          time_of_day: string | null
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          category_id?: string | null
          color?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["habit_kind"]
          name: string
          sort_order?: number
          start_date: string
          time_of_day?: string | null
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived_at?: string | null
          category_id?: string | null
          color?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["habit_kind"]
          name?: string
          sort_order?: number
          start_date?: string
          time_of_day?: string | null
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habits_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      notification_log: {
        Row: {
          local_date: string
          reminder_id: string
          sent_at: string
        }
        Insert: {
          local_date: string
          reminder_id: string
          sent_at?: string
        }
        Update: {
          local_date?: string
          reminder_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          day_start_hour: number
          display_name: string | null
          id: string
          theme: string
          timezone: string
          updated_at: string
          week_start: number
        }
        Insert: {
          created_at?: string
          day_start_hour?: number
          display_name?: string | null
          id: string
          theme?: string
          timezone?: string
          updated_at?: string
          week_start?: number
        }
        Update: {
          created_at?: string
          day_start_hour?: number
          display_name?: string | null
          id?: string
          theme?: string
          timezone?: string
          updated_at?: string
          week_start?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id?: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          enabled: boolean
          habit_id: string | null
          id: string
          kind: string
          local_time: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          habit_id?: string | null
          id?: string
          kind?: string
          local_time: string
          user_id?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          habit_id?: string | null
          id?: string
          kind?: string
          local_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_habit_id_user_id_fkey"
            columns: ["habit_id", "user_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_habit: {
        Args: {
          p_category_id: string | null
          p_color: string | null
          p_icon: string | null
          p_frequency: Database["public"]["Enums"]["plan_frequency"]
          p_interval_days: number | null
          p_kind: Database["public"]["Enums"]["habit_kind"]
          p_name: string
          p_start_date?: string
          p_target_value: number
          p_times_per_week: number | null
          p_unit: string | null
          p_weekdays: number[] | null
        }
        Returns: string
      }
      delete_my_account: { Args: never; Returns: undefined }
      push_config: {
        Args: { p_secret: string }
        Returns: {
          vapid_private: string
          vapid_public: string
          vapid_subject: string
        }[]
      }
      reorder_habits: { Args: { p_ids: string[] }; Returns: undefined }
      change_plan: {
        Args: {
          p_frequency: Database["public"]["Enums"]["plan_frequency"]
          p_habit_id: string
          p_interval_days: number
          p_target_value: number
          p_times_per_week: number
          p_weekdays: number[]
        }
        Returns: undefined
      }
      clear_entry: {
        Args: { p_date: string; p_habit_id: string }
        Returns: undefined
      }
      set_entry: {
        Args: {
          p_date: string
          p_habit_id: string
          p_note?: string
          p_skipped?: boolean
          p_value: number
        }
        Returns: {
          created_at: string
          entry_date: string
          habit_id: string
          id: string
          note: string | null
          skipped: boolean
          updated_at: string
          user_id: string
          value: number | null
        }
        SetofOptions: {
          from: "*"
          to: "habit_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_today: { Args: never; Returns: string }
    }
    Enums: {
      habit_kind: "check" | "count" | "duration"
      plan_frequency: "daily" | "weekdays" | "weekly_count" | "every_n_days"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
