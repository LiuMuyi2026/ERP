// ── Shared Database Types ─────────────────────────────────────────────────────

export type ColumnType = 'title' | 'text' | 'select' | 'multi_select' | 'status' | 'date' | 'number' | 'checkbox' | 'url' | 'email' | 'person';

export interface ColumnOption {
  value: string;
  color?: string; // hex or predefined: red|orange|yellow|green|blue|purple|gray
}

export interface DBColumn {
  key: string;
  title: string;
  type: ColumnType;
  options?: ColumnOption[]; // for select/multi_select/status
  width?: number;
}

export interface DBRow {
  _id?: string;
  [key: string]: any;
}

export interface DBSchema {
  columns: DBColumn[];
  groupBy?: string;    // key of column to group by (kanban)
  dateField?: string;  // key of date column (calendar)
}

export interface DatabaseViewData {
  schema: DBSchema;
  rows: DBRow[];
}

// Status option predefined colors
export const STATUS_OPTION_COLORS: Record<string, { bg: string; text: string }> = {
  'Not started':  { bg: '#f1f1ef', text: '#787774' },
  'In progress':  { bg: '#dbeafe', text: '#1d4ed8' },
  'Done':         { bg: '#dcfce7', text: '#15803d' },
  'Blocked':      { bg: '#fee2e2', text: '#dc2626' },
  'Todo':         { bg: '#f1f1ef', text: '#787774' },
  'Review':       { bg: '#fef3c7', text: '#b45309' },
  'Cancelled':    { bg: '#f1f1ef', text: '#9ca3af' },
  'High':         { bg: '#fee2e2', text: '#dc2626' },
  'Medium':       { bg: '#fef3c7', text: '#b45309' },
  'Low':          { bg: '#f0fdf4', text: '#16a34a' },
  'Urgent':       { bg: '#fce7f3', text: '#be185d' },
};

export function getOptionColor(value: string, options?: ColumnOption[]): { bg: string; text: string } {
  // Check predefined
  if (STATUS_OPTION_COLORS[value]) return STATUS_OPTION_COLORS[value];

  // Hash color from value string
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = value.charCodeAt(i) + ((hash << 5) - hash);
  const palettes = [
    { bg: '#dbeafe', text: '#1d4ed8' },
    { bg: '#dcfce7', text: '#15803d' },
    { bg: '#fef3c7', text: '#b45309' },
    { bg: '#f3e8ff', text: '#7e22ce' },
    { bg: '#ffe4e6', text: '#be123c' },
    { bg: '#e0f2fe', text: '#0369a1' },
    { bg: '#fce7f3', text: '#be185d' },
    { bg: '#ecfdf5', text: '#059669' },
  ];
  return palettes[Math.abs(hash) % palettes.length];
}

export function generateRowId(): string {
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
