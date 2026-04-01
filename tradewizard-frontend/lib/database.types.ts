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
      agent_signals: {
        Row: {
          agent_name: string
          agent_type: string
          confidence: number | null
          created_at: string | null
          direction: string
          fair_probability: number | null
          id: string
          key_drivers: Json | null
          market_id: string | null
          metadata: Json | null
          recommendation_id: string | null
        }
        Insert: {
          agent_name: string
          agent_type: string
          confidence?: number | null
          created_at?: string | null
          direction: string
          fair_probability?: number | null
          id?: string
          key_drivers?: Json | null
          market_id?: string | null
          metadata?: Json | null
          recommendation_id?: string | null
        }
        Update: {
          agent_name?: string
          agent_type?: string
          confidence?: number | null
          created_at?: string | null
          direction?: string
          fair_probability?: number | null
          id?: string
          key_drivers?: Json | null
          market_id?: string | null
          metadata?: Json | null
          recommendation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_signals_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_signals_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "v_closed_markets_performance"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "agent_signals_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_signals_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "v_closed_markets_performance"
            referencedColumns: ["recommendation_id"]
          },
        ]
      }
      analysis_history: {
        Row: {
          agents_used: Json | null
          analysis_type: string
          cost_usd: number | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          market_id: string | null
          status: string
        }
        Insert: {
          agents_used?: Json | null
          analysis_type: string
          cost_usd?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          market_id?: string | null
          status: string
        }
        Update: {
          agents_used?: Json | null
          analysis_type?: string
          cost_usd?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          market_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_history_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_history_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "v_closed_markets_performance"
            referencedColumns: ["market_id"]
          },
        ]
      }
      langgraph_checkpoints: {
        Row: {
          checkpoint: Json
          checkpoint_id: string
          created_at: string | null
          metadata: Json | null
          parent_checkpoint_id: string | null
          thread_id: string
        }
        Insert: {
          checkpoint: Json
          checkpoint_id: string
          created_at?: string | null
          metadata?: Json | null
          parent_checkpoint_id?: string | null
          thread_id: string
        }
        Update: {
          checkpoint?: Json
          checkpoint_id?: string
          created_at?: string | null
          metadata?: Json | null
          parent_checkpoint_id?: string | null
          thread_id?: string
        }
        Relationships: []
      }
      markets: {
        Row: {
          condition_id: string
          created_at: string | null
          description: string | null
          event_type: string
          id: string
          last_analyzed_at: string | null
          liquidity: number | null
          market_probability: number | null
          question: string
          resolved_outcome: string | null
          status: string
          trending_score: number | null
          updated_at: string | null
          volume_24h: number | null
        }
        Insert: {
          condition_id: string
          created_at?: string | null
          description?: string | null
          event_type: string
          id: string
          last_analyzed_at?: string | null
          liquidity?: number | null
          market_probability?: number | null
          question: string
          resolved_outcome?: string | null
          status?: string
          trending_score?: number | null
          updated_at?: string | null
          volume_24h?: number | null
        }
        Update: {
          condition_id?: string
          created_at?: string | null
          description?: string | null
          event_type?: string
          id?: string
          last_analyzed_at?: string | null
          liquidity?: number | null
          market_probability?: number | null
          question?: string
          resolved_outcome?: string | null
          status?: string
          trending_score?: number | null
          updated_at?: string | null
          volume_24h?: number | null
        }
        Relationships: []
      }
      migration_lock: {
        Row: {
          id: number
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
        }
        Insert: {
          id?: number
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
        }
        Update: {
          id?: number
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
        }
        Relationships: []
      }
      recommendation_outcomes: {
        Row: {
          actual_outcome: string
          created_at: string | null
          edge_captured: number | null
          id: string
          market_id: string | null
          market_probability_at_recommendation: number | null
          recommendation_id: string | null
          recommendation_was_correct: boolean
          resolution_date: string | null
          roi_realized: number | null
          updated_at: string | null
        }
        Insert: {
          actual_outcome: string
          created_at?: string | null
          edge_captured?: number | null
          id?: string
          market_id?: string | null
          market_probability_at_recommendation?: number | null
          recommendation_id?: string | null
          recommendation_was_correct: boolean
          resolution_date?: string | null
          roi_realized?: number | null
          updated_at?: string | null
        }
        Update: {
          actual_outcome?: string
          created_at?: string | null
          edge_captured?: number | null
          id?: string
          market_id?: string | null
          market_probability_at_recommendation?: number | null
          recommendation_id?: string | null
          recommendation_was_correct?: boolean
          resolution_date?: string | null
          roi_realized?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_outcomes_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_outcomes_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "v_closed_markets_performance"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "recommendation_outcomes_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_outcomes_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "v_closed_markets_performance"
            referencedColumns: ["recommendation_id"]
          },
        ]
      }
      recommendations: {
        Row: {
          catalysts: Json | null
          confidence: string
          core_thesis: string | null
          created_at: string | null
          direction: string
          entry_zone_max: number | null
          entry_zone_min: number | null
          expected_value: number | null
          explanation: string | null
          fair_probability: number | null
          id: string
          market_edge: number | null
          market_id: string | null
          risks: Json | null
          stop_loss: number | null
          target_zone_max: number | null
          target_zone_min: number | null
          updated_at: string | null
        }
        Insert: {
          catalysts?: Json | null
          confidence: string
          core_thesis?: string | null
          created_at?: string | null
          direction: string
          entry_zone_max?: number | null
          entry_zone_min?: number | null
          expected_value?: number | null
          explanation?: string | null
          fair_probability?: number | null
          id?: string
          market_edge?: number | null
          market_id?: string | null
          risks?: Json | null
          stop_loss?: number | null
          target_zone_max?: number | null
          target_zone_min?: number | null
          updated_at?: string | null
        }
        Update: {
          catalysts?: Json | null
          confidence?: string
          core_thesis?: string | null
          created_at?: string | null
          direction?: string
          entry_zone_max?: number | null
          entry_zone_min?: number | null
          expected_value?: number | null
          explanation?: string | null
          fair_probability?: number | null
          id?: string
          market_edge?: number | null
          market_id?: string | null
          risks?: Json | null
          stop_loss?: number | null
          target_zone_max?: number | null
          target_zone_min?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "v_closed_markets_performance"
            referencedColumns: ["market_id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          applied_at: string | null
          checksum: string | null
          error_message: string | null
          execution_time_ms: number | null
          id: number
          name: string
          success: boolean
          version: string
        }
        Insert: {
          applied_at?: string | null
          checksum?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: number
          name: string
          success?: boolean
          version: string
        }
        Update: {
          applied_at?: string | null
          checksum?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: number
          name?: string
          success?: boolean
          version?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_agent_confidence_distribution: {
        Row: {
          agent_name: string | null
          confidence_bucket: string | null
          percentage: number | null
          signal_count: number | null
        }
        Relationships: []
      }
      v_agent_direction_agreement: {
        Row: {
          agreement_level: string | null
          last_signal_time: string | null
          long_no_count: number | null
          long_yes_count: number | null
          market_id: string | null
          no_trade_count: number | null
          question: string | null
          total_agents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_signals_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_signals_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "v_closed_markets_performance"
            referencedColumns: ["market_id"]
          },
        ]
      }
      v_agent_performance_summary: {
        Row: {
          agent_name: string | null
          agent_type: string | null
          avg_confidence: number | null
          avg_fair_probability: number | null
          last_signal_time: string | null
          long_no_signals: number | null
          long_yes_signals: number | null
          markets_analyzed: number | null
          no_trade_signals: number | null
          total_signals: number | null
        }
        Relationships: []
      }
      v_agent_usage_frequency: {
        Row: {
          agent_name: string | null
          usage_count: number | null
          usage_percentage: number | null
        }
        Relationships: []
      }
      v_analysis_capacity_utilization: {
        Row: {
          analyses_performed: number | null
          analysis_date: string | null
          capacity_utilization_pct: number | null
          configured_max_per_day: number | null
          utilization_status: string | null
        }
        Relationships: []
      }
      v_analysis_stats_by_type: {
        Row: {
          analysis_type: string | null
          avg_duration_ms: number | null
          failed_analyses: number | null
          success_rate_pct: number | null
          successful_analyses: number | null
          total_analyses: number | null
          total_cost_usd: number | null
        }
        Relationships: []
      }
      v_analysis_volume_trends: {
        Row: {
          analysis_date: string | null
          initial_analyses: number | null
          manual_analyses: number | null
          total_analyses: number | null
          unique_markets: number | null
          update_analyses: number | null
        }
        Relationships: []
      }
      v_closed_markets_performance: {
        Row: {
          agents_in_agreement: number | null
          condition_id: string | null
          confidence: string | null
          days_to_resolution: number | null
          direction: string | null
          edge_captured: number | null
          entry_zone_max: number | null
          entry_zone_min: number | null
          event_type: string | null
          expected_value: number | null
          explanation: string | null
          fair_probability: number | null
          market_edge: number | null
          market_id: string | null
          market_probability_at_recommendation: number | null
          question: string | null
          recommendation_created_at: string | null
          recommendation_id: string | null
          recommendation_was_correct: boolean | null
          resolution_date: string | null
          resolved_outcome: string | null
          roi_realized: number | null
          status: string | null
          total_agents: number | null
        }
        Relationships: []
      }
      v_cost_by_analysis_type: {
        Row: {
          analyses_count: number | null
          analysis_type: string | null
          avg_cost_per_analysis: number | null
          cost_percentage: number | null
          total_cost_usd: number | null
        }
        Relationships: []
      }
      v_cost_by_market: {
        Row: {
          analyses_count: number | null
          avg_cost_per_analysis: number | null
          condition_id: string | null
          event_type: string | null
          question: string | null
          total_cost_usd: number | null
        }
        Relationships: []
      }
      v_cost_summary: {
        Row: {
          avg_cost_per_analysis: number | null
          max_cost_usd: number | null
          min_cost_usd: number | null
          total_analyses: number | null
          total_cost_usd: number | null
          unique_markets: number | null
        }
        Relationships: []
      }
      v_daily_agent_performance: {
        Row: {
          agent_name: string | null
          avg_confidence: number | null
          markets_analyzed: number | null
          signal_date: string | null
          signals_generated: number | null
        }
        Relationships: []
      }
      v_daily_analysis_stats: {
        Row: {
          analysis_date: string | null
          avg_duration_ms: number | null
          failed_analyses: number | null
          markets_analyzed: number | null
          success_rate_pct: number | null
          successful_analyses: number | null
          total_analyses: number | null
          total_cost_usd: number | null
        }
        Relationships: []
      }
      v_daily_cost_tracking: {
        Row: {
          analyses_count: number | null
          avg_cost_per_analysis: number | null
          cost_date: string | null
          max_cost_usd: number | null
          min_cost_usd: number | null
          total_cost_usd: number | null
        }
        Relationships: []
      }
      v_hourly_analysis_distribution: {
        Row: {
          analysis_count: number | null
          hour_of_day: number | null
          percentage: number | null
        }
        Relationships: []
      }
      v_market_analysis_summary: {
        Row: {
          active_markets: number | null
          avg_duration_ms: number | null
          avg_success_duration_ms: number | null
          failed_analyses: number | null
          last_analysis_time: string | null
          resolved_markets: number | null
          success_rate_pct: number | null
          successful_analyses: number | null
          total_analyses: number | null
          total_markets: number | null
        }
        Relationships: []
      }
      v_market_update_frequency: {
        Row: {
          avg_hours_between_updates: number | null
          condition_id: string | null
          first_analysis: string | null
          hours_between_first_last: number | null
          last_analysis: string | null
          question: string | null
          status: string | null
          total_updates: number | null
        }
        Relationships: []
      }
      v_monthly_cost_projection: {
        Row: {
          analyses_this_month: number | null
          cost_this_month: number | null
          projected_monthly_cost: number | null
          projection_month: string | null
        }
        Relationships: []
      }
      v_monthly_performance: {
        Row: {
          avg_edge_captured: number | null
          avg_roi: number | null
          correct_recommendations: number | null
          month: string | null
          total_profit: number | null
          total_recommendations: number | null
          win_rate_pct: number | null
        }
        Relationships: []
      }
      v_most_analyzed_markets: {
        Row: {
          analysis_count: number | null
          avg_duration_ms: number | null
          condition_id: string | null
          event_type: string | null
          last_analyzed: string | null
          question: string | null
          status: string | null
          total_cost_usd: number | null
        }
        Relationships: []
      }
      v_performance_by_agent: {
        Row: {
          agent_correct_signals: number | null
          agent_name: string | null
          agent_signal_accuracy_pct: number | null
          agent_type: string | null
          avg_agent_confidence: number | null
          avg_agent_probability: number | null
          avg_roi: number | null
          correct_recommendations: number | null
          total_agent_signals: number | null
          total_recommendations: number | null
          win_rate_pct: number | null
        }
        Relationships: []
      }
      v_performance_by_category: {
        Row: {
          avg_edge_captured: number | null
          avg_market_liquidity: number | null
          avg_market_volume: number | null
          avg_roi: number | null
          correct_recommendations: number | null
          event_type: string | null
          total_recommendations: number | null
          win_rate_pct: number | null
        }
        Relationships: []
      }
      v_performance_by_confidence: {
        Row: {
          avg_edge_captured: number | null
          avg_expected_value: number | null
          avg_fair_probability: number | null
          avg_roi: number | null
          confidence: string | null
          correct_recommendations: number | null
          total_recommendations: number | null
          win_rate_pct: number | null
        }
        Relationships: []
      }
      v_performance_summary: {
        Row: {
          avg_edge_captured: number | null
          avg_losing_roi: number | null
          avg_roi: number | null
          avg_winning_roi: number | null
          correct_recommendations: number | null
          long_no_count: number | null
          long_no_wins: number | null
          long_yes_count: number | null
          long_yes_wins: number | null
          no_trade_count: number | null
          total_resolved_recommendations: number | null
          win_rate_pct: number | null
        }
        Relationships: []
      }
      v_recent_analyses: {
        Row: {
          analysis_type: string | null
          condition_id: string | null
          confidence: string | null
          cost_usd: number | null
          created_at: string | null
          direction: string | null
          duration_ms: number | null
          error_message: string | null
          question: string | null
          status: string | null
        }
        Relationships: []
      }
      v_weekly_analysis_trends: {
        Row: {
          avg_duration_ms: number | null
          total_analyses: number | null
          total_cost_usd: number | null
          unique_markets: number | null
          week_start: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_migration_lock: { Args: { locker: string }; Returns: boolean }
      get_agent_performance_for_period: {
        Args: { end_date: string; start_date: string }
        Returns: {
          agent_name: string
          agent_type: string
          avg_confidence: number
          markets_analyzed: number
          total_signals: number
        }[]
      }
      get_analysis_stats_for_period: {
        Args: { end_date: string; start_date: string }
        Returns: {
          avg_duration_ms: number
          failed_analyses: number
          success_rate_pct: number
          successful_analyses: number
          total_analyses: number
          total_cost_usd: number
          unique_markets: number
        }[]
      }
      is_migration_applied: {
        Args: { migration_version: string }
        Returns: boolean
      }
      release_migration_lock: { Args: never; Returns: undefined }
      update_recommendation_outcomes: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
