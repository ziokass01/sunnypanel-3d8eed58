export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          detail: Json
          id: string
          license_key: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json
          id?: string
          license_key: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json
          id?: string
          license_key?: string
        }
        Relationships: []
      }
      blocked_ips: {
        Row: {
          blocked_until: string
          created_at: string
          ip: string
          meta: Json
          reason: string
          updated_at: string
        }
        Insert: {
          blocked_until: string
          created_at?: string
          ip: string
          meta?: Json
          reason?: string
          updated_at?: string
        }
        Update: {
          blocked_until?: string
          created_at?: string
          ip?: string
          meta?: Json
          reason?: string
          updated_at?: string
        }
        Relationships: []
      }
      license_devices: {
        Row: {
          device_id: string
          device_name: string | null
          first_seen: string
          id: string
          last_seen: string
          license_id: string
        }
        Insert: {
          device_id: string
          device_name?: string | null
          first_seen?: string
          id?: string
          last_seen?: string
          license_id: string
        }
        Update: {
          device_id?: string
          device_name?: string | null
          first_seen?: string
          id?: string
          last_seen?: string
          license_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_devices_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          activated_at: string | null
          created_at: string
          deleted_at: string | null
          duration_days: number | null
          duration_seconds: number | null
          expires_at: string | null
          first_used_at: string | null
          id: string
          is_active: boolean
          key: string
          max_devices: number
          note: string | null
          start_on_first_use: boolean
          starts_on_first_use: boolean
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_days?: number | null
          duration_seconds?: number | null
          expires_at?: string | null
          first_used_at?: string | null
          id?: string
          is_active?: boolean
          key: string
          max_devices?: number
          note?: string | null
          start_on_first_use?: boolean
          starts_on_first_use?: boolean
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_days?: number | null
          duration_seconds?: number | null
          expires_at?: string | null
          first_used_at?: string | null
          id?: string
          is_active?: boolean
          key?: string
          max_devices?: number
          note?: string | null
          start_on_first_use?: boolean
          starts_on_first_use?: boolean
        }
        Relationships: []
      }
      request_nonces: {
        Row: {
          created_at: string
          expires_at: string
          nonce: string
          ts: number
        }
        Insert: {
          created_at?: string
          expires_at: string
          nonce: string
          ts: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          nonce?: string
          ts?: number
        }
        Relationships: []
      }
      security_alerts: {
        Row: {
          created_at: string
          id: string
          ip: string
          key_prefix: string | null
          kind: string
          meta: Json
        }
        Insert: {
          created_at?: string
          id?: string
          ip: string
          key_prefix?: string | null
          kind: string
          meta?: Json
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string
          key_prefix?: string | null
          kind?: string
          meta?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verify_ip_rate_limits: {
        Row: {
          count: number
          created_at: string
          id: string
          ip: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          ip: string
          updated_at?: string
          window_start: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          ip?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      verify_new_device_rate_limits: {
        Row: {
          count: number
          created_at: string
          id: string
          license_key: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          license_key: string
          updated_at?: string
          window_start: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          license_key?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      verify_rate_limits: {
        Row: {
          count: number
          created_at: string
          id: string
          ip: string
          license_key: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          ip: string
          license_key: string
          updated_at?: string
          window_start: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          ip?: string
          license_key?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_ip_rate_limit: {
        Args: { p_ip: string; p_limit?: number; p_window_seconds?: number }
        Returns: {
          allowed: boolean
          current_count: number
          window_start: string
        }[]
      }
      check_new_device_rate_limit: {
        Args: { p_key: string; p_limit?: number; p_window_seconds?: number }
        Returns: {
          allowed: boolean
          current_count: number
          window_start: string
        }[]
      }
      check_rate_limit: {
        Args: {
          p_ip: string
          p_key: string
          p_limit?: number
          p_window_seconds?: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          window_start: string
        }[]
      }
      cleanup_verify_tables: {
        Args: { p_rate_limit_ttl_days?: number }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit: {
        Args: { p_action: string; p_detail?: Json; p_license_key: string }
        Returns: undefined
      }
      no_admin_exists: { Args: never; Returns: boolean }
      security_metrics_for_ip: {
        Args: { p_ip: string }
        Returns: {
          distinct_keys_10m: number
          failure_5m: number
        }[]
      }
      verify_counts_per_day: {
        Args: { p_days?: number }
        Returns: {
          count: number
          day: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
