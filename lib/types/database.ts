/**
 * Hand-maintained mirror of `supabase/migrations/0001_init.sql`.
 *
 * Shaped exactly like `supabase gen types typescript` output so it can be
 * swapped for generated types once the CLI is linked to the project.
 */

export type GlobalRole = "super_admin" | "user";
export type WorkspaceRole = "tenant_admin" | "member";
export type WorkspacePlan = "free" | "pro";

/** Phase 2 — ingestion pipeline. */
export type LogFormat = "json" | "csv" | "syslog" | "plaintext";
export type IngestStatus =
  | "pending"
  | "queued"
  | "parsing"
  | "embedding"
  | "analyzing"
  | "completed"
  | "failed";
/** Phase 3 — per-step remediation triage. */
export type RemediationStatus = "pending" | "in_progress" | "resolved";

export type FindingStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "dismissed";
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "cancelled"
  | "suspended";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          global_role: GlobalRole;
          is_suspended: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          global_role?: GlobalRole;
          is_suspended?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          global_role?: GlobalRole;
          is_suspended?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspaces: {
        Row: {
          id: string;
          name: string;
          slug: string;
          owner_id: string;
          plan: WorkspacePlan;
          subscription_status: SubscriptionStatus;
          is_suspended: boolean;
          seats: number;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_price_id: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          owner_id: string;
          plan?: WorkspacePlan;
          subscription_status?: SubscriptionStatus;
          is_suspended?: boolean;
          seats?: number;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_price_id?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          owner_id?: string;
          plan?: WorkspacePlan;
          subscription_status?: SubscriptionStatus;
          is_suspended?: boolean;
          seats?: number;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_price_id?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          workspace_id: string;
          user_id: string;
          workspace_role: WorkspaceRole;
          created_at: string;
        };
        Insert: {
          workspace_id: string;
          user_id: string;
          workspace_role?: WorkspaceRole;
          created_at?: string;
        };
        Update: {
          workspace_id?: string;
          user_id?: string;
          workspace_role?: WorkspaceRole;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          workspace_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          metadata: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          workspace_id?: string | null;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          workspace_id?: string | null;
          action?: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      log_files: {
        Row: {
          id: string;
          workspace_id: string;
          uploaded_by: string | null;
          filename: string;
          storage_path: string;
          mime_type: string;
          size_bytes: number;
          format: LogFormat;
          status: IngestStatus;
          error_message: string | null;
          event_count: number;
          chunk_count: number;
          masked_count: number;
          checksum: string | null;
          created_at: string;
          updated_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          uploaded_by?: string | null;
          filename: string;
          storage_path: string;
          mime_type: string;
          size_bytes: number;
          format: LogFormat;
          status?: IngestStatus;
          error_message?: string | null;
          event_count?: number;
          chunk_count?: number;
          masked_count?: number;
          checksum?: string | null;
          created_at?: string;
          updated_at?: string;
          processed_at?: string | null;
        };
        Update: {
          status?: IngestStatus;
          error_message?: string | null;
          event_count?: number;
          chunk_count?: number;
          masked_count?: number;
          checksum?: string | null;
          // Rewritten at commit time from the real object size in storage.
          size_bytes?: number;
          format?: LogFormat;
          updated_at?: string;
          processed_at?: string | null;
        };
        Relationships: [];
      };
      log_chunks: {
        Row: {
          id: string;
          workspace_id: string;
          file_id: string;
          chunk_index: number;
          content: string;
          token_estimate: number;
          metadata: Json;
          embedding: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          file_id: string;
          chunk_index: number;
          content: string;
          token_estimate?: number;
          metadata?: Json;
          embedding?: string | null;
          created_at?: string;
        };
        Update: {
          content?: string;
          metadata?: Json;
          embedding?: string | null;
        };
        Relationships: [];
      };
      threat_findings: {
        Row: {
          id: string;
          workspace_id: string;
          file_id: string | null;
          title: string;
          threat_type: string;
          severity_score: number;
          confidence: number;
          explanation: string;
          remediation: Json;
          indicators: Json;
          mitre_techniques: Json;
          evidence_chunk_ids: string[];
          status: FindingStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          file_id?: string | null;
          title: string;
          threat_type: string;
          severity_score: number;
          confidence?: number;
          explanation: string;
          remediation?: Json;
          indicators?: Json;
          mitre_techniques?: Json;
          evidence_chunk_ids?: string[];
          status?: FindingStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: FindingStatus;
          updated_at?: string;
        };
        Relationships: [];
      };
      finding_remediation_steps: {
        Row: {
          id: string;
          workspace_id: string;
          finding_id: string;
          step_index: number;
          description: string;
          status: RemediationStatus;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          finding_id: string;
          step_index: number;
          description: string;
          status?: RemediationStatus;
          updated_by?: string | null;
        };
        Update: {
          // Everything else is pinned by guard_remediation_step_fields().
          status?: RemediationStatus;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      workspace_invitations: {
        Row: {
          id: string;
          workspace_id: string;
          email: string;
          token_hash: string;
          workspace_role: WorkspaceRole;
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          email: string;
          token_hash: string;
          workspace_role?: WorkspaceRole;
          invited_by?: string | null;
          expires_at: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      usage_daily: {
        Row: {
          workspace_id: string;
          day: string;
          scans: number;
          tokens: number;
          ai_calls: number;
          updated_at: string;
        };
        Insert: {
          workspace_id: string;
          day?: string;
          scans?: number;
          tokens?: number;
          ai_calls?: number;
          updated_at?: string;
        };
        Update: {
          scans?: number;
          tokens?: number;
          ai_calls?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      stripe_events: {
        Row: {
          id: string;
          type: string;
          workspace_id: string | null;
          received_at: string;
        };
        Insert: {
          id: string;
          type: string;
          workspace_id?: string | null;
          received_at?: string;
        };
        Update: { type?: string; workspace_id?: string | null };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      match_log_chunks: {
        Args: {
          query_embedding: string;
          filter_workspace: string;
          match_count?: number;
          similarity_threshold?: number;
          filter_file?: string | null;
        };
        Returns: {
          id: string;
          file_id: string;
          chunk_index: number;
          content: string;
          metadata: Json;
          similarity: number;
        }[];
      };
      workspace_threat_analytics: {
        Args: { target: string };
        Returns: Json;
      };
      workspace_ingest_usage: {
        Args: { target: string };
        Returns: {
          files_total: number;
          bytes_total: number;
          files_last_24h: number;
          bytes_last_24h: number;
        }[];
      };
      record_usage: {
        Args: {
          p_workspace_id: string;
          p_scans?: number;
          p_tokens?: number;
          p_ai_calls?: number;
        };
        Returns: number;
      };
      seats_for_plan: {
        Args: { p: WorkspacePlan };
        Returns: number;
      };
      consume_scan_quota: {
        Args: { p_workspace_id: string; p_limit: number | null };
        Returns: {
          allowed: boolean;
          used: number;
          quota: number | null;
        }[];
      };
    };
    Enums: {
      global_role: GlobalRole;
      workspace_role: WorkspaceRole;
      workspace_plan: WorkspacePlan;
      subscription_status: SubscriptionStatus;
      log_format: LogFormat;
      ingest_status: IngestStatus;
      finding_status: FindingStatus;
      remediation_status: RemediationStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];
export type WorkspaceMember =
  Database["public"]["Tables"]["workspace_members"]["Row"];
export type AuditLog = Database["public"]["Tables"]["audit_logs"]["Row"];

/**
 * Custom claims injected into the access token by the
 * `public.custom_access_token_hook` Postgres function.
 */
export interface GuardAIClaims {
  sub: string;
  email?: string;
  global_role?: GlobalRole;
  workspace_id?: string | null;
  workspace_role?: WorkspaceRole | null;
  is_suspended?: boolean;
  /** Authenticator Assurance Level minted by Supabase: aal1 or aal2. */
  aal?: string;
  /** True when the account has at least one *verified* MFA factor. */
  has_mfa?: boolean;
}

export type LogFile = Database["public"]["Tables"]["log_files"]["Row"];
export type LogChunk = Database["public"]["Tables"]["log_chunks"]["Row"];
export type ThreatFinding =
  Database["public"]["Tables"]["threat_findings"]["Row"];

export type RemediationStep =
  Database["public"]["Tables"]["finding_remediation_steps"]["Row"];

/** Phase 4 — billing, invitations, metering. */
export type WorkspaceInvitation =
  Database["public"]["Tables"]["workspace_invitations"]["Row"];
export type UsageDaily = Database["public"]["Tables"]["usage_daily"]["Row"];
