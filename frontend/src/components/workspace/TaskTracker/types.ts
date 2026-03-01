export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskWorkload = 'xs' | 's' | 'm' | 'l' | 'xl';

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  assignees?: string[];
  due_date?: string;
  subtasks?: SubTask[];
}

export interface Attachment {
  id: string;
  name: string;
  type: 'file' | 'image' | 'video' | 'audio' | 'url';
  url: string;
  size?: number;
}

export interface Task {
  id: string;
  title: string;
  assignees?: string[];
  status: TaskStatus;
  priority?: TaskPriority;
  task_type?: string;
  workload?: TaskWorkload;
  due_date?: string;
  overdue_reminder?: boolean;
  description?: string;
  subtasks?: SubTask[];
  attachments?: Attachment[];
  created_at: string;
  updated_at: string;
}

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; icon: string }> = {
  todo:        { label: '未开始', color: '#9B9A97', bg: '#F1F1EF', icon: '○' },
  in_progress: { label: '进行中', color: '#2F80ED', bg: '#EBF5FF', icon: '◑' },
  blocked:     { label: '已中断', color: '#EB5757', bg: '#FFEAEA', icon: '✕' },
  done:        { label: '已完成', color: '#0F9D58', bg: '#E6F4EA', icon: '✓' },
};

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  urgent: { label: '紧急', color: '#EB5757', bg: '#FFEAEA' },
  high:   { label: '高',   color: '#F2994A', bg: '#FFF3E0' },
  medium: { label: '中',   color: '#2F80ED', bg: '#EBF5FF' },
  low:    { label: '低',   color: '#9B9A97', bg: '#F1F1EF' },
};

export const WORKLOAD_CONFIG: Record<TaskWorkload, { label: string; desc: string }> = {
  xs: { label: 'XS', desc: '极小 (<1h)' },
  s:  { label: 'S',  desc: '小 (1-4h)' },
  m:  { label: 'M',  desc: '中 (半天)' },
  l:  { label: 'L',  desc: '大 (1天)' },
  xl: { label: 'XL', desc: '超大 (>1天)' },
};

export const TASK_TYPES = ['功能', '缺陷', '研究', '设计', '其他'];

export function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === 'done') return false;
  return new Date(task.due_date) < new Date();
}

// ── Enhanced TaskTracker types ───────────────────────────────────────────────

export type TaskField =
  | 'title' | 'task_type' | 'priority' | 'workload'
  | 'due_date' | 'description' | 'updated_at' | 'status'
  | 'assignees' | 'overdue' | 'attachments';

export const TASK_FIELD_LABELS: Record<TaskField, string> = {
  title: '任务名称',
  status: '状态',
  priority: '优先级',
  workload: '工作量',
  task_type: '类型',
  assignees: '负责人',
  due_date: '截止日期',
  description: '描述',
  updated_at: '更新时间',
  overdue: '是否逾期',
  attachments: '附件',
};

export type FilterOperator =
  | 'contains' | 'not_contains' | 'is' | 'is_not'
  | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty'
  | 'before' | 'after';

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: '包含',
  not_contains: '不包含',
  is: '是',
  is_not: '不是',
  starts_with: '开头是',
  ends_with: '结尾是',
  is_empty: '为空',
  is_not_empty: '不为空',
  before: '早于',
  after: '晚于',
};

export interface FilterCondition {
  id: string;
  field: TaskField;
  operator: FilterOperator;
  value: string;
}

export interface FilterGroup {
  id: string;
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
}

export interface SortRule {
  id: string;
  field: TaskField;
  direction: 'asc' | 'desc';
}

export type LayoutMode =
  | 'table' | 'kanban' | 'timeline' | 'calendar'
  | 'list' | 'gallery' | 'chart' | 'activity';

export const LAYOUT_CONFIG: Record<LayoutMode, { label: string; icon: string }> = {
  table:    { label: '表格',   icon: 'clipboard' },
  kanban:   { label: '看板',   icon: 'card-file' },
  timeline: { label: '时间轴', icon: 'alarm-clock' },
  calendar: { label: '日历',   icon: 'alarm-clock' },
  list:     { label: '列表',   icon: 'document' },
  gallery:  { label: '画廊',   icon: 'folder-open' },
  chart:    { label: '图表',   icon: 'bar-chart' },
  activity: { label: '动态',   icon: 'lightning' },
};

export interface ColorCondition {
  id: string;
  field: TaskField;
  operator: FilterOperator;
  value: string;
  color: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: 'status_changed' | 'due_today' | 'created';
    value?: string;
  };
  action: {
    type: 'set_field' | 'reminder' | 'summarize';
    field?: string;
    value?: string;
    message?: string;
  };
}

export interface ViewConfig {
  layout: LayoutMode;
  showVerticalLines: boolean;
  showPageIcons: boolean;
  allContentRows: boolean;
  openPageMode: 'side_preview' | 'center_preview' | 'full_page';
  visibleProperties: TaskField[];
  filterGroups: FilterGroup[];
  sortRules: SortRule[];
  colorConditions: ColorCondition[];
  automations: AutomationRule[];
}

export const DEFAULT_VIEW_CONFIG: ViewConfig = {
  layout: 'table',
  showVerticalLines: false,
  showPageIcons: true,
  allContentRows: false,
  openPageMode: 'center_preview',
  visibleProperties: ['status', 'priority', 'assignees', 'due_date'],
  filterGroups: [],
  sortRules: [],
  colorConditions: [],
  automations: [],
};

export type FieldType = 'text' | 'enum' | 'date' | 'boolean' | 'list';

export function getFieldType(field: TaskField): FieldType {
  if (field === 'due_date' || field === 'updated_at') return 'date';
  if (field === 'overdue') return 'boolean';
  if (field === 'status' || field === 'priority' || field === 'workload' || field === 'task_type') return 'enum';
  if (field === 'assignees' || field === 'attachments') return 'list';
  return 'text';
}

export function getOperatorsForField(field: TaskField): FilterOperator[] {
  const ft = getFieldType(field);
  if (ft === 'text') return ['contains', 'not_contains', 'is', 'is_not', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'];
  if (ft === 'enum') return ['is', 'is_not', 'is_empty', 'is_not_empty'];
  if (ft === 'date') return ['is', 'before', 'after', 'is_empty', 'is_not_empty'];
  if (ft === 'boolean') return ['is'];
  if (ft === 'list') return ['contains', 'is_empty', 'is_not_empty'];
  return ['is'];
}

export function getEnumOptions(field: TaskField): string[] {
  if (field === 'status') return Object.keys(STATUS_CONFIG);
  if (field === 'priority') return Object.keys(PRIORITY_CONFIG);
  if (field === 'workload') return Object.keys(WORKLOAD_CONFIG);
  if (field === 'task_type') return TASK_TYPES;
  if (field === 'overdue') return ['true', 'false'];
  return [];
}

export function getEnumLabel(field: TaskField, value: string): string {
  if (field === 'status') return STATUS_CONFIG[value as TaskStatus]?.label ?? value;
  if (field === 'priority') return PRIORITY_CONFIG[value as TaskPriority]?.label ?? value;
  if (field === 'workload') return WORKLOAD_CONFIG[value as TaskWorkload]?.label ?? value;
  if (field === 'overdue') return value === 'true' ? '已逾期' : '未逾期';
  return value;
}

export function getFieldValue(task: Task, field: TaskField): string {
  switch (field) {
    case 'title': return task.title ?? '';
    case 'status': return task.status ?? '';
    case 'priority': return task.priority ?? '';
    case 'workload': return task.workload ?? '';
    case 'task_type': return task.task_type ?? '';
    case 'due_date': return task.due_date ?? '';
    case 'updated_at': return task.updated_at ?? '';
    case 'description': return task.description ?? '';
    case 'assignees': return task.assignees?.join(',') ?? '';
    case 'overdue': return isOverdue(task) ? 'true' : 'false';
    case 'attachments': return String(task.attachments?.length ?? 0);
    default: return '';
  }
}

export function matchCondition(task: Task, cond: FilterCondition): boolean {
  const raw = getFieldValue(task, cond.field);
  const val = raw.toLowerCase();
  const target = (cond.value ?? '').toLowerCase();

  switch (cond.operator) {
    case 'contains':     return val.includes(target);
    case 'not_contains': return !val.includes(target);
    case 'is':           return val === target;
    case 'is_not':       return val !== target;
    case 'starts_with':  return val.startsWith(target);
    case 'ends_with':    return val.endsWith(target);
    case 'is_empty':     return !raw || raw.trim() === '';
    case 'is_not_empty': return !!(raw && raw.trim() !== '');
    case 'before':       return raw ? new Date(raw) < new Date(cond.value) : false;
    case 'after':        return raw ? new Date(raw) > new Date(cond.value) : false;
    default:             return true;
  }
}

export function applyConfig(tasks: Task[], config: ViewConfig, searchQuery: string): Task[] {
  let result = [...tasks];

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    result = result.filter(t => t.title.toLowerCase().includes(q));
  }

  for (const group of config.filterGroups) {
    if (group.conditions.length === 0) continue;
    result = result.filter(task => {
      const results = group.conditions.map(c => matchCondition(task, c));
      return group.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
    });
  }

  if (config.sortRules.length > 0) {
    result.sort((a, b) => {
      for (const rule of config.sortRules) {
        const va = getFieldValue(a, rule.field);
        const vb = getFieldValue(b, rule.field);
        const cmp = va.localeCompare(vb);
        if (cmp !== 0) return rule.direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }

  return result;
}

export function getRowColor(task: Task, colorConditions: ColorCondition[]): string | undefined {
  for (const cc of colorConditions) {
    if (matchCondition(task, { id: cc.id, field: cc.field, operator: cc.operator, value: cc.value })) {
      return cc.color;
    }
  }
  return undefined;
}
