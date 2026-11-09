
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "classes": {
                  Row: {
                    "color": string,"created_at": string,"id": string,"name": string,"owner_id": string,"subject": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name": string,"owner_id"?: string,"subject"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string,"subject"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"concepts": {
                  Row: {
                    "created_at": string,"detail": string,"id": string,"kind": string,"owner_id": string,"page_index": number | null,"quiz_set_id": string,"quote": string | null,"term": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"detail": string,"id"?: string,"kind": string,"owner_id"?: string,"page_index"?: number | null,"quiz_set_id": string,"quote"?: string | null,"term": string
                  }
                  Update: {
                    "created_at"?: string,"detail"?: string,"id"?: string,"kind"?: string,"owner_id"?: string,"page_index"?: number | null,"quiz_set_id"?: string,"quote"?: string | null,"term"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "concepts_quiz_set_id_fkey"
      columns: ["quiz_set_id"]
isOneToOne: false
      referencedRelation: "quiz_sets"
      referencedColumns: ["id"]
    }
                  ]
                },"handwriting_corrections": {
                  Row: {
                    "class_id": string | null,"context": string | null,"corrected": string,"created_at": string,"id": string,"note_page_id": string | null,"original": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id"?: string | null,"context"?: string | null,"corrected": string,"created_at"?: string,"id"?: string,"note_page_id"?: string | null,"original": string,"owner_id"?: string
                  }
                  Update: {
                    "class_id"?: string | null,"context"?: string | null,"corrected"?: string,"created_at"?: string,"id"?: string,"note_page_id"?: string | null,"original"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "handwriting_corrections_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handwriting_corrections_note_page_id_fkey"
      columns: ["note_page_id"]
isOneToOne: false
      referencedRelation: "note_pages"
      referencedColumns: ["id"]
    }
                  ]
                },"note_pages": {
                  Row: {
                    "created_at": string,"error": string | null,"focus": NonNullable<Json>,"id": string,"image_path": string | null,"model": string | null,"note_id": string,"owner_id": string,"page_index": number,"raw_text": string | null,"source_text": string | null,"status": string,"text": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"focus"?: NonNullable<Json>,"id"?: string,"image_path"?: string | null,"model"?: string | null,"note_id": string,"owner_id"?: string,"page_index": number,"raw_text"?: string | null,"source_text"?: string | null,"status"?: string,"text"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"focus"?: NonNullable<Json>,"id"?: string,"image_path"?: string | null,"model"?: string | null,"note_id"?: string,"owner_id"?: string,"page_index"?: number,"raw_text"?: string | null,"source_text"?: string | null,"status"?: string,"text"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "note_pages_note_id_fkey"
      columns: ["note_id"]
isOneToOne: false
      referencedRelation: "notes"
      referencedColumns: ["id"]
    }
                  ]
                },"notes": {
                  Row: {
                    "class_id": string | null,"created_at": string,"id": string,"owner_id": string,"source": string,"status": string,"title": string,"topic_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id"?: string | null,"created_at"?: string,"id"?: string,"owner_id"?: string,"source"?: string,"status"?: string,"title"?: string,"topic_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "class_id"?: string | null,"created_at"?: string,"id"?: string,"owner_id"?: string,"source"?: string,"status"?: string,"title"?: string,"topic_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notes_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notes_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"display_name": string | null,"id": string,"plan": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string | null,"id": string,"plan"?: string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"plan"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"questions": {
                  Row: {
                    "concept_id": string | null,"created_at": string,"data": NonNullable<Json>,"difficulty": number,"edited": boolean,"explanation": string | null,"id": string,"is_focus": boolean,"owner_id": string,"position": number,"quiz_set_id": string,"source_page": number | null,"source_quote": string | null,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "concept_id"?: string | null,"created_at"?: string,"data": NonNullable<Json>,"difficulty"?: number,"edited"?: boolean,"explanation"?: string | null,"id"?: string,"is_focus"?: boolean,"owner_id"?: string,"position"?: number,"quiz_set_id": string,"source_page"?: number | null,"source_quote"?: string | null,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "concept_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"difficulty"?: number,"edited"?: boolean,"explanation"?: string | null,"id"?: string,"is_focus"?: boolean,"owner_id"?: string,"position"?: number,"quiz_set_id"?: string,"source_page"?: number | null,"source_quote"?: string | null,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "questions_concept_id_fkey"
      columns: ["concept_id"]
isOneToOne: false
      referencedRelation: "concepts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "questions_quiz_set_id_fkey"
      columns: ["quiz_set_id"]
isOneToOne: false
      referencedRelation: "quiz_sets"
      referencedColumns: ["id"]
    }
                  ]
                },"quiz_sets": {
                  Row: {
                    "class_id": string | null,"created_at": string,"description": string | null,"id": string,"note_id": string | null,"owner_id": string,"share_code": string,"status": string,"title": string,"topic_id": string | null,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"note_id"?: string | null,"owner_id"?: string,"share_code"?: string,"status"?: string,"title": string,"topic_id"?: string | null,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "class_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"note_id"?: string | null,"owner_id"?: string,"share_code"?: string,"status"?: string,"title"?: string,"topic_id"?: string | null,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_sets_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quiz_sets_note_id_fkey"
      columns: ["note_id"]
isOneToOne: false
      referencedRelation: "notes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quiz_sets_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"topics": {
                  Row: {
                    "class_id": string,"created_at": string,"id": string,"name": string,"owner_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"created_at"?: string,"id"?: string,"name": string,"owner_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "class_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "topics_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    }
                  ]
                },"usage_events": {
                  Row: {
                    "created_at": string,"id": number,"kind": string,"owner_id": string,"units": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"kind": string,"owner_id": string,"units"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"kind"?: string,"owner_id"?: string,"units"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "get_shared_quiz":
{ Args: { "code": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
