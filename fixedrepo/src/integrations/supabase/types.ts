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
      free_fp_rate_limits: {
        Row: {
          count: number
          created_at: string
          fp_hash: string
          id: string
          route: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          fp_hash: string
          id?: string
          route: string
          updated_at?: string
          window_start: string
        }
        Update: {
          count?: number
          created_at?: string
          fp_hash?: string
          id?: string
          route?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      free_ip_rate_limits: {
        Row: {
          count: number
          created_at: string
          id: string
          ip_hash: string
          route: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          ip_hash: string
          route: string
          updated_at?: string
          window_start: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          ip_hash?: string
          route?: string
          updated_at?: string
          window_start?: string
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
          public_reset_disabled: boolean
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
          public_reset_disabled?: boolean
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
          public_reset_disabled?: boolean
          max_devices?: number
          note?: string | null
          start_on_first_use?: boolean
          starts_on_first_use?: boolean
        }
        Relationships: []
      }
      licenses_free_fp_rate_limits: {
        Row: {
          count: number
          created_at: string
          fp_hash: string
          id: string
          route: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          fp_hash: string
          id?: string
          route: string
          updated_at?: string
          window_start: string
        }
        Update: {
          count?: number
          created_at?: string
          fp_hash?: string
          id?: string
          route?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      licenses_free_ip_rate_limits: {
        Row: {
          count: number
          created_at: string
          id: string
          ip_hash: string
          route: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          ip_hash: string
          route: string
          updated_at?: string
          window_start: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          ip_hash?: string
          route?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      licenses_free_gate_logs: {
        Row: {
          created_at: string
          detail: Json | null
          event_code: string
          fingerprint_hash: string | null
          id: number
          ip_hash: string | null
          key_type_code: string | null
          pass_no: number | null
          session_id: string | null
          ua_hash: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          event_code: string
          fingerprint_hash?: string | null
          id?: number
          ip_hash?: string | null
          key_type_code?: string | null
          pass_no?: number | null
          session_id?: string | null
          ua_hash?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json | null
          event_code?: string
          fingerprint_hash?: string | null
          id?: number
          ip_hash?: string | null
          key_type_code?: string | null
          pass_no?: number | null
          session_id?: string | null
          ua_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licenses_free_gate_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "licenses_free_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      licenses_free_issues: {
        Row: {
          created_at: string
          expires_at: string
          fingerprint_hash: string
          ip_hash: string
          issue_id: string
          key_mask: string
          license_id: string
          session_id: string
          ua_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          fingerprint_hash: string
          ip_hash: string
          issue_id?: string
          key_mask: string
          license_id: string
          session_id: string
          ua_hash?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          fingerprint_hash?: string
          ip_hash?: string
          issue_id?: string
          key_mask?: string
          license_id?: string
          session_id?: string
          ua_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "licenses_free_issues_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "licenses_free_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      licenses_free_key_types: {
        Row: {
          allow_reset: boolean
          app_code: string
          app_label: string | null
          code: string
          duration_seconds: number
          enabled: boolean
          key_signature: string | null
          kind: string
          label: string
          requires_double_gate: boolean | null
          sort_order: number
          updated_at: string
          updated_by: string | null
          value: number
        }
        Insert: {
          allow_reset?: boolean
          app_code?: string
          app_label?: string | null
          code: string
          duration_seconds: number
          enabled?: boolean
          key_signature?: string | null
          kind: string
          label: string
          requires_double_gate?: boolean | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          value: number
        }
        Update: {
          allow_reset?: boolean
          app_code?: string
          app_label?: string | null
          code?: string
          duration_seconds?: number
          enabled?: boolean
          key_signature?: string | null
          kind?: string
          label?: string
          requires_double_gate?: boolean | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          value?: number
        }
        Relationships: []
      }
      licenses_free_sessions: {
        Row: {
          claim_expires_at: string | null
          claim_token_hash: string | null
          closed_at: string | null
          created_at: string
          duration_seconds: number | null
          expires_at: string
          fingerprint_hash: string
          gate_ok_at: string | null
          ip_hash: string
          key_type_code: string | null
          last_error: string | null
          out_expires_at: string | null
          out_token_hash: string | null
          reveal_count: number
          revealed_at: string | null
          session_id: string
          started_at: string | null
          status: string
          ua_hash: string
        }
        Insert: {
          claim_expires_at?: string | null
          claim_token_hash?: string | null
          closed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          expires_at: string
          fingerprint_hash: string
          gate_ok_at?: string | null
          ip_hash: string
          key_type_code?: string | null
          last_error?: string | null
          out_expires_at?: string | null
          out_token_hash?: string | null
          reveal_count?: number
          revealed_at?: string | null
          session_id?: string
          started_at?: string | null
          status?: string
          ua_hash: string
        }
        Update: {
          claim_expires_at?: string | null
          claim_token_hash?: string | null
          closed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          expires_at?: string
          fingerprint_hash?: string
          gate_ok_at?: string | null
          ip_hash?: string
          key_type_code?: string | null
          last_error?: string | null
          out_expires_at?: string | null
          out_token_hash?: string | null
          reveal_count?: number
          revealed_at?: string | null
          session_id?: string
          started_at?: string | null
          status?: string
          ua_hash?: string
        }
        Relationships: []
      }
      licenses_free_settings: {
        Row: {
          free_daily_limit_per_fingerprint: number
          free_disabled_message: string
          free_enabled: boolean
          free_gate_antibypass_enabled: boolean
          free_gate_antibypass_seconds: number
          free_link4m_rotate_days: number
          free_link4m_rotate_nonce_pass1: number
          free_link4m_rotate_nonce_pass2: number
          free_min_delay_enabled: boolean
          free_min_delay_seconds: number
          free_min_delay_seconds_pass2: number
          free_outbound_url: string | null
          free_outbound_url_pass2: string | null
          free_public_links: Json
          free_public_note: string
          free_require_link4m_referrer: boolean
          free_return_seconds: number
          free_session_waiting_limit: number
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          free_daily_limit_per_fingerprint?: number
          free_disabled_message?: string
          free_enabled?: boolean
          free_gate_antibypass_enabled?: boolean
          free_gate_antibypass_seconds?: number
          free_link4m_rotate_days?: number
          free_link4m_rotate_nonce_pass1?: number
          free_link4m_rotate_nonce_pass2?: number
          free_min_delay_enabled?: boolean
          free_min_delay_seconds?: number
          free_min_delay_seconds_pass2?: number
          free_outbound_url?: string | null
          free_outbound_url_pass2?: string | null
          free_public_links?: Json
          free_public_note?: string
          free_require_link4m_referrer?: boolean
          free_return_seconds?: number
          free_session_waiting_limit?: number
          id: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          free_daily_limit_per_fingerprint?: number
          free_disabled_message?: string
          free_enabled?: boolean
          free_gate_antibypass_enabled?: boolean
          free_gate_antibypass_seconds?: number
          free_link4m_rotate_days?: number
          free_link4m_rotate_nonce_pass1?: number
          free_link4m_rotate_nonce_pass2?: number
          free_min_delay_enabled?: boolean
          free_min_delay_seconds?: number
          free_min_delay_seconds_pass2?: number
          free_outbound_url?: string | null
          free_outbound_url_pass2?: string | null
          free_public_links?: Json
          free_public_note?: string
          free_require_link4m_referrer?: boolean
          free_return_seconds?: number
          free_session_waiting_limit?: number
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
      check_free_fp_rate_limit: {
        Args: {
          p_fp_hash: string
          p_limit?: number
          p_route: string
          p_window_seconds?: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          window_start: string
        }[]
      }
      check_free_ip_rate_limit: {
        Args: {
          p_ip_hash: string
          p_limit?: number
          p_route: string
          p_window_seconds?: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          window_start: string
        }[]
      }
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
      cleanup_free_key_tables: {
        Args: {
          p_nonce_ttl_days?: number
          p_rate_limit_ttl_days?: number
          p_session_ttl_days?: number
        }
        Returns: undefined
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
