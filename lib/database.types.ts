export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: "admin" | "manager" | "supervisor" | "employee" | "client";
          department_id: string | null;
          team_id: string | null;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role?: "admin" | "manager" | "supervisor" | "employee" | "client";
          department_id?: string | null;
          team_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organization_members"]["Insert"]>;
      };
      tasks: {
        Row: {
          id: string;
          organization_id: string;
          parent_task_id: string | null;
          created_by: string;
          assignee_id: string | null;
          department_id: string | null;
          team_id: string | null;
          client_id: string | null;
          title: string;
          description: string;
          status: "to_do" | "in_progress" | "waiting" | "completed";
          priority: "low" | "medium" | "high" | "urgent";
          due_date: string | null;
          visibility: "internal" | "client_visible";
          tags: string[];
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          parent_task_id?: string | null;
          created_by: string;
          assignee_id?: string | null;
          department_id?: string | null;
          team_id?: string | null;
          client_id?: string | null;
          title: string;
          description?: string;
          status?: "to_do" | "in_progress" | "waiting" | "completed";
          priority?: "low" | "medium" | "high" | "urgent";
          due_date?: string | null;
          visibility?: "internal" | "client_visible";
          tags?: string[];
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
      };
    };
    Views: {
      task_tree: {
        Row: Database["public"]["Tables"]["tasks"]["Row"] & {
          assignee_name: string | null;
          client_name: string | null;
          department_name: string | null;
        };
      };
    };
  };
};
