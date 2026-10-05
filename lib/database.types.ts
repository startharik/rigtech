export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      organization_roles: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string;
          permissions: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string;
          permissions?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organization_roles"]["Insert"]>;
      };
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: "admin" | "manager" | "supervisor" | "employee" | "client";
          custom_role_id: string | null;
          department_id: string | null;
          team_id: string | null;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role?: "admin" | "manager" | "supervisor" | "employee" | "client";
          custom_role_id?: string | null;
          department_id?: string | null;
          team_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organization_members"]["Insert"]>;
      };
      task_members: {
        Row: {
          task_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          task_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_members"]["Insert"]>;
      };
      document_folders: {
        Row: {
          id: string;
          organization_id: string;
          parent_folder_id: string | null;
          name: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          parent_folder_id?: string | null;
          name: string;
          created_by?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["document_folders"]["Insert"]>;
      };
      workspace_documents: {
        Row: {
          id: string;
          organization_id: string;
          folder_id: string | null;
          project_id: string | null;
          file_name: string;
          storage_path: string;
          mime_type: string | null;
          file_size: number;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          folder_id?: string | null;
          project_id?: string | null;
          file_name: string;
          storage_path: string;
          mime_type?: string | null;
          file_size: number;
          uploaded_by?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workspace_documents"]["Insert"]>;
      };
      stock_items: {
        Row: {
          id: string;
          organization_id: string;
          item_code: string;
          name: string;
          category: string;
          description: string;
          unit: string;
          minimum_quantity: number;
          quantity_on_hand: number;
          last_unit_price: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          item_code: string;
          name: string;
          category?: string;
          description?: string;
          unit?: string;
          minimum_quantity?: number;
          quantity_on_hand?: number;
          last_unit_price?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["stock_items"]["Insert"]>;
      };
      stock_categories: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["stock_categories"]["Insert"]>;
      };
      stock_movements: {
        Row: {
          id: string;
          organization_id: string;
          stock_item_id: string;
          movement_type: "receipt" | "issue";
          quantity: number;
          ordered_quantity: number | null;
          movement_date: string;
          purchase_order: string | null;
          project_number: string | null;
          delivery_note: string | null;
          area: string | null;
          mtc: string | null;
          unit_price: number | null;
          comments: string | null;
          recorded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          stock_item_id: string;
          movement_type: "receipt" | "issue";
          quantity: number;
          ordered_quantity?: number | null;
          movement_date?: string;
          purchase_order?: string | null;
          project_number?: string | null;
          delivery_note?: string | null;
          area?: string | null;
          mtc?: string | null;
          unit_price?: number | null;
          comments?: string | null;
          recorded_by?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["stock_movements"]["Insert"]>;
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
      Functions: {
        record_stock_movement: {
          Args: {
            p_organization_id: string;
            p_stock_item_id: string;
            p_movement_type: "receipt" | "issue";
            p_quantity: number;
            p_movement_date: string;
            p_ordered_quantity?: number | null;
            p_purchase_order?: string | null;
            p_project_number?: string | null;
            p_delivery_note?: string | null;
            p_area?: string | null;
            p_mtc?: string | null;
            p_unit_price?: number | null;
            p_comments?: string | null;
          };
          Returns: string;
        };
        delete_stock_item: {
          Args: {
            p_organization_id: string;
            p_stock_item_id: string;
          };
          Returns: undefined;
        };
        record_stock_movement_with_role: {
          Args: {
            p_organization_id: string;
            p_stock_item_id: string;
            p_movement_type: "receipt" | "issue";
            p_quantity: number;
            p_movement_date: string;
            p_ordered_quantity?: number | null;
            p_purchase_order?: string | null;
            p_project_number?: string | null;
            p_delivery_note?: string | null;
            p_area?: string | null;
            p_mtc?: string | null;
            p_unit_price?: number | null;
            p_comments?: string | null;
          };
          Returns: string;
        };
        delete_stock_item_with_role: {
          Args: { p_organization_id: string; p_stock_item_id: string };
          Returns: undefined;
        };
        current_user_can_access_module: {
          Args: { target_module: string; target_action?: string; target_organization_id?: string | null };
          Returns: boolean;
        };
      };
    };
  };
};
