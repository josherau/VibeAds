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
          email: string | null;
          plan: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          plan?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          plan?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      brands: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          url: string | null;
          description: string | null;
          voice: string | null;
          audience: string | null;
          primary_color: string | null;
          accent_color: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          url?: string | null;
          description?: string | null;
          voice?: string | null;
          audience?: string | null;
          primary_color?: string | null;
          accent_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          url?: string | null;
          description?: string | null;
          voice?: string | null;
          audience?: string | null;
          primary_color?: string | null;
          accent_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      competitors: {
        Row: {
          id: string;
          brand_id: string;
          user_id: string;
          name: string;
          website_url: string | null;
          meta_page_id: string | null;
          instagram_handle: string | null;
          twitter_handle: string | null;
          linkedin_url: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          user_id: string;
          name: string;
          website_url?: string | null;
          meta_page_id?: string | null;
          instagram_handle?: string | null;
          twitter_handle?: string | null;
          linkedin_url?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          user_id?: string;
          name?: string;
          website_url?: string | null;
          meta_page_id?: string | null;
          instagram_handle?: string | null;
          twitter_handle?: string | null;
          linkedin_url?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      competitor_ads: {
        Row: {
          id: string;
          competitor_id: string;
          source: string;
          external_id: string | null;
          ad_type: string | null;
          headline: string | null;
          body_text: string | null;
          cta_text: string | null;
          media_urls: string[] | null;
          landing_page_url: string | null;
          engagement_metrics: Json | null;
          is_active: boolean | null;
          first_seen_at: string | null;
          last_seen_at: string | null;
          raw_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          competitor_id: string;
          source: string;
          external_id?: string | null;
          ad_type?: string | null;
          headline?: string | null;
          body_text?: string | null;
          cta_text?: string | null;
          media_urls?: string[] | null;
          landing_page_url?: string | null;
          engagement_metrics?: Json | null;
          is_active?: boolean | null;
          first_seen_at?: string | null;
          last_seen_at?: string | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          competitor_id?: string;
          source?: string;
          external_id?: string | null;
          ad_type?: string | null;
          headline?: string | null;
          body_text?: string | null;
          cta_text?: string | null;
          media_urls?: string[] | null;
          landing_page_url?: string | null;
          engagement_metrics?: Json | null;
          is_active?: boolean | null;
          first_seen_at?: string | null;
          last_seen_at?: string | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      competitor_content: {
        Row: {
          id: string;
          competitor_id: string;
          source: string;
          external_id: string | null;
          content_type: string | null;
          title: string | null;
          body_text: string | null;
          media_urls: string[] | null;
          engagement_metrics: Json | null;
          published_at: string | null;
          raw_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          competitor_id: string;
          source: string;
          external_id?: string | null;
          content_type?: string | null;
          title?: string | null;
          body_text?: string | null;
          media_urls?: string[] | null;
          engagement_metrics?: Json | null;
          published_at?: string | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          competitor_id?: string;
          source?: string;
          external_id?: string | null;
          content_type?: string | null;
          title?: string | null;
          body_text?: string | null;
          media_urls?: string[] | null;
          engagement_metrics?: Json | null;
          published_at?: string | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      competitor_analyses: {
        Row: {
          id: string;
          brand_id: string;
          analysis_type: string;
          title: string | null;
          summary: string | null;
          patterns: Json | null;
          opportunities: Json | null;
          pipeline_run_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          analysis_type: string;
          title?: string | null;
          summary?: string | null;
          patterns?: Json | null;
          opportunities?: Json | null;
          pipeline_run_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          analysis_type?: string;
          title?: string | null;
          summary?: string | null;
          patterns?: Json | null;
          opportunities?: Json | null;
          pipeline_run_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      generated_creatives: {
        Row: {
          id: string;
          brand_id: string;
          user_id: string;
          analysis_id: string | null;
          platform: string;
          format: string;
          headline: string | null;
          headline_variants: string[] | null;
          primary_text: string | null;
          primary_text_variants: string[] | null;
          description: string | null;
          cta: string | null;
          image_prompt: string | null;
          image_concept_description: string | null;
          suggested_colors: Json | null;
          target_audience: string | null;
          competitive_angle: string | null;
          confidence_score: number | null;
          status: string;
          feedback: string | null;
          pipeline_run_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          user_id: string;
          analysis_id?: string | null;
          platform: string;
          format: string;
          headline?: string | null;
          headline_variants?: string[] | null;
          primary_text?: string | null;
          primary_text_variants?: string[] | null;
          description?: string | null;
          cta?: string | null;
          image_prompt?: string | null;
          image_concept_description?: string | null;
          suggested_colors?: Json | null;
          target_audience?: string | null;
          competitive_angle?: string | null;
          confidence_score?: number | null;
          status?: string;
          feedback?: string | null;
          pipeline_run_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          user_id?: string;
          analysis_id?: string | null;
          platform?: string;
          format?: string;
          headline?: string | null;
          headline_variants?: string[] | null;
          primary_text?: string | null;
          primary_text_variants?: string[] | null;
          description?: string | null;
          cta?: string | null;
          image_prompt?: string | null;
          image_concept_description?: string | null;
          suggested_colors?: Json | null;
          target_audience?: string | null;
          competitive_angle?: string | null;
          confidence_score?: number | null;
          status?: string;
          feedback?: string | null;
          pipeline_run_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      pipeline_runs: {
        Row: {
          id: string;
          brand_id: string | null;
          status: string;
          steps_completed: string[] | null;
          error_log: Json | null;
          meta_ads_found: number;
          social_posts_found: number;
          pages_analyzed: number;
          creatives_generated: number;
          started_at: string;
          completed_at: string | null;
          duration_ms: number | null;
        };
        Insert: {
          id?: string;
          brand_id?: string | null;
          status?: string;
          steps_completed?: string[] | null;
          error_log?: Json | null;
          meta_ads_found?: number;
          social_posts_found?: number;
          pages_analyzed?: number;
          creatives_generated?: number;
          started_at?: string;
          completed_at?: string | null;
          duration_ms?: number | null;
        };
        Update: {
          id?: string;
          brand_id?: string | null;
          status?: string;
          steps_completed?: string[] | null;
          error_log?: Json | null;
          meta_ads_found?: number;
          social_posts_found?: number;
          pages_analyzed?: number;
          creatives_generated?: number;
          started_at?: string;
          completed_at?: string | null;
          duration_ms?: number | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
