"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, PointerSensor, closestCenter, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import Image from "next/image";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarRange,
  ChevronRight,
  CircleDashed,
  Check,
  Files,
  Gauge,
  TrendingUp,
  TriangleAlert,
  ClipboardList,
  FolderKanban,
  Layers3,
  KanbanSquare,
  LogOut,
  Menu,
  MessageSquareText,
  Package,
  Plus,
  Pencil,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Trash2,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import StockManagement from "./stock-management";
import DocumentManagement from "./document-management";

type TaskStatus = "To do" | "In progress" | "Waiting" | "Completed";
type TaskPriority = "Urgent" | "High" | "Medium" | "Low";

type TaskSubtask = {
  id: number;
  supabaseId: string;
  title: string;
  description: string;
  completed: boolean;
  children: TaskSubtask[];
};

type Task = {
  id: number;
  supabaseId: string;
  title: string;
  project: string;
  assignee: string;
  assigneeIds: string[];
  status: TaskStatus;
  priority: TaskPriority;
  due: string;
  description: string;
  client: string;
  department: string;
  progress: number;
  subtasks: TaskSubtask[];
};

type WorkspaceMember = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "supervisor" | "employee" | "client";
  customRoleId: string | null;
  departmentId: string | null;
  departmentIds: string[];
  teamId: string | null;
  availabilityStatus: "available" | "limited" | "unavailable" | "leave";
  capacityHoursPerWeek: number;
  maxActiveTasks: number;
};

type ModuleAccess = { view: boolean; manage: boolean };
type WorkspaceRole = {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, ModuleAccess>;
};

type WorkspaceTeam = {
  id: string;
  name: string;
  departmentId: string | null;
};

type WorkspaceClient = {
  id: string;
  name: string;
  contactEmail: string | null;
  userId: string | null;
  customRoleId: string | null;
};

type WorkspaceDepartment = {
  id: string;
  name: string;
};

type WorkspaceProject = {
  id: string;
  name: string;
  description: string;
  clientId: string | null;
  status?: string;
  createdAt?: string;
  startDate?: string | null;
  targetDate?: string | null;
};

type ProjectMilestone = {
  id: string;
  name: string;
  description: string;
  dueDate: string | null;
  completedAt: string | null;
};

type ProjectTaskDetail = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  due: string;
  description: string;
  parentTaskId: string | null;
};

type ProjectDetail = {
  project: WorkspaceProject;
  tasks: ProjectTaskDetail[];
  milestones: ProjectMilestone[];
  attachments: TaskAttachment[];
  comments: TaskComment[];
};

type TaskComment = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};

type TaskAttachment = {
  id: string;
  fileName: string;
  mimeType: string | null;
  url: string | null;
  uploadedAt: string;
};

type WorkspaceNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
  isRead: boolean;
};

type WorkspaceNote = {
  id: string;
  title: string;
  body: string;
  color: "yellow" | "blue" | "green" | "pink";
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

type TaskAuditEvent = {
  id: string;
  action: string;
  changedFields: string[];
  createdAt: string;
};

type OfflineTaskUpdate = {
  taskId: string;
  status: TaskStatus;
};

const formatUploadedDate = (value: string) => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp)
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
};

const formatTaskDueDate = (value: string) => {
  if (!value || value === "No due date") return { label: "No due date", overdue: false };
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { label: value, overdue: false };
  const today = new Date();
  const todayPart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return {
    label: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date),
    overdue: datePart < todayPart,
  };
};

const memberRoleLabels = {
  admin: "Admin",
  manager: "Manager",
  supervisor: "Supervisor",
  employee: "Employee",
  client: "Client",
} as const;

const navItems = [
  { label: "Dashboard", id: "dashboard", icon: Sparkles },
  { label: "Executive", id: "executive", icon: Gauge },
  { label: "My tasks", id: "my-tasks", icon: ClipboardList },
  { label: "All tasks", id: "all-tasks", icon: Layers3 },
  { label: "Projects", id: "projects", icon: BarChart3 },
  { label: "Stock", id: "stock", icon: Package },
  { label: "Documents", id: "documents", icon: Files },
  { label: "Employees", id: "team", icon: Users },
  { label: "Clients", id: "clients", icon: BriefcaseBusiness },
  { label: "Departments", id: "departments", icon: FolderKanban },
  { label: "Notifications", id: "notifications", icon: Bell },
  { label: "Sticky notes", id: "notes", icon: StickyNote },
  { label: "Settings", id: "settings", icon: ShieldCheck },
] as const;
type WorkspaceView = (typeof navItems)[number]["id"];
const roleModules = [
  { id: "dashboard", label: "Dashboard" },
  { id: "executive", label: "Executive overview" },
  { id: "tasks", label: "Tasks" },
  { id: "projects", label: "Projects" },
  { id: "stock", label: "Stock management" },
  { id: "documents", label: "Documents" },
  { id: "team", label: "Employees and roles" },
  { id: "clients", label: "Clients" },
  { id: "departments", label: "Departments" },
  { id: "notifications", label: "Notifications" },
  { id: "notes", label: "Sticky notes" },
  { id: "settings", label: "Settings" },
] as const;
const navGroups = [
  { id: "overview", label: "OVERVIEW", views: ["dashboard", "executive"] },
  { id: "work", label: "WORKSPACE", views: ["my-tasks", "all-tasks", "projects"] },
  { id: "operations", label: "OPERATIONS", views: ["stock", "documents"] },
  { id: "people", label: "PEOPLE", views: ["team", "clients", "departments"] },
  { id: "personal", label: "PERSONAL", views: ["notifications", "notes", "settings"] },
] as const;

const isWorkspaceView = (value: unknown): value is WorkspaceView =>
  navItems.some(({ id }) => id === value);

const viewModule = (view: WorkspaceView) =>
  view === "my-tasks" || view === "all-tasks" ? "tasks" : view;

const defaultModuleAccess = (
  role: WorkspaceMember["role"] | null,
  module: string,
): ModuleAccess => {
  const canView = role === "admin" || role === "manager" || role === "supervisor" || role === "employee"
    ? true
    : role === "client" && ["dashboard", "tasks", "projects", "notifications"].includes(module);
  const canManage = role === "admin"
    || (role === "manager" && ["tasks", "projects", "stock", "documents", "team", "clients", "departments", "notes", "settings", "notifications"].includes(module))
    || (role === "supervisor" && ["tasks", "stock", "documents", "notes"].includes(module))
    || (role === "employee" && ["tasks", "documents", "notes", "notifications"].includes(module));
  return { view: canView, manage: canManage };
};

const parseRolePermissions = (value: unknown): Record<string, ModuleAccess> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([module, permission]) => {
    if (!permission || typeof permission !== "object" || Array.isArray(permission)) return [];
    const access = permission as { view?: unknown; manage?: unknown };
    return [[module, { view: access.view === true, manage: access.manage === true }]];
  }));
};

const roleCanView = (
  role: WorkspaceMember["role"] | null,
  assignedRole: WorkspaceRole | undefined,
  targetView: WorkspaceView,
) => {
  if (targetView === "documents") return role !== null;
  if (role === "admin") return true;
  const access = assignedRole?.permissions[viewModule(targetView)] ?? defaultModuleAccess(role, viewModule(targetView));
  return access.view || access.manage;
};

const activity: Array<{ initials: string; tone: string; text: string; item: string; time: string }> = [];
const teamOverview: Array<{ name: string; active: number; value: number; tone: string }> = [];

const getPriorityClasses = (priority: TaskPriority) => {
  switch (priority) {
    case "Urgent":
      return "bg-rose-100 text-rose-700";
    case "High":
      return "bg-amber-100 text-amber-700";
    case "Medium":
      return "bg-sky-100 text-sky-700";
    case "Low":
      return "bg-emerald-100 text-emerald-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

const getStatusClasses = (status: TaskStatus) => {
  switch (status) {
    case "Completed":
      return "bg-emerald-100 text-emerald-700";
    case "Waiting":
      return "bg-violet-100 text-violet-700";
    case "In progress":
      return "bg-sky-100 text-sky-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

const getSubtaskStats = (items: TaskSubtask[]): { total: number; done: number } => {
  let total = 0;
  let done = 0;

  const walk = (nodes: TaskSubtask[]) => {
    for (const item of nodes) {
      total += 1;
      if (item.completed) done += 1;
      if (item.children.length) walk(item.children);
    }
  };

  walk(items);
  return { total, done };
};

const renderSubtaskTree = (items: TaskSubtask[], depth = 0): Array<TaskSubtask & { depth: number }> =>
  items.flatMap((item) => [
    { ...item, depth },
    ...renderSubtaskTree(item.children, depth + 1),
  ]);

function SortableTaskCard({ task, onOpen, onToggleComplete }: { task: Task; onOpen: (task: Task) => void; onToggleComplete: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      onClick={() => onOpen(task)}
      className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.03)] transition hover:border-emerald-200 hover:shadow-[0_12px_18px_rgba(16,185,129,0.08)]"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400"
        aria-label={`Reorder ${task.title}`}
      >
        <Wrench className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleComplete(task);
        }}
        aria-label={`${task.status === "Completed" ? "Reopen" : "Complete"} ${task.title}`}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[10px] font-bold transition ${task.status === "Completed" ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500 hover:border-emerald-300"}`}
      >
        {task.status === "Completed" ? "✓" : ""}
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-800">{task.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span>{task.project}</span>
          <span>•</span>
          <span>{task.department}</span>
        </div>
      </div>
      <div className="text-right">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${getPriorityClasses(task.priority)}`}>
          {task.priority}
        </span>
        <div className="mt-2 text-[11px] text-slate-500">{task.due}</div>
      </div>
    </motion.div>
  );
}

function MobileTaskTracker({
  tasks,
  onOpen,
  onStatusChange,
  onToggleComplete,
  canEdit,
}: {
  tasks: Task[];
  onOpen: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onToggleComplete: (task: Task) => void;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-3 md:hidden">
      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
          <CircleDashed className="mx-auto h-8 w-8 text-slate-400" />
          <h2 className="mt-3 text-sm font-bold text-slate-800">No tasks match these filters</h2>
          <p className="mt-1 text-xs text-slate-500">Try another status or priority.</p>
        </div>
      ) : tasks.map((task) => {
        const due = formatTaskDueDate(task.due);
        const initials = task.assignee.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
        return (
          <article key={task.id} className={`overflow-hidden rounded-2xl border bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] ${task.status === "Completed" ? "border-emerald-100" : "border-slate-200"}`}>
            <div className="flex items-start gap-3 px-3.5 pb-3 pt-3.5">
              <button
                type="button"
                onClick={() => onToggleComplete(task)}
                disabled={!canEdit}
                aria-label={`${task.status === "Completed" ? "Reopen" : "Complete"} ${task.title}`}
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition ${task.status === "Completed" ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-slate-200 bg-slate-50 text-transparent"} disabled:cursor-default`}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{task.project}</span>
                <span className={`mt-1 block text-sm font-bold leading-5 ${task.status === "Completed" ? "text-slate-500" : "text-slate-900"}`}>{task.title}</span>
                <span className="mt-1 block truncate text-xs text-slate-500">{task.department}</span>
              </button>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${getPriorityClasses(task.priority)}`}>{task.priority}</span>
            </div>

            <button type="button" onClick={() => onOpen(task)} aria-label={`Open ${task.title}`} className="block w-full px-3.5 pb-3 text-left">
              <span className="flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className={`block h-full rounded-full ${task.status === "Completed" ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }} />
                </span>
                <span className="w-9 text-right text-[10px] font-semibold text-slate-500">{task.progress}%</span>
              </span>
            </button>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-black text-emerald-800">{initials || "—"}</span>
                <span className="truncate text-xs font-medium text-slate-700">{task.assignee}</span>
              </span>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${getStatusClasses(task.status)}`}>{task.status}</span>
            </div>

            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
              <span className={`text-xs font-medium ${due.overdue && task.status !== "Completed" ? "text-rose-600" : "text-slate-500"}`}>
                {due.overdue && task.status !== "Completed" ? "Overdue · " : "Due · "}{due.label}
              </span>
              {canEdit && (
                <select
                  value={task.status}
                  onChange={(event) => onStatusChange(task, event.target.value as TaskStatus)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Change status for ${task.title}`}
                  className="max-w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
                >
                  {(["To do", "In progress", "Waiting", "Completed"] as TaskStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function KanbanCard({ task, onOpen, onStatusChange, canEdit }: { task: Task; onOpen: (task: Task) => void; onStatusChange: (task: Task, status: TaskStatus) => void; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !canEdit });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      className={`w-full cursor-grab rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition active:cursor-grabbing ${isDragging ? "z-10 opacity-60 shadow-xl ring-2 ring-emerald-200" : "hover:border-emerald-300"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm font-semibold text-slate-800">{task.title}</div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${getPriorityClasses(task.priority)}`}>{task.priority}</span>
      </div>
      <div className="mt-1 truncate text-[11px] text-slate-500">{task.project}</div>
      <div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${task.progress}%` }} /></div>
      <div className="mt-1 flex items-center justify-between text-[10px] font-semibold text-slate-500">
        <span>{task.progress}% complete</span>
        <span>{task.due}</span>
      </div>
      {canEdit && (
        <select
          value={task.status}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onStatusChange(task, event.target.value as TaskStatus)}
          className="mt-3 w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
          aria-label={`Change status for ${task.title}`}
        >
          {(["To do", "In progress", "Waiting", "Completed"] as TaskStatus[]).map((option) => <option key={option}>{option}</option>)}
        </select>
      )}
    </div>
  );
}

function KanbanColumn({ status, children, count }: { status: TaskStatus; children: React.ReactNode; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `kanban-${status}` });

  return (
    <div ref={setNodeRef} className={`min-w-[260px] rounded-2xl border p-3 transition ${isOver ? "border-emerald-400 bg-emerald-50/70" : "border-slate-200 bg-slate-50"}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">{status}</h3>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">{count}</span>
      </div>
      <div className="min-h-24 space-y-3">{children}</div>
    </div>
  );
}

function KanbanDragPreview({ task }: { task: Task }) {
  return (
    <motion.div
      initial={{ scale: 1, rotate: 0 }}
      animate={{ scale: 1.04, rotate: 2 }}
      className="w-[min(82vw,20rem)] cursor-grabbing rounded-xl border-2 border-emerald-400 bg-white p-3 text-left shadow-[0_20px_35px_rgba(15,23,42,0.24)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm font-semibold text-slate-800">{task.title}</div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${getPriorityClasses(task.priority)}`}>{task.priority}</span>
      </div>
      <div className="mt-1 truncate text-[11px] text-slate-500">{task.project}</div>
      <div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${task.progress}%` }} /></div>
    </motion.div>
  );
}

function EmptyDirectory({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center md:col-span-2 xl:col-span-3">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><CircleDashed className="h-6 w-6" /></div>
      <h2 className="mt-4 text-lg font-bold text-slate-900">No {label} yet</h2>
      <p className="mt-1 text-sm text-slate-500">Use the form above to add the first {label.slice(0, -1)} to this organization.</p>
    </div>
  );
}

const toTaskStatus = (status: unknown): TaskStatus =>
  status === "in_progress" ? "In progress" : status === "completed" ? "Completed" : status === "waiting" ? "Waiting" : "To do";

const toTaskPriority = (priority: unknown): TaskPriority =>
  priority === "urgent" ? "Urgent" : priority === "high" ? "High" : priority === "low" ? "Low" : "Medium";

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [view, setView] = useState<WorkspaceView>("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsedNavGroups, setCollapsedNavGroups] = useState<string[]>([]);
  const [syncMessage, setSyncMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<WorkspaceMember["role"] | null>(null);
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [clients, setClients] = useState<WorkspaceClient[]>([]);
  const [departments, setDepartments] = useState<WorkspaceDepartment[]>([]);
  const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [projectDetailBusy, setProjectDetailBusy] = useState(false);
  const [milestoneName, setMilestoneName] = useState("");
  const [milestoneDueDate, setMilestoneDueDate] = useState("");
  const [taskLayout, setTaskLayout] = useState<"list" | "kanban">("list");
  const [managementBusy, setManagementBusy] = useState(false);
  const [managementName, setManagementName] = useState("");
  const [managementMemberName, setManagementMemberName] = useState("");
  const [managementEmail, setManagementEmail] = useState("");
  const [managementPassword, setManagementPassword] = useState("");
  const [managementRole, setManagementRole] = useState<WorkspaceMember["role"]>("employee");
  const [managementCustomRoleId, setManagementCustomRoleId] = useState("");
  const [managementDepartmentId, setManagementDepartmentId] = useState("");
  const [managementDepartmentIds, setManagementDepartmentIds] = useState<string[]>([]);
  const [managementTeamId, setManagementTeamId] = useState("");
  const [managementAvailability, setManagementAvailability] = useState<WorkspaceMember["availabilityStatus"]>("available");
  const [managementCapacity, setManagementCapacity] = useState("40");
  const [managementMaxTasks, setManagementMaxTasks] = useState("10");
  const [projectStartDate, setProjectStartDate] = useState("");
  const [projectTargetDate, setProjectTargetDate] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationWebsite, setOrganizationWebsite] = useState("");
  const [organizationTimezone, setOrganizationTimezone] = useState("UTC");
  const [workspaceRoles, setWorkspaceRoles] = useState<WorkspaceRole[]>([]);
  const [currentCustomRoleId, setCurrentCustomRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [rolePermissions, setRolePermissions] = useState<Record<string, ModuleAccess>>({});
  const [editingWorkspaceRoleId, setEditingWorkspaceRoleId] = useState<string | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);
  const [needsOrganization, setNeedsOrganization] = useState(false);
  const [editingMember, setEditingMember] = useState<WorkspaceMember | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [auditEvents, setAuditEvents] = useState<TaskAuditEvent[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskBusy, setSubtaskBusy] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newSubtasks, setNewSubtasks] = useState<string[]>([]);
  const [subtaskParentId, setSubtaskParentId] = useState<string | null>(null);
  const [subtaskDescription, setSubtaskDescription] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [descriptionBusy, setDescriptionBusy] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleBusy, setTitleBusy] = useState(false);
  const [activeKanbanTask, setActiveKanbanTask] = useState<Task | null>(null);
  const [currentTime] = useState(() => Date.now());
  const localIdCounter = useRef(currentTime);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentRetry, setAttachmentRetry] = useState<File | null>(null);
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteColor, setNoteColor] = useState<WorkspaceNote["color"]>("yellow");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteSearch, setNoteSearch] = useState("");
  const [noteColorFilter, setNoteColorFilter] = useState<WorkspaceNote["color"] | "all">("all");
  const [noteBusy, setNoteBusy] = useState(false);
  const [sharingNote, setSharingNote] = useState<WorkspaceNote | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [darkMode, setDarkMode] = useState(() => typeof window !== "undefined" && localStorage.getItem("rigtech:dark-mode") === "true");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const nextLocalId = () => {
    localIdCounter.current += 1;
    return localIdCounter.current;
  };
  const currentCustomRole = workspaceRoles.find((role) => role.id === currentCustomRoleId);
  const moduleAccess = (module: string): ModuleAccess =>
    currentCustomRole?.permissions[module] ?? defaultModuleAccess(currentRole, module);
  const canViewModule = (module: string) => moduleAccess(module).view || moduleAccess(module).manage;
  const canManageModule = (module: string) => moduleAccess(module).manage;
  const canAssignCustomRoles = currentRole === "admin" || currentRole === "manager";
  const canView = (targetView: WorkspaceView) =>
    canViewModule(viewModule(targetView)) || (targetView === "documents" && currentRole !== null);
  const visibleNavItems = navItems.filter(({ id }) => canView(id));

  useEffect(() => {
    const restoreView = (event: PopStateEvent) => {
      const nextView = isWorkspaceView(event.state?.rigtechView) ? event.state.rigtechView : "dashboard";
      if (roleCanView(currentRole, workspaceRoles.find((role) => role.id === currentCustomRoleId), nextView)) setView(nextView);
      else setSyncMessage("Your workspace role does not allow access to that module.");
      setMobileNavOpen(false);
    };
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, [currentRole, currentCustomRoleId, workspaceRoles]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let mounted = true;
    let removeBackListener: (() => void) | undefined;
    void App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    }).then((listener) => {
      if (mounted) {
        removeBackListener = () => void listener.remove();
      } else {
        void listener.remove();
      }
    }).catch((error: unknown) => {
      console.error("Unable to register Android back-button handling.", error);
    });

    void Promise.all([
      StatusBar.setOverlaysWebView({ overlay: false }),
      StatusBar.setBackgroundColor({ color: "#f4f7f5" }),
      StatusBar.setStyle({ style: Style.Dark }),
    ]).catch((error: unknown) => {
      console.error("Unable to configure the Android status bar.", error);
    });

    return () => {
      mounted = false;
      removeBackListener?.();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setUser(data.session?.user ?? null);
        setAuthReady(true);
      }
    };

    void loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
      if (!session) {
        setTasks([]);
        setOrganizationId(null);
        setCurrentRole(null);
        setCurrentCustomRoleId(null);
        setWorkspaceRoles([]);
        setMembers([]);
        setClients([]);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const updateConnectivity = () => setOfflineMode(!navigator.onLine);
    updateConnectivity();
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    return () => {
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
    };
  }, []);

  useEffect(() => {
    const updateDate = () => setCurrentDate(new Date());
    updateDate();
    const interval = window.setInterval(updateDate, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user) localStorage.removeItem(`rigtech:tasks:${user.id}`);
  }, [user]);

  useEffect(() => {
    if (!user || !organizationId) return;
    const loadNotes = async () => {
      try {
        const { data, error } = await supabase
          .from("notes")
          .select("id, title, body, color, author_id, created_at, updated_at")
          .eq("organization_id", organizationId)
          .order("updated_at", { ascending: false });
        if (error) {
          setSyncMessage(`Unable to load sticky notes: ${error.message}`);
          return;
        }
        const authorIds = [...new Set((data ?? []).map((note) => note.author_id))];
        const { data: profiles, error: profilesError } = authorIds.length
          ? await supabase.from("profiles").select("id, full_name, name").in("id", authorIds)
          : { data: [], error: null };
        if (profilesError) {
          setSyncMessage(`Unable to load note authors: ${profilesError.message}`);
          return;
        }
        const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
        setNotes((data ?? []).map((note) => ({
          id: note.id,
          title: note.title ?? "",
          body: note.body ?? "",
          color: (note.color ?? "yellow") as WorkspaceNote["color"],
          authorId: note.author_id,
          authorName: profileById.get(note.author_id)?.full_name ?? profileById.get(note.author_id)?.name ?? "Workspace member",
          createdAt: note.created_at,
          updatedAt: note.updated_at,
        })));
      } catch (error) {
        console.error("Unable to reach Supabase while loading sticky notes.", error);
        setSyncMessage(error instanceof TypeError && error.message.toLowerCase().includes("fetch")
          ? "Unable to reach Supabase while loading sticky notes. Check your internet connection and retry."
          : `Unable to load sticky notes: ${error instanceof Error ? error.message : "Unexpected network error."}`);
      }
    };
    void loadNotes();
  }, [user, organizationId]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("rigtech:dark-mode", String(darkMode));
  }, [darkMode]);


  useEffect(() => {
    if (!user) return;

    const fetchTaskData = async () => {
      try {
        const { data: membership, error: membershipError } = await supabase
          .from("organization_members")
          .select("organization_id, role, custom_role_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (membershipError) throw new Error(`Membership lookup failed: ${membershipError.message}`);
        if (!membership) {
          setNeedsOrganization(true);
          setTasks([]);
          return;
        }

        setNeedsOrganization(false);
        setOrganizationId(membership.organization_id);
        setCurrentRole(membership.role);
        setCurrentCustomRoleId(membership.custom_role_id ?? null);
        const { data: roleRows, error: rolesError } = await supabase
          .from("organization_roles")
          .select("id, name, description, permissions")
          .eq("organization_id", membership.organization_id)
          .order("name");
        if (rolesError) throw new Error(`Workspace role lookup failed: ${rolesError.message}`);
        const loadedRoles = (roleRows ?? []).map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          permissions: parseRolePermissions(role.permissions),
        }));
        setWorkspaceRoles(loadedRoles);
        const assignedRole = loadedRoles.find((role) => role.id === membership.custom_role_id);
        const requestedView = new URLSearchParams(window.location.search).get("view");
        const nextView = isWorkspaceView(requestedView) && roleCanView(membership.role, assignedRole, requestedView)
          ? requestedView
          : navItems.find(({ id }) => roleCanView(membership.role, assignedRole, id))?.id ?? "dashboard";
        setView(nextView);
        const memberResult = await supabase
          .from("organization_members")
          .select("user_id, department_id, team_id, role, custom_role_id, availability_status, capacity_hours_per_week, max_active_tasks")
          .eq("organization_id", membership.organization_id)
          .neq("role", "client");
        const legacyMemberResult = memberResult.error && /(team_id|availability_status|capacity_hours_per_week|max_active_tasks)/.test(memberResult.error.message)
          ? await supabase
            .from("organization_members")
            .select("user_id, department_id, role")
            .eq("organization_id", membership.organization_id)
            .neq("role", "client")
          : null;
        const memberRows = (legacyMemberResult?.data ?? memberResult.data) as Array<{
          user_id: string;
          department_id: string | null;
          team_id?: string | null;
          role: WorkspaceMember["role"];
          custom_role_id?: string | null;
          availability_status?: WorkspaceMember["availabilityStatus"];
          capacity_hours_per_week?: number;
          max_active_tasks?: number;
        }> | null;
        const membersError = legacyMemberResult?.error ?? memberResult.error;
        const organizationResult = await supabase.from("organizations").select("name, website, timezone").eq("id", membership.organization_id).single();
        const legacyOrganizationResult = organizationResult.error && /(website|timezone)/.test(organizationResult.error.message)
          ? await supabase.from("organizations").select("name").eq("id", membership.organization_id).single()
          : null;
        const organizationRow = (legacyOrganizationResult?.data ?? organizationResult.data) as { name: string; website?: string | null; timezone?: string | null } | null;
        const organizationError = legacyOrganizationResult?.error ?? organizationResult.error;
        const [{ data, error }, { data: clientRows, error: clientsError }, { data: departmentRows, error: departmentsError }, { data: teamRows, error: teamsError }, { data: projectRows, error: projectsError }, { data: clientUserRows, error: clientUsersError }, { data: clientRoleRows, error: clientRolesError }, { data: memberDepartmentRows, error: memberDepartmentsError }] = await Promise.all([
          supabase.from("task_tree").select("*").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(50),
          supabase.from("clients").select("id, name, contact_email").eq("organization_id", membership.organization_id).order("name"),
          supabase.from("departments").select("id, name").eq("organization_id", membership.organization_id).order("name"),
          supabase.from("teams").select("id, name, department_id").eq("organization_id", membership.organization_id).order("name"),
          supabase.from("projects").select("id, name, description, client_id, status, start_date, target_date, created_at").eq("organization_id", membership.organization_id).order("name"),
          supabase.from("client_users").select("client_id, user_id"),
          supabase.from("organization_members").select("user_id, custom_role_id").eq("organization_id", membership.organization_id).eq("role", "client"),
          supabase.from("organization_member_departments").select("user_id, department_id").eq("organization_id", membership.organization_id),
        ]);
        if (error) throw new Error(`Task lookup failed: ${error.message}`);
        if (membersError) throw new Error(`Member lookup failed: ${membersError.message}`);
        if (clientsError) throw new Error(`Client lookup failed: ${clientsError.message}`);
        if (clientUsersError) throw new Error(`Client login lookup failed: ${clientUsersError.message}`);
        if (clientRolesError) throw new Error(`Client role lookup failed: ${clientRolesError.message}`);
        if (memberDepartmentsError) throw new Error(`Employee department lookup failed: ${memberDepartmentsError.message}`);
        if (departmentsError) throw new Error(`Department lookup failed: ${departmentsError.message}`);
        if (teamsError) throw new Error(`Team lookup failed: ${teamsError.message}`);
        if (organizationError) throw new Error(`Organization lookup failed: ${organizationError.message}`);
        if (projectsError) throw new Error(`Project lookup failed: ${projectsError.message}`);

        const memberIds = (memberRows ?? []).map((row) => row.user_id);
        const departmentIdsByMember = new Map<string, string[]>();
        (memberDepartmentRows ?? []).forEach((row) => {
          departmentIdsByMember.set(row.user_id, [...(departmentIdsByMember.get(row.user_id) ?? []), row.department_id]);
        });
        const profileById = new Map<string, { full_name?: string | null; name?: string | null; email?: string | null }>();
        if (memberIds.length) {
          const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, full_name, name, email")
            .in("id", memberIds);
          if (profilesError) throw new Error(`Profile lookup failed: ${profilesError.message}`);
          (profiles ?? []).forEach((profile) => profileById.set(profile.id, profile));
          setMembers((memberRows ?? []).map((row) => {
            const profile = profileById.get(row.user_id);
            return {
              id: row.user_id,
              name: profile?.full_name ?? profile?.name ?? "Workspace member",
              email: profile?.email ?? "",
              role: row.role,
              customRoleId: row.custom_role_id ?? null,
              departmentId: row.department_id,
              departmentIds: departmentIdsByMember.get(row.user_id) ?? (row.department_id ? [row.department_id] : []),
              teamId: row.team_id ?? null,
              availabilityStatus: row.availability_status ?? "available",
              capacityHoursPerWeek: Number(row.capacity_hours_per_week ?? 40),
              maxActiveTasks: Number(row.max_active_tasks ?? 10),
            };
          }));
        } else {
          setMembers([]);
        }
        const clientUserByClient = new Map((clientUserRows ?? []).map((row) => [row.client_id, row.user_id]));
        const clientRoleByUser = new Map((clientRoleRows ?? []).map((row) => [row.user_id, row.custom_role_id]));
        setClients((clientRows ?? []).map((client) => {
          const clientUserId = clientUserByClient.get(client.id) ?? null;
          return {
            id: client.id,
            name: client.name,
            contactEmail: client.contact_email,
            userId: clientUserId,
            customRoleId: clientUserId ? clientRoleByUser.get(clientUserId) ?? null : null,
          };
        }));
        setDepartments((departmentRows ?? []).map((department) => ({ id: department.id, name: department.name })));
        setTeams((teamRows ?? []).map((team) => ({ id: team.id, name: team.name, departmentId: team.department_id })));
        setProjects((projectRows ?? []).map((project) => ({ id: project.id, name: project.name, description: project.description, clientId: project.client_id, status: project.status, startDate: project.start_date, targetDate: project.target_date, createdAt: project.created_at })));
        setOrganizationName(organizationRow?.name ?? "");
        setOrganizationWebsite(organizationRow?.website ?? "");
        setOrganizationTimezone(organizationRow?.timezone ?? "UTC");
        setProfileName(String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? ""));

        const taskRows = data as Array<Record<string, unknown>>;
        const taskIds = taskRows.map((task) => String(task.id));
        const { data: taskMemberRows, error: taskMembersError } = taskIds.length
          ? await supabase.from("task_members").select("task_id, user_id").in("task_id", taskIds)
          : { data: [], error: null };
        if (taskMembersError) throw new Error(`Task assignee lookup failed: ${taskMembersError.message}`);
        const taskMemberIds = [...new Set((taskMemberRows ?? []).map((row) => row.user_id))].filter((id) => !profileById.has(id));
        if (taskMemberIds.length) {
          const { data: taskMemberProfiles, error: taskMemberProfilesError } = await supabase
            .from("profiles")
            .select("id, full_name, name, email")
            .in("id", taskMemberIds);
          if (taskMemberProfilesError) throw new Error(`Task assignee profile lookup failed: ${taskMemberProfilesError.message}`);
          (taskMemberProfiles ?? []).forEach((profile) => profileById.set(profile.id, profile));
        }
        const taskMembersByTask = new Map<string, string[]>();
        (taskMemberRows ?? []).forEach((row) => {
          taskMembersByTask.set(row.task_id, [...(taskMembersByTask.get(row.task_id) ?? []), row.user_id]);
        });
        const childrenByParent = new Map<string, Array<Record<string, unknown>>>();
        taskRows.forEach((task) => {
          const parentId = typeof task.parent_task_id === "string" ? task.parent_task_id : null;
          if (parentId) childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), task]);
        });
        const toSubtasks = (parentId: string): TaskSubtask[] =>
          (childrenByParent.get(parentId) ?? []).map((child) => ({
            id: Number(String(child.id).replaceAll("-", "").slice(0, 8)) || nextLocalId(),
            supabaseId: String(child.id),
            title: String(child.title ?? "Untitled subtask"),
            description: String(child.description ?? ""),
            completed: child.status === "completed",
            children: toSubtasks(String(child.id)),
          }));

        const nextTasks: Task[] = taskRows.filter((task) => !task.parent_task_id).map((task, index) => {
          const primaryAssigneeId = typeof task.assignee_id === "string" ? task.assignee_id : null;
          const assigneeIds = taskMembersByTask.get(String(task.id)) ?? (primaryAssigneeId ? [primaryAssigneeId] : []);
          const assigneeNames = assigneeIds
            .map((assigneeId) => profileById.get(assigneeId)?.full_name ?? profileById.get(assigneeId)?.name)
            .filter((name): name is string => Boolean(name));
          return {
          id: Number(index + 1),
          supabaseId: String(task.id),
          title: String(task.title ?? `Task ${index + 1}`),
          project: String(task.project_name ?? "Standalone task"),
          assignee: assigneeNames.length ? assigneeNames.join(", ") : String(task.assignee_name ?? "Unassigned"),
          assigneeIds,
          status: (task.status === "in_progress" ? "In progress" : task.status === "completed" ? "Completed" : task.status === "waiting" ? "Waiting" : "To do") as TaskStatus,
          priority: (task.priority === "urgent" ? "Urgent" : task.priority === "high" ? "High" : task.priority === "low" ? "Low" : "Medium") as TaskPriority,
          due: String(task.due_date ?? "This week"),
          description: String(task.description ?? "Task details pending."),
          client: String(task.client_name ?? "Internal"),
          department: String(task.department_name ?? "Operations"),
          progress: (() => {
            const stats = getSubtaskStats(toSubtasks(String(task.id)));
            return stats.total ? Math.round((stats.done / stats.total) * 100) : task.status === "completed" ? 100 : 0;
          })(),
          subtasks: toSubtasks(String(task.id)),
          };
        });

        setTasks(nextTasks);
        setSelectedTask(null);
      } catch (error) {
        console.error("Unable to load the authenticated workspace.", error);
        setSyncMessage(error instanceof Error ? error.message : "Unable to load your Supabase workspace.");
      }
    };

    void fetchTaskData();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadNotifications = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, message, type, created_at, is_read")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        setSyncMessage(`Unable to load notifications: ${error.message}`);
        return;
      }
      setNotifications((data ?? []).map((notification) => ({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        createdAt: notification.created_at,
        isRead: notification.is_read,
      })));
    };
    void loadNotifications();
  }, [user]);

  useEffect(() => {
    if (!selectedTask) return;

    const loadAuditEvents = async () => {
      const { data, error } = await supabase
        .from("task_audit_events")
        .select("id, action, changed_fields, created_at")
        .eq("task_id", selectedTask.supabaseId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) {
        setSyncMessage(`Unable to load task history: ${error.message}`);
        return;
      }
      setAuditEvents((data ?? []).map((event) => ({
        id: event.id,
        action: event.action,
        changedFields: event.changed_fields ?? [],
        createdAt: event.created_at,
      })));
    };

    const loadComments = async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, body, created_at, author_id")
        .eq("task_id", selectedTask.supabaseId)
        .order("created_at", { ascending: true });
      if (error) {
        setSyncMessage(`Unable to load comments: ${error.message}`);
        return;
      }
      const authorIds = (data ?? []).map((comment) => comment.author_id);
      const { data: profiles } = authorIds.length
        ? await supabase.from("profiles").select("id, full_name, name").in("id", authorIds)
        : { data: [] };
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      setComments((data ?? []).map((comment) => ({
        id: comment.id,
        authorName: profileById.get(comment.author_id)?.full_name ?? profileById.get(comment.author_id)?.name ?? "Workspace member",
        body: comment.body,
        createdAt: comment.created_at,
      })));
    };

    void loadAuditEvents();
    void loadComments();
  }, [selectedTask]);

  useEffect(() => {
    if (!selectedTask) return;

    const loadAttachments = async () => {
      const { data, error } = await supabase
        .from("attachments")
        .select("id, file_name, mime_type, storage_path, created_at")
        .eq("task_id", selectedTask.supabaseId)
        .order("created_at", { ascending: false });
      if (error) {
        setSyncMessage(`Unable to load attachments: ${error.message}`);
        return;
      }
      const attachmentRows = await Promise.all((data ?? []).map(async (attachment) => {
        const { data: signed } = await supabase.storage.from("task-attachments").createSignedUrl(attachment.storage_path, 3600);
        return { id: attachment.id, fileName: attachment.file_name, mimeType: attachment.mime_type, url: signed?.signedUrl ?? null, uploadedAt: attachment.created_at };
      }));
      setAttachments(attachmentRows);
    };

    void loadAttachments();
  }, [selectedTask]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [task.title, task.project, task.assignee, task.client, task.department]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tasks, searchTerm, statusFilter, priorityFilter]);

  const filteredNotes = useMemo(() => {
    const query = noteSearch.trim().toLowerCase();
    return notes.filter((note) =>
      (noteColorFilter === "all" || note.color === noteColorFilter) &&
      (!query || `${note.title} ${note.body} ${note.authorName}`.toLowerCase().includes(query)),
    );
  }, [notes, noteSearch, noteColorFilter]);

  const openProjectDetails = async (project: WorkspaceProject) => {
    setProjectDetailBusy(true);
    setSyncMessage("");
    const { data: taskRows, error: taskError } = await supabase
      .from("task_tree")
      .select("id, title, status, priority, due_date, description, parent_task_id, assignee_name")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true });
    if (taskError) {
      setSyncMessage(`Unable to load project tasks: ${taskError.message}`);
      setProjectDetailBusy(false);
      return;
    }

    const taskIds = (taskRows ?? []).map((task) => String(task.id));
    const { data: attachmentRows, error: attachmentError } = taskIds.length
      ? await supabase.from("attachments").select("id, file_name, mime_type, storage_path, task_id, created_at").in("task_id", taskIds).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (attachmentError) {
      setSyncMessage(`Unable to load project attachments: ${attachmentError.message}`);
      setProjectDetailBusy(false);
      return;
    }

    const { data: commentRows, error: commentError } = taskIds.length
      ? await supabase.from("comments").select("id, body, created_at, author_id, task_id").in("task_id", taskIds).order("created_at", { ascending: true })
      : { data: [], error: null };
    if (commentError) {
      setSyncMessage(`Unable to load project comments: ${commentError.message}`);
      setProjectDetailBusy(false);
      return;
    }
    const { data: milestoneRows, error: milestoneError } = await supabase
      .from("project_milestones")
      .select("id, name, description, due_date, completed_at")
      .eq("project_id", project.id)
      .order("sort_order", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });
    if (milestoneError) {
      setSyncMessage(`Unable to load project milestones: ${milestoneError.message}`);
      setProjectDetailBusy(false);
      return;
    }

    const authorIds = (commentRows ?? []).map((comment) => comment.author_id);
    const { data: profiles, error: profilesError } = authorIds.length
      ? await supabase.from("profiles").select("id, full_name, name").in("id", authorIds)
      : { data: [], error: null };
    if (profilesError) {
      setSyncMessage(`Unable to load project comment authors: ${profilesError.message}`);
      setProjectDetailBusy(false);
      return;
    }
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const signedAttachments = await Promise.all((attachmentRows ?? []).map(async (attachment) => {
      const { data: signed } = await supabase.storage.from("task-attachments").createSignedUrl(attachment.storage_path, 3600);
      return { id: attachment.id, fileName: attachment.file_name, mimeType: attachment.mime_type, url: signed?.signedUrl ?? null, uploadedAt: attachment.created_at };
    }));

    setSelectedProject({
      project,
      tasks: (taskRows ?? []).map((task) => ({
        id: String(task.id),
        title: String(task.title ?? "Untitled task"),
        status: toTaskStatus(task.status),
        priority: toTaskPriority(task.priority),
        assignee: String(task.assignee_name ?? "Unassigned"),
        due: String(task.due_date ?? "No due date"),
        description: String(task.description ?? ""),
        parentTaskId: typeof task.parent_task_id === "string" ? task.parent_task_id : null,
      })),
      milestones: (milestoneRows ?? []).map((milestone) => ({
        id: milestone.id,
        name: milestone.name,
        description: milestone.description ?? "",
        dueDate: milestone.due_date,
        completedAt: milestone.completed_at,
      })),
      attachments: signedAttachments,
      comments: (commentRows ?? []).map((comment) => ({
        id: comment.id,
        authorName: profileById.get(comment.author_id)?.full_name ?? profileById.get(comment.author_id)?.name ?? "Workspace member",
        body: comment.body,
        createdAt: comment.created_at,
      })),
    });
    setProjectDetailBusy(false);
  };

  const addProjectMilestone = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProject || !milestoneName.trim() || !organizationId) return;
    const { data, error } = await supabase.from("project_milestones").insert({
      organization_id: organizationId,
      project_id: selectedProject.project.id,
      name: milestoneName.trim(),
      due_date: milestoneDueDate || null,
      sort_order: selectedProject.milestones.length,
    }).select("id, name, description, due_date, completed_at").single();
    if (error || !data) {
      setSyncMessage(`Unable to add milestone: ${error?.message ?? "Unknown error"}`);
      return;
    }
    setSelectedProject((current) => current ? {
      ...current,
      milestones: [...current.milestones, { id: data.id, name: data.name, description: data.description ?? "", dueDate: data.due_date, completedAt: data.completed_at }],
    } : current);
    setMilestoneName("");
    setMilestoneDueDate("");
    setSyncMessage("Milestone added.");
  };

  const toggleProjectMilestone = async (milestone: ProjectMilestone) => {
    const completedAt = milestone.completedAt ? null : new Date().toISOString();
    const { error } = await supabase.from("project_milestones").update({ completed_at: completedAt }).eq("id", milestone.id);
    if (error) {
      setSyncMessage(`Unable to update milestone: ${error.message}`);
      return;
    }
    setSelectedProject((current) => current ? { ...current, milestones: current.milestones.map((item) => item.id === milestone.id ? { ...item, completedAt } : item) } : current);
  };

  const metrics = [
    { label: "Active tasks", value: String(tasks.filter((task) => task.status !== "Completed").length), subtext: "From your Supabase workspace", tone: "bg-slate-950 text-white" },
    { label: "Due today", value: String(tasks.filter((task) => task.due === "Today").length), subtext: "Current assigned work", tone: "bg-white text-slate-900" },
    { label: "Completed", value: String(tasks.filter((task) => task.status === "Completed").length), subtext: "Completed workspace tasks", tone: "bg-white text-slate-900" },
    { label: "Team capacity", value: tasks.length ? "—" : "0", subtext: tasks.length ? "Capacity tracking coming next" : "No task data yet", tone: "bg-white text-slate-900" },
  ];

  const executiveMetrics = {
    total: tasks.length,
    active: tasks.filter((task) => task.status !== "Completed").length,
    completed: tasks.filter((task) => task.status === "Completed").length,
    inProgress: tasks.filter((task) => task.status === "In progress").length,
    urgent: tasks.filter((task) => task.priority === "Urgent" && task.status !== "Completed").length,
    completionRate: tasks.length ? Math.round((tasks.filter((task) => task.status === "Completed").length / tasks.length) * 100) : 0,
  };
  const overdueTasks = tasks.filter((task) => {
    if (task.status === "Completed" || !task.due || task.due === "This week") return false;
    const dueDate = new Date(task.due);
    return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < currentTime;
  });
  const teamWorkload = members.map((member) => ({
    ...member,
    activeTasks: tasks.filter((task) => task.assigneeIds?.includes(member.id) && task.status !== "Completed").length,
  })).sort((a, b) => b.activeTasks - a.activeTasks);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }

    setTasks((current) => {
      const oldIndex = current.findIndex((task) => task.id === active.id);
      const newIndex = current.findIndex((task) => task.id === over.id);
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  const handleKanbanDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveKanbanTask(null);
    if (!over || currentRole === "client") return;

    const task = tasks.find((item) => item.id === active.id);
    if (!task) return;

    const overId = String(over.id);
    const targetStatus = overId.startsWith("kanban-")
      ? overId.replace("kanban-", "") as TaskStatus
      : tasks.find((item) => item.id === over.id)?.status;

    if (!targetStatus || targetStatus === task.status) return;
    void handleTaskStatusChange(task, targetStatus);
  };

  const handleKanbanDragStart = ({ active }: DragStartEvent) => {
    setActiveKanbanTask(tasks.find((task) => task.id === active.id) ?? null);
  };

  const handleTaskStatusChange = async (task: Task, status: TaskStatus) => {
    if (!canManageModule("tasks")) return;
    const databaseStatus = status === "In progress" ? "in_progress" : status === "Completed" ? "completed" : status === "Waiting" ? "waiting" : "to_do";
    if (!navigator.onLine) {
      const queueKey = `rigtech:task-updates:${user?.id ?? "anonymous"}`;
      const queued = JSON.parse(localStorage.getItem(queueKey) ?? "[]") as OfflineTaskUpdate[];
      localStorage.setItem(queueKey, JSON.stringify([...queued.filter((item) => item.taskId !== task.supabaseId), { taskId: task.supabaseId, status }]));
      setTasks((current) => current.map((item) => item.supabaseId === task.supabaseId ? { ...item, status, progress: status === "Completed" ? 100 : item.progress } : item));
      setSyncMessage("You are offline. Status saved and will sync when connection returns.");
      return;
    }
    const { error } = await supabase.from("tasks").update({
      status: databaseStatus,
      completed_by_user_id: status === "Completed" ? user?.id ?? null : null,
      completed_at: status === "Completed" ? new Date().toISOString() : null,
    }).eq("id", task.supabaseId);
    if (error) {
      setSyncMessage(`Unable to update task status: ${error.message}`);
      return;
    }
    setTasks((current) => current.map((item) => item.supabaseId === task.supabaseId ? {
      ...item,
      status,
      progress: status === "Completed" ? 100 : item.progress,
    } : item));
    setSelectedTask((current) => current?.supabaseId === task.supabaseId ? {
      ...current,
      status,
      progress: status === "Completed" ? 100 : current.progress,
    } : current);
    void createUserNotification(
      status === "Completed" ? "Task completed" : "Task status updated",
      `${task.title} is now ${status.toLowerCase()}.`,
      status === "Completed" ? "task_completed" : "status_changed",
      task.supabaseId,
    );
    setSyncMessage(status === "Completed" ? "Task marked complete." : `Task moved to ${status}.`);
  };

  const handleDeleteTask = async (task: Task) => {
    if (!canManageModule("tasks") || !organizationId) return;
    if (!window.confirm(`Delete "${task.title}" and all of its subtasks? This cannot be undone.`)) return;

    const { data: taskRows, error: taskLookupError } = await supabase
      .from("tasks")
      .select("id, parent_task_id")
      .eq("organization_id", organizationId);
    if (taskLookupError) {
      setSyncMessage(`Unable to prepare task deletion: ${taskLookupError.message}`);
      return;
    }

    const taskIds = new Set([task.supabaseId]);
    let addedTask = true;
    while (addedTask) {
      addedTask = false;
      for (const row of taskRows ?? []) {
        if (row.parent_task_id && taskIds.has(row.parent_task_id) && !taskIds.has(row.id)) {
          taskIds.add(row.id);
          addedTask = true;
        }
      }
    }

    const { data: attachmentRows, error: attachmentLookupError } = await supabase
      .from("attachments")
      .select("storage_path")
      .in("task_id", [...taskIds]);
    if (attachmentLookupError) {
      setSyncMessage(`Unable to prepare task deletion: ${attachmentLookupError.message}`);
      return;
    }
    const attachmentPaths = (attachmentRows ?? []).map((attachment) => attachment.storage_path);
    if (attachmentPaths.length) {
      const { error: attachmentDeleteError } = await supabase.storage
        .from("task-attachments")
        .remove(attachmentPaths);
      if (attachmentDeleteError) {
        setSyncMessage(`Unable to delete task attachments: ${attachmentDeleteError.message}`);
        return;
      }
    }

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", task.supabaseId)
      .eq("organization_id", organizationId);
    if (error) {
      setSyncMessage(`Unable to delete task: ${error.message}`);
      return;
    }
    setTasks((current) => current.filter((item) => item.supabaseId !== task.supabaseId));
    setSelectedTask((current) => current?.supabaseId === task.supabaseId ? null : current);
    setSyncMessage(`Task "${task.title}" and its subtasks were deleted.`);
  };

  useEffect(() => {
    if (!user) return;
    const syncOfflineUpdates = async () => {
      const queueKey = `rigtech:task-updates:${user.id}`;
      const queued = JSON.parse(localStorage.getItem(queueKey) ?? "[]") as OfflineTaskUpdate[];
      if (!queued.length) return;
      const remaining: OfflineTaskUpdate[] = [];
      for (const update of queued) {
        const databaseStatus = update.status === "In progress" ? "in_progress" : update.status === "Completed" ? "completed" : update.status === "Waiting" ? "waiting" : "to_do";
        const { error } = await supabase.from("tasks").update({ status: databaseStatus }).eq("id", update.taskId);
        if (error) remaining.push(update);
      }
      localStorage.setItem(queueKey, JSON.stringify(remaining));
      if (!remaining.length) setSyncMessage("Offline task changes synced.");
    };
    const handleOnline = () => void syncOfflineUpdates();
    window.addEventListener("online", handleOnline);
    if (navigator.onLine) void syncOfflineUpdates();
    return () => window.removeEventListener("online", handleOnline);
  }, [user]);

  const updateSubtaskTree = (items: TaskSubtask[], supabaseId: string, completed: boolean): TaskSubtask[] =>
    items.map((item) => item.supabaseId === supabaseId
      ? { ...item, completed }
      : { ...item, children: updateSubtaskTree(item.children, supabaseId, completed) });

  const addSubtaskToTree = (items: TaskSubtask[], parentId: string, child: TaskSubtask): TaskSubtask[] =>
    items.map((item) => item.supabaseId === parentId
      ? { ...item, children: [...item.children, child] }
      : { ...item, children: addSubtaskToTree(item.children, parentId, child) });

  const handleSubtaskStatusChange = async (subtask: TaskSubtask) => {
    if (!canManageModule("tasks")) return;
    const completed = !subtask.completed;
    const { error } = await supabase.from("tasks").update({
      status: completed ? "completed" : "to_do",
      completed_by_user_id: completed ? user?.id ?? null : null,
      completed_at: completed ? new Date().toISOString() : null,
    }).eq("id", subtask.supabaseId);
    if (error) {
      setSyncMessage(`Unable to update subtask: ${error.message}`);
      return;
    }

    setSelectedTask((current) => {
      if (!current) return current;
      const subtasks = updateSubtaskTree(current.subtasks, subtask.supabaseId, completed);
      const stats = getSubtaskStats(subtasks);
      return {
        ...current,
        subtasks,
        progress: stats.total ? Math.round((stats.done / stats.total) * 100) : current.progress,
      };
    });
    setTasks((current) => current.map((task) => {
      if (task.supabaseId !== selectedTask?.supabaseId) return task;
      const subtasks = updateSubtaskTree(task.subtasks, subtask.supabaseId, completed);
      const stats = getSubtaskStats(subtasks);
      return { ...task, subtasks, progress: stats.total ? Math.round((stats.done / stats.total) * 100) : task.progress };
    }));
    setSyncMessage(completed ? "Subtask completed." : "Subtask reopened.");
  };

  const handleTaskDescriptionSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTask || !taskDescription.trim() && selectedTask.description === taskDescription) return;
    setDescriptionBusy(true);
    const description = taskDescription.trim();
    const { error } = await supabase.from("tasks").update({ description }).eq("id", selectedTask.supabaseId);
    if (error) {
      setSyncMessage(`Unable to save description: ${error.message}`);
    } else {
      setSelectedTask((current) => current ? { ...current, description } : current);
      setTasks((current) => current.map((task) => task.supabaseId === selectedTask.supabaseId ? { ...task, description } : task));
      setSyncMessage("Task description saved.");
    }
    setDescriptionBusy(false);
  };

  const openTask = (task: Task) => {
    setSelectedTask(task);
    setTitleDraft(task.title);
    setTaskDescription(task.description);
    setSubtaskParentId(null);
    setSubtaskDescription("");
  };

  const createUserNotification = async (title: string, message: string, type: string, taskId?: string) => {
    if (!user) return;
    const { error } = await supabase.from("notifications").insert({
      user_id: user.id,
      title,
      message,
      type,
      task_id: taskId ?? null,
    });
    if (error) console.error("Unable to create workspace notification.", error);
  };

  const handleTaskTitleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageModule("tasks") || !selectedTask || !titleDraft.trim() || titleDraft.trim() === selectedTask.title) return;
    setTitleBusy(true);
    const title = titleDraft.trim();
    const { error } = await supabase.from("tasks").update({ title }).eq("id", selectedTask.supabaseId);
    if (error) {
      setSyncMessage(`Unable to save task title: ${error.message}`);
    } else {
      setSelectedTask((current) => current ? { ...current, title } : current);
      setTasks((current) => current.map((task) => task.supabaseId === selectedTask.supabaseId ? { ...task, title } : task));
      setSyncMessage("Task title saved.");
    }
    setTitleBusy(false);
  };

  const handleSubtaskDescriptionSave = async (subtask: TaskSubtask, description: string) => {
    if (!canManageModule("tasks")) return;
    const nextDescription = description.trim();
    const { error } = await supabase.from("tasks").update({ description: nextDescription }).eq("id", subtask.supabaseId);
    if (error) {
      setSyncMessage(`Unable to save subtask description: ${error.message}`);
      return;
    }
    const updateDescription = (items: TaskSubtask[]): TaskSubtask[] => items.map((item) => item.supabaseId === subtask.supabaseId
      ? { ...item, description: nextDescription }
      : { ...item, children: updateDescription(item.children) });
    setSelectedTask((current) => current ? { ...current, subtasks: updateDescription(current.subtasks) } : current);
    setTasks((current) => current.map((task) => task.supabaseId === selectedTask?.supabaseId ? { ...task, subtasks: updateDescription(task.subtasks) } : task));
    setSyncMessage("Subtask description saved.");
  };

  const handleCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageModule("tasks")) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title) return;

    const assigneeIds = [...new Set(form.getAll("assignee_ids").map(String).filter(Boolean))];
    const primaryAssigneeId = assigneeIds[0] ?? "";
    const nextTask: Task = {
      id: nextLocalId(),
      supabaseId: "",
      title,
      project: projects.find((project) => project.id === String(form.get("project_id") ?? ""))?.name ?? "Standalone task",
      assignee: assigneeIds.map((id) => members.find((member) => member.id === id)?.name).filter((name): name is string => Boolean(name)).join(", ") || "Unassigned",
      assigneeIds,
      status: "To do",
      priority: (String(form.get("priority") ?? "Medium") as TaskPriority),
      due: String(form.get("due") ?? "This week"),
      description: String(form.get("description") ?? "New task created from the dashboard."),
      client: clients.find((client) => client.id === String(form.get("client_id") ?? ""))?.name ?? "Internal",
      department: "Fabrication",
      progress: 0,
      subtasks: [],
    };

    if (!user || !organizationId) {
      setSyncMessage("Your workspace is not ready. Sign in and join an organization first.");
      return;
    }

    const { data: createdTask, error: createError } = await supabase
      .from("tasks")
      .insert({
        organization_id: organizationId,
        created_by: user.id,
        created_by_user_id: user.id,
        title: nextTask.title,
        description: nextTask.description,
        assignee_id: primaryAssigneeId || null,
        assigned_to_user_id: primaryAssigneeId || null,
        client_id: String(form.get("client_id") ?? "") || null,
        project_id: String(form.get("project_id") ?? "") || null,
        department: "fabrication",
        due_date: String(form.get("due") ?? "") || null,
        priority: nextTask.priority.toLowerCase(),
        status: "to_do",
        visibility: String(form.get("visibility") ?? "internal"),
      })
      .select("id")
      .single();

    if (createError || !createdTask) {
      console.error("Unable to create task in Supabase.", createError);
      setSyncMessage("Task was not saved to Supabase. Check the database permissions.");
      return;
    }

    let assignmentSaveWarning = "";
    if (assigneeIds.length) {
      const { error: assignmentError } = await supabase.from("task_members").insert(
        assigneeIds.map((userId) => ({ task_id: createdTask.id, user_id: userId })),
      );
      if (assignmentError) assignmentSaveWarning = `Task was created, but assignees could not be saved: ${assignmentError.message}`;
    }

    const createdSubtasks: TaskSubtask[] = [];
    let subtaskSaveWarning = "";
    for (const subtask of newSubtasks) {
      const { data: createdSubtask, error: subtaskError } = await supabase.from("tasks").insert({
        organization_id: organizationId,
        parent_task_id: createdTask.id,
        created_by: user.id,
        created_by_user_id: user.id,
        title: subtask,
        description: "",
        assignee_id: null,
        assigned_to_user_id: null,
        client_id: nextTask.client === "Internal" ? null : String(form.get("client_id") ?? "") || null,
        project_id: String(form.get("project_id") ?? "") || null,
        department: "fabrication",
        due_date: null,
        priority: "medium",
        status: "to_do",
        visibility: String(form.get("visibility") ?? "internal"),
      }).select("id").single();

      if (subtaskError || !createdSubtask) {
        subtaskSaveWarning = `Task was created, but a subtask could not be saved: ${subtaskError?.message ?? "Unknown error"}`;
        break;
      }
      createdSubtasks.push({
        id: nextLocalId(),
        supabaseId: createdSubtask.id,
        title: subtask,
        description: "",
        completed: false,
        children: [],
      });
    }

    setSyncMessage(assignmentSaveWarning || subtaskSaveWarning || "Task saved to Supabase.");
    const savedTask = { ...nextTask, supabaseId: createdTask.id, subtasks: createdSubtasks };
    setTasks((current) => [savedTask, ...current]);
    const notificationRows = assigneeIds
      .filter((assigneeId) => assigneeId !== user.id)
      .map((assigneeId) => ({
        user_id: assigneeId,
        title: "New task assigned",
        message: `${nextTask.title} was assigned to you.`,
        type: "task_assigned",
        task_id: createdTask.id,
      }));
    if (notificationRows.length) {
      const { error: notificationError } = await supabase.from("notifications").insert(notificationRows);
      if (notificationError) console.error("Unable to create assignment notifications.", notificationError);
    }
    openTask(savedTask);
    setShowCreate(false);
    handleViewChange("my-tasks");
    setNewSubtasks([]);
    setNewSubtaskTitle("");
    event.currentTarget.reset();
  };

  const handleCreateSubtask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageModule("tasks")) return;
    if (!selectedTask || !user || !organizationId || !subtaskTitle.trim()) return;
    setSubtaskBusy(true);
    const title = subtaskTitle.trim();
    const parentId = subtaskParentId ?? selectedTask.supabaseId;
    const { data, error } = await supabase.from("tasks").insert({
      organization_id: organizationId,
      parent_task_id: parentId,
      created_by: user.id,
      created_by_user_id: user.id,
      title,
      description: subtaskDescription.trim(),
      assignee_id: null,
      assigned_to_user_id: null,
      client_id: null,
      department: "fabrication",
      due_date: null,
      priority: "medium",
      status: "to_do",
      visibility: "internal",
    }).select("id").single();
    if (error || !data) {
      setSyncMessage(`Unable to create subtask: ${error?.message ?? "Unknown error"}`);
    } else {
      const child = { id: nextLocalId(), supabaseId: data.id, title, description: subtaskDescription.trim(), completed: false, children: [] };
      setSelectedTask((current) => current ? {
        ...current,
        subtasks: parentId === current.supabaseId ? [...current.subtasks, child] : addSubtaskToTree(current.subtasks, parentId, child),
      } : current);
      setTasks((current) => current.map((task) => task.supabaseId === selectedTask.supabaseId ? {
        ...task,
        subtasks: parentId === task.supabaseId ? [...task.subtasks, child] : addSubtaskToTree(task.subtasks, parentId, child),
      } : task));
      setSubtaskTitle("");
      setSubtaskDescription("");
      setSubtaskParentId(null);
      setSyncMessage("Subtask saved to Supabase.");
    }
    setSubtaskBusy(false);
  };

  const handleAddComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageModule("tasks")) return;
    if (!selectedTask || !user || !commentBody.trim()) return;
    const body = commentBody.trim();
    const { data, error } = await supabase.from("comments").insert({
      task_id: selectedTask.supabaseId,
      author_id: user.id,
      user_id: user.id,
      body,
      content: body,
    }).select("id, body, created_at, author_id").single();
    if (error || !data) {
      setSyncMessage(`Unable to save comment: ${error?.message ?? "Unknown error"}`);
      return;
    }
    setComments((current) => [...current, {
      id: data.id,
      authorName: String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "You"),
      body: data.body,
      createdAt: data.created_at,
    }]);
    setCommentBody("");
  };

  const uploadAttachment = async (file: File) => {
    if (!file || !selectedTask || !user || !organizationId) return;
    setAttachmentBusy(true);
    const storagePath = `${organizationId}/${selectedTask.supabaseId}/${user.id}/${crypto.randomUUID()}-${file.name}`;
    const upload = await supabase.storage.from("task-attachments").upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upload.error) {
      setAttachmentRetry(file);
      setSyncMessage(`Unable to upload attachment: ${upload.error.message}`);
      setAttachmentBusy(false);
      return;
    }
    const { data, error } = await supabase.from("attachments").insert({
      task_id: selectedTask.supabaseId,
      uploaded_by: user.id,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type || null,
    }).select("id, file_name, mime_type, storage_path, created_at").single();
    if (error || !data) {
      await supabase.storage.from("task-attachments").remove([storagePath]);
      setAttachmentRetry(file);
      setSyncMessage(`Unable to save attachment: ${error?.message ?? "Unknown error"}`);
    } else {
      const { data: signed } = await supabase.storage.from("task-attachments").createSignedUrl(data.storage_path, 3600);
      setAttachments((current) => [{ id: data.id, fileName: data.file_name, mimeType: data.mime_type, url: signed?.signedUrl ?? null, uploadedAt: data.created_at }, ...current]);
      setAttachmentRetry(null);
      setSyncMessage("Attachment uploaded to Supabase.");
    }
    setAttachmentBusy(false);
  };

  const handleUploadAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await uploadAttachment(file);
    event.target.value = "";
  };

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");

    const result = authMode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      : await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: { data: { full_name: authName } },
        });

    if (result.error) {
      setAuthError(result.error.message);
    } else if (authMode === "sign-up" && !result.data.session) {
      setAuthError("Account created. Check your email to confirm the account, then sign in.");
    }
    setAuthBusy(false);
  };

  const handleCreateOrganization = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationName.trim()) return;
    setAuthBusy(true);
    setAuthError("");
    const { error } = await supabase.rpc("create_organization_for_current_user", {
      organization_name: organizationName.trim(),
      organization_slug: organizationName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    });
    if (error) {
      setAuthError(error.message);
    } else {
      setNeedsOrganization(false);
      setOrganizationName("");
    }
    setAuthBusy(false);
  };

  const resetManagementForm = () => {
    setManagementName("");
    setManagementMemberName("");
    setManagementEmail("");
    setManagementPassword("");
    setManagementRole("employee");
    setManagementCustomRoleId("");
    setManagementDepartmentId("");
    setManagementDepartmentIds([]);
    setManagementTeamId("");
    setManagementAvailability("available");
    setManagementCapacity("40");
    setManagementMaxTasks("10");
  };

  const toggleManagementDepartment = (departmentId: string) => {
    setManagementDepartmentIds((current) => current.includes(departmentId)
      ? current.filter((id) => id !== departmentId)
      : [...current, departmentId]);
  };

  const handleEditMember = (member: WorkspaceMember) => {
    setEditingMember(member);
    setManagementMemberName(member.name);
    setManagementEmail(member.email);
    setManagementRole(member.role);
    setManagementCustomRoleId(member.customRoleId ?? "");
    setManagementDepartmentId(member.departmentId ?? "");
    setManagementDepartmentIds(member.departmentIds);
    setManagementTeamId(member.teamId ?? "");
    setManagementAvailability(member.availabilityStatus);
    setManagementCapacity(String(member.capacityHoursPerWeek));
    setManagementMaxTasks(String(member.maxActiveTasks));
    setManagementPassword("");
    setSyncMessage("");
  };

  const handleSaveMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingMember || !canManageModule("team")) return;
    setManagementBusy(true);
    setSyncMessage("");
    const result = await supabase.functions.invoke("create-team-member", {
      body: {
        mode: "update",
        member_id: editingMember.id,
        member_name: managementMemberName.trim(),
        member_email: managementEmail.trim(),
        member_password: managementPassword.trim() || undefined,
        role: managementRole,
        ...(canAssignCustomRoles ? { custom_role_id: managementCustomRoleId || null } : {}),
        department_ids: managementDepartmentIds,
        department_id: managementDepartmentIds[0] ?? null,
        team_id: managementTeamId || null,
        availability_status: managementAvailability,
        capacity_hours_per_week: Number(managementCapacity),
        max_active_tasks: Number(managementMaxTasks),
      },
    });
    let error: string | null = result.error?.message ?? null;
    if (result.error && "context" in result.error && result.error.context instanceof Response) {
      const responseBody = await result.error.context.text();
      try {
        error = (JSON.parse(responseBody) as { error?: string }).error ?? responseBody;
      } catch {
        if (responseBody) error = responseBody;
      }
    }
    if (error) {
      setSyncMessage(`Unable to update employee: ${error}`);
    } else if (result.data?.member) {
      const updatedMember = result.data.member as WorkspaceMember & { custom_role_id?: string | null; department_id: string | null; department_ids?: string[]; team_id?: string | null; availability_status?: WorkspaceMember["availabilityStatus"]; capacity_hours_per_week?: number; max_active_tasks?: number };
      setMembers((current) => current.map((member) => member.id === updatedMember.id ? {
        ...member,
        name: updatedMember.name,
        email: updatedMember.email,
        role: updatedMember.role,
        customRoleId: updatedMember.custom_role_id ?? null,
        departmentId: updatedMember.department_id,
        departmentIds: updatedMember.department_ids ?? managementDepartmentIds,
        teamId: updatedMember.team_id ?? member.teamId,
        availabilityStatus: updatedMember.availability_status ?? member.availabilityStatus,
        capacityHoursPerWeek: Number(updatedMember.capacity_hours_per_week ?? member.capacityHoursPerWeek),
        maxActiveTasks: Number(updatedMember.max_active_tasks ?? member.maxActiveTasks),
      } : member).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingMember(null);
      resetManagementForm();
      setSyncMessage("Employee updated in Rigtech Operations.");
    }
    setManagementBusy(false);
  };

  const handleManagementSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !managementName.trim() || !canManageModule(view)) return;

    setManagementBusy(true);
    setSyncMessage("");
    const name = managementName.trim();
    let error: { message: string } | null = null;

    if (view === "departments") {
      const result = await supabase.from("departments").insert({ organization_id: organizationId, name }).select("id, name").single();
      error = result.error;
      if (!error && result.data) setDepartments((current) => [...current, result.data].sort((a, b) => a.name.localeCompare(b.name)));
    } else if (view === "projects") {
      const result = await supabase.from("projects").insert({
        organization_id: organizationId,
        name,
        client_id: managementDepartmentId || null,
        start_date: projectStartDate || null,
        target_date: projectTargetDate || null,
      }).select("id, name, description, client_id, status, start_date, target_date").single();
      error = result.error;
      if (!error && result.data) {
        setProjects((current) => [...current, { id: result.data.id, name: result.data.name, description: result.data.description, clientId: result.data.client_id, status: result.data.status, startDate: result.data.start_date, targetDate: result.data.target_date }].sort((a, b) => a.name.localeCompare(b.name)));
        setProjectStartDate("");
        setProjectTargetDate("");
      }
    } else if (view === "team") {
      if (!managementEmail.trim() || managementPassword.length < 8) {
        setSyncMessage("A team member email and a password of at least 8 characters are required.");
        setManagementBusy(false);
        return;
      }

      const result = await supabase.functions.invoke("create-team-member", {
        body: {
          department_ids: managementDepartmentIds,
          department_id: managementDepartmentIds[0] ?? null,
          member_name: managementMemberName.trim() || name,
          member_email: managementEmail.trim(),
          member_password: managementPassword,
          role: managementRole,
          custom_role_id: managementCustomRoleId || null,
        },
      });
      if (result.error) {
        let detail = result.error.message;
        if ("context" in result.error && result.error.context instanceof Response) {
          const responseBody = await result.error.context.text();
          try {
            const parsedBody = JSON.parse(responseBody) as { error?: string };
            detail = parsedBody.error ?? responseBody;
          } catch {
            if (responseBody) detail = responseBody;
          }
        }
        error = { message: detail };
      }
      if (!error && result.data?.member) {
        setMembers((current) => [...current, {
          id: result.data.member.id,
          name: result.data.member.name,
          email: result.data.member.email,
          role: result.data.member.role,
          customRoleId: result.data.member.custom_role_id ?? null,
          departmentId: result.data.member.department_id,
          departmentIds: result.data.member.department_ids ?? managementDepartmentIds,
          teamId: result.data.member.team_id ?? null,
          availabilityStatus: result.data.member.availability_status ?? "available",
          capacityHoursPerWeek: Number(result.data.member.capacity_hours_per_week ?? 40),
          maxActiveTasks: Number(result.data.member.max_active_tasks ?? 10),
        }].sort((a, b) => a.name.localeCompare(b.name)));
      }
    } else if (view === "clients") {
      if (!managementEmail.trim() || managementPassword.length < 8) {
        setSyncMessage("A client email and a password of at least 8 characters are required.");
        setManagementBusy(false);
        return;
      }

      const result = await supabase.functions.invoke("create-team-member", {
        body: {
          mode: "client",
          client_name: name,
          member_name: name,
          member_email: managementEmail.trim(),
          member_password: managementPassword,
          custom_role_id: managementCustomRoleId || null,
        },
      });
      if (result.error) {
        let detail = result.error.message;
        if ("context" in result.error && result.error.context instanceof Response) {
          const responseBody = await result.error.context.text();
          try {
            const parsedBody = JSON.parse(responseBody) as { error?: string };
            detail = parsedBody.error ?? responseBody;
          } catch {
            if (responseBody) detail = responseBody;
          }
        }
        error = { message: detail };
      }
      if (!error && result.data?.client) {
        setClients((current) => [...current, {
          id: result.data.client.id,
          name: result.data.client.name,
          contactEmail: result.data.client.contact_email,
          userId: result.data.member?.id ?? null,
          customRoleId: result.data.member?.custom_role_id ?? null,
        }].sort((a, b) => a.name.localeCompare(b.name)));
      }
    }

    if (error) {
      setSyncMessage(`Unable to create ${view === "team" ? "employee login" : view === "clients" ? "client" : view === "projects" ? "project" : "department"}: ${error.message}`);
    } else {
      setSyncMessage(`${view === "team" ? "Employee login" : view === "clients" ? "Client" : view === "projects" ? "Project" : "Department"} added to Rigtech Operations.`);
      resetManagementForm();
    }
    setManagementBusy(false);
  };

  const handleDeleteDepartment = async (department: WorkspaceDepartment) => {
    if (!organizationId || !canManageModule("departments")) return;
    if (!window.confirm(`Delete the "${department.name}" department? Employees and teams assigned to it will become unassigned.`)) return;

    setManagementBusy(true);
    const { error } = await supabase
      .from("departments")
      .delete()
      .eq("id", department.id)
      .eq("organization_id", organizationId);
    if (error) {
      setSyncMessage(`Unable to delete department: ${error.message}`);
      setManagementBusy(false);
      return;
    }
    setDepartments((current) => current.filter((item) => item.id !== department.id));
    setMembers((current) => current.map((member) => {
      const departmentIds = member.departmentIds.filter((id) => id !== department.id);
      return {
        ...member,
        departmentIds,
        departmentId: member.departmentId === department.id ? departmentIds[0] ?? null : member.departmentId,
      };
    }));
    setTeams((current) => current.map((team) => team.departmentId === department.id ? { ...team, departmentId: null } : team));
    setManagementBusy(false);
    setSyncMessage(`Department "${department.name}" deleted.`);
  };

  const markNotificationRead = async (notification: WorkspaceNotification) => {
    if (notification.isRead) return;
    const { error } = await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", notification.id).eq("user_id", user?.id ?? "");
    if (error) {
      setSyncMessage(`Unable to update notification: ${error.message}`);
      return;
    }
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, isRead: true } : item));
  };

  const markAllNotificationsRead = async () => {
    if (!user) return;
    const unreadIds = notifications.filter((notification) => !notification.isRead).map((notification) => notification.id);
    if (!unreadIds.length) return;
    const { error } = await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).in("id", unreadIds).eq("user_id", user.id);
    if (error) {
      setSyncMessage(`Unable to update notifications: ${error.message}`);
      return;
    }
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
  };

  const handleProfileSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !profileName.trim()) return;
    setSettingsBusy(true);
    const name = profileName.trim();
    const { error } = await supabase.from("profiles").update({ name, full_name: name }).eq("id", user.id);
    if (error) {
      setSyncMessage(`Unable to save settings: ${error.message}`);
    } else {
      await supabase.auth.updateUser({ data: { full_name: name } });
      setSyncMessage("Settings saved.");
    }
    setSettingsBusy(false);
  };

  const handleOrganizationSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !organizationName.trim()) return;
    setSettingsBusy(true);
    const { error } = await supabase.from("organizations").update({
      name: organizationName.trim(),
      website: organizationWebsite.trim() || null,
      timezone: organizationTimezone,
    }).eq("id", organizationId);
    setSyncMessage(error ? `Unable to save organization settings: ${error.message}` : "Organization settings saved.");
    setSettingsBusy(false);
  };

  const resetRoleEditor = () => {
    setEditingWorkspaceRoleId(null);
    setRoleName("");
    setRoleDescription("");
    setRolePermissions({});
  };

  const handleSaveWorkspaceRole = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !roleName.trim() || !canManageModule("team")) return;
    setRoleBusy(true);
    setSyncMessage("");
    const rolePayload = {
      name: roleName.trim(),
      description: roleDescription.trim(),
      permissions: Object.fromEntries(roleModules.map(({ id }) => {
        const access = rolePermissions[id] ?? { view: false, manage: false };
        return [id, { view: access.view || access.manage, manage: access.manage }];
      })),
    };
    const result = editingWorkspaceRoleId
      ? await supabase.from("organization_roles").update(rolePayload).eq("id", editingWorkspaceRoleId)
        .select("id, name, description, permissions").single()
      : await supabase.from("organization_roles").insert({ ...rolePayload, organization_id: organizationId })
        .select("id, name, description, permissions").single();
    if (result.error || !result.data) {
      setSyncMessage(`Unable to save role: ${result.error?.message ?? "No role details were returned."}`);
    } else {
      const savedRole: WorkspaceRole = {
        id: result.data.id,
        name: result.data.name,
        description: result.data.description,
        permissions: rolePayload.permissions,
      };
      setWorkspaceRoles((current) => [
        ...current.filter((role) => role.id !== savedRole.id),
        savedRole,
      ].sort((a, b) => a.name.localeCompare(b.name)));
      resetRoleEditor();
      setSyncMessage("Workspace role saved.");
    }
    setRoleBusy(false);
  };

  const handleEditWorkspaceRole = (role: WorkspaceRole) => {
    setEditingWorkspaceRoleId(role.id);
    setRoleName(role.name);
    setRoleDescription(role.description);
    setRolePermissions(role.permissions);
  };

  const handleDeleteWorkspaceRole = async (role: WorkspaceRole) => {
    if (!canManageModule("team")) return;
    const { error } = await supabase.from("organization_roles").delete().eq("id", role.id);
    if (error) {
      setSyncMessage(`Unable to delete role: ${error.message}`);
      return;
    }
    setWorkspaceRoles((current) => current.filter((item) => item.id !== role.id));
    setMembers((current) => current.map((member) => member.customRoleId === role.id ? { ...member, customRoleId: null } : member));
    setSyncMessage(`Role "${role.name}" deleted. Current assignments were returned to their built-in roles.`);
  };

  const handleAssignCustomRole = async (memberId: string, customRoleId: string) => {
    if (!canManageModule("team")) return;
    const { error } = await supabase.functions.invoke("create-team-member", {
      body: { mode: "assign-role", member_id: memberId, custom_role_id: customRoleId || null },
    });
    if (error) {
      setSyncMessage(`Unable to assign workspace role: ${error.message}`);
      return;
    }
    setMembers((current) => current.map((member) => member.id === memberId
      ? { ...member, customRoleId: customRoleId || null }
      : member));
    setClients((current) => current.map((client) => client.userId === memberId
      ? { ...client, customRoleId: customRoleId || null }
      : client));
    setSyncMessage("Workspace role assigned.");
  };

  const handleCreateNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !organizationId || !noteBody.trim()) return;
    setNoteBusy(true);
    try {
      const result = editingNoteId
        ? await supabase.from("notes").update({
          title: noteTitle.trim(),
          body: noteBody.trim(),
          color: noteColor,
        }).eq("id", editingNoteId).select("id, title, body, color, author_id, created_at, updated_at").single()
        : await supabase.from("notes").insert({
          organization_id: organizationId,
          author_id: user.id,
          title: noteTitle.trim(),
          body: noteBody.trim(),
          color: noteColor,
        }).select("id, title, body, color, author_id, created_at, updated_at").single();
      const { data, error } = result;
      if (error || !data) {
        setSyncMessage(`Unable to save sticky note: ${error?.message ?? "No note details were returned."}`);
        return;
      }
      const savedNote: WorkspaceNote = {
        id: data.id,
        title: data.title,
        body: data.body,
        color: data.color as WorkspaceNote["color"],
        authorId: data.author_id,
        authorName: notes.find((note) => note.id === data.id)?.authorName ?? userName,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
      setNotes((current) => editingNoteId
        ? current.map((note) => note.id === savedNote.id ? savedNote : note).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : [savedNote, ...current]);
      setNoteTitle("");
      setNoteBody("");
      setNoteColor("yellow");
      setEditingNoteId(null);
      setSyncMessage(editingNoteId ? "Sticky note updated." : "Sticky note saved.");
    } catch (error) {
      console.error("Unable to reach Supabase while saving a sticky note.", error);
      setSyncMessage(error instanceof TypeError && error.message.toLowerCase().includes("fetch")
        ? "Unable to reach Supabase. Check your internet connection and try again; your note is still in the editor."
        : `Unable to save sticky note: ${error instanceof Error ? error.message : "Unexpected network error."}`);
    } finally {
      setNoteBusy(false);
    }
  };

  const startEditingNote = (note: WorkspaceNote) => {
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteBody(note.body);
    setNoteColor(note.color);
    setSyncMessage("");
    document.getElementById("sticky-note-composer")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleNoteColorChange = async (note: WorkspaceNote, color: WorkspaceNote["color"]) => {
    if (!canManageModule("notes") || note.authorId !== user?.id || note.color === color) return;
    const { data, error } = await supabase.from("notes").update({ color })
      .eq("id", note.id)
      .select("id, title, body, color, author_id, created_at, updated_at")
      .single();
    if (error || !data) {
      setSyncMessage(`Unable to update sticky note color: ${error?.message ?? "Unknown error"}`);
      return;
    }
    setNotes((current) => current.map((item) => item.id === note.id ? {
      ...item,
      color: data.color as WorkspaceNote["color"],
      updatedAt: data.updated_at,
    } : item).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  };

  const handleDeleteNote = async (note: WorkspaceNote) => {
    if (!canManageModule("notes") || note.authorId !== user?.id) return;
    const { error } = await supabase.from("notes").delete().eq("id", note.id);
    if (error) {
      setSyncMessage(`Unable to delete sticky note: ${error.message}`);
      return;
    }
    setNotes((current) => current.filter((item) => item.id !== note.id));
    if (sharingNote?.id === note.id) setSharingNote(null);
    setSyncMessage("Sticky note deleted.");
  };

  const handleShareInternally = async (note: WorkspaceNote, recipient: WorkspaceMember) => {
    if (!user || !canManageModule("notes") || note.authorId !== user.id) return;
    setShareBusy(true);
    const { error } = await supabase.from("note_shares").upsert({
      note_id: note.id,
      user_id: recipient.id,
      shared_by: user.id,
    });
    if (error) {
      setSyncMessage(`Unable to share sticky note: ${error.message}`);
    } else {
      setSyncMessage(`Note shared with ${recipient.name}.`);
      setSharingNote(null);
    }
    setShareBusy(false);
  };

  const handleShareExternally = async (note: WorkspaceNote) => {
    const shareText = `${note.title || "Sticky note"}\n\n${note.body}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: note.title || "Sticky note", text: shareText });
        setSyncMessage("Sticky note shared.");
      } else {
        await navigator.clipboard.writeText(shareText);
        setSyncMessage("Sticky note copied to your clipboard.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSyncMessage("Unable to share this note from your device.");
    }
  };

  const pageTitle =
    view === "dashboard"
      ? "Dashboard"
      : view === "executive"
        ? "Executive overview"
      : view === "my-tasks"
        ? "My tasks"
        : view === "all-tasks"
          ? "All tasks"
        : view === "projects"
          ? "Projects"
        : view === "stock"
          ? "Stock management"
        : view === "documents"
          ? "Documents"
          : view === "team"
            ? "Employees"
            : view === "clients"
              ? "Clients"
              : view === "departments"
                ? "Departments"
                : view === "notifications"
                  ? "Notifications"
                  : view === "notes"
                    ? "Sticky notes"
                  : "Settings";
  const handleViewChange = (nextView: WorkspaceView) => {
    if (!canView(nextView)) {
      setSyncMessage("Your workspace role does not allow access to that module.");
      setMobileNavOpen(false);
      return;
    }
    if (nextView !== view) {
      window.history.pushState({ rigtechView: nextView }, "");
    }
    setView(nextView);
    setMobileNavOpen(false);
  };
  const toggleNavGroup = (groupId: string) => {
    setCollapsedNavGroups((current) => current.includes(groupId)
      ? current.filter((id) => id !== groupId)
      : [...current, groupId]);
  };
  const renderGroupedNavigation = (mobile = false) => navGroups.map((group) => {
    const items = navItems.filter(({ id }) => (group.views as readonly string[]).includes(id) && canView(id));
    if (!items.length) return null;
    const isCollapsed = collapsedNavGroups.includes(group.id);
    return (
      <div key={group.id} className={mobile ? "mb-2" : "mb-3"}>
        {!sidebarCollapsed || mobile ? (
          <button
            type="button"
            onClick={() => toggleNavGroup(group.id)}
            aria-expanded={!isCollapsed}
            className="mb-1 flex min-h-9 w-full items-center justify-between rounded-lg px-3 text-[10px] font-bold tracking-[0.16em] text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
          >
            {group.label}
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
          </button>
        ) : null}
        {(!isCollapsed || sidebarCollapsed && !mobile) && (
          <div className="space-y-1">
            {items.map(({ label, id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleViewChange(id)}
                title={sidebarCollapsed && !mobile ? label : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                  view === id ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "text-slate-600 hover:bg-slate-100"
                } ${sidebarCollapsed && !mobile ? "justify-center px-2" : ""}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {(!sidebarCollapsed || mobile) && <span className="flex-1">{label}</span>}
                {id === "notifications" && notifications.filter((notification) => !notification.isRead).length > 0 && (!sidebarCollapsed || mobile) && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{notifications.filter((notification) => !notification.isRead).length}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  });
  if (!authReady) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f7f5] text-sm text-slate-500">Loading your secure workspace…</div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7f5] px-4 py-8">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <div className="mb-8 flex flex-col items-center gap-2">
            <Image src="/logo.png" alt="Rigtech Engineering" width={900} height={900} priority className="h-36 w-36 object-contain" />
            <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">secure operations workspace</div>
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-700">{authMode === "sign-in" ? "Welcome back" : "Create your account"}</div>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900">{authMode === "sign-in" ? "Sign in to Rigtech" : "Start your workspace"}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Tasks, teams and client work in one secure place.</p>
          <form onSubmit={handleAuthSubmit} className="mt-7 space-y-4">
            {authMode === "sign-up" && (
              <input value={authName} onChange={(event) => setAuthName(event.target.value)} required placeholder="Full name" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none" />
            )}
            <input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required type="email" placeholder="Work email" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none" />
            <input value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required minLength={8} type="password" placeholder="Password (8+ characters)" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none" />
            {authError && <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{authError}</div>}
            <button disabled={authBusy} type="submit" className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
              {authBusy ? "Please wait…" : authMode === "sign-in" ? "Sign in" : "Create account"}
            </button>
          </form>
          <button type="button" onClick={() => { setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in"); setAuthError(""); }} className="mt-5 w-full text-center text-sm font-semibold text-emerald-700">
            {authMode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    );
  }

  if (needsOrganization) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7f5] px-4 py-8">
        <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><Sparkles className="h-6 w-6" /></div>
          <div className="mt-6 text-[10px] uppercase tracking-[0.2em] text-emerald-700">Workspace setup</div>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900">Create your organization</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Your account is secure, but it is not attached to an organization yet.</p>
          <form onSubmit={handleCreateOrganization} className="mt-7 space-y-4">
            <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} required placeholder="Company name" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none" />
            {authError && <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{authError}</div>}
            <div className="flex gap-3">
              <button type="button" onClick={() => void supabase.auth.signOut()} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Sign out</button>
              <button disabled={authBusy} type="submit" className="flex-1 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{authBusy ? "Creating…" : "Create workspace"}</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const userName = String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Workspace member");

  return (
    <div className="min-h-screen overflow-x-clip bg-[#f4f7f5] pb-24 text-slate-900 lg:pb-0">
      <div className="flex w-full">
        <aside className={`sticky top-0 hidden h-dvh shrink-0 self-start flex-col border-r border-slate-200 bg-white px-3 py-4 transition-[width] duration-200 lg:flex ${sidebarCollapsed ? "w-20" : "w-72 px-4"}`}>
          <div className={`mb-4 flex items-center ${sidebarCollapsed ? "flex-col gap-3" : "flex-col gap-1"}`}>
            <Image src="/logo.png" alt="Rigtech Engineering" width={900} height={900} className={`${sidebarCollapsed ? "h-12 w-12" : "h-32 w-32"} object-contain`} />
            {!sidebarCollapsed && <div className="text-center text-[9px] uppercase tracking-[0.18em] text-slate-500">industrial operations</div>}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100"
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          {canManageModule("tasks") && <button
            type="button"
            onClick={() => setShowCreate(true)}
            title={sidebarCollapsed ? "Create task" : undefined}
            className={`mb-5 flex items-center rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(5,150,105,0.25)] transition hover:bg-emerald-800 ${sidebarCollapsed ? "justify-center px-2" : "justify-between"}`}
          >
            <span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" />{!sidebarCollapsed && "Create task"}</span>
            {!sidebarCollapsed && <span className="rounded-lg border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-bold">C</span>}
          </button>}

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">{renderGroupedNavigation()}</nav>

          <div className={`mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 ${sidebarCollapsed ? "justify-center" : ""}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-800">{userName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div>
            {!sidebarCollapsed && <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-800">{userName}</div>
              <div className="text-[11px] text-slate-500">{user.email}</div>
            </div>}
            <button
              type="button"
              onClick={() => void supabase.auth.signOut()}
              aria-label="Sign out"
              title="Sign out"
              className={`${sidebarCollapsed ? "absolute bottom-4 right-4" : ""} flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700`}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
            <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 lg:hidden">
                  <Menu className="h-4 w-4" />
                </button>
                <div className="max-w-[8rem] truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:max-w-none sm:tracking-[0.2em]">RIGTECH ENGINEERING</div>
                <ChevronRight className="hidden h-4 w-4 text-slate-400 sm:block" />
                <div className="hidden max-w-[7rem] truncate text-sm font-semibold text-slate-700 sm:block">{pageTitle}</div>
              </div>
              <button
                type="button"
                onClick={() => void supabase.auth.signOut()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 lg:hidden"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>

              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <label className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 sm:flex">
                  <Search className="h-4 w-4" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-52 border-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    placeholder="Search tasks, people..."
                  />
                </label>
                {canViewModule("notes") && <button
                  type="button"
                  onClick={() => handleViewChange("notes")}
                  aria-label="Open sticky notes"
                  title="Sticky notes"
                  className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${view === "notes" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"}`}
                >
                  <StickyNote className="h-4 w-4" />
                </button>}
                {canViewModule("notifications") && <button type="button" onClick={() => handleViewChange("notifications")} aria-label="Open notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700">
                  <Bell className="h-4 w-4" />
                  {notifications.some((notification) => !notification.isRead) && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}
                </button>}
              </div>
            </div>
          </header>

          <div className="px-4 py-5 sm:px-6 lg:px-10 lg:pb-28">
            {syncMessage && (
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <span>{syncMessage}</span>
                <button type="button" onClick={() => setSyncMessage("")} className="rounded-full p-1 hover:bg-emerald-100" aria-label="Dismiss sync message">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {offlineMode && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                Offline mode: only tasks loaded during this session remain available. Changes will sync when you reconnect.
              </div>
            )}
            {view === "dashboard" && (
              <>
                <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{currentDate ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(currentDate) : ""}</div>
                    <h1 className="mt-2 text-[2rem] font-black leading-tight tracking-[-0.06em] text-slate-900 sm:text-4xl">{currentDate ? `${currentDate.getHours() < 12 ? "Good morning" : currentDate.getHours() < 18 ? "Good afternoon" : "Good evening"}, ${userName}` : `Welcome, ${userName}`}</h1>
                    <p className="mt-2 text-sm text-slate-500">A quick view of the current workload across fabrication, field and client work.</p>
                  </div>
                  <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                    <CalendarRange className="h-4 w-4" />{currentDate ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(currentDate) : ""}
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {metrics.map((metric, index) => (
                    <div key={metric.label} className={`rounded-2xl border border-slate-200 p-4 ${metric.tone} ${index === 0 ? "bg-slate-950 text-white" : "bg-white"}`}>
                      <div className="flex items-center justify-between text-xs font-medium opacity-80">
                        <span>{metric.label}</span>
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">◌</span>
                      </div>
                      <div className="mt-5 text-3xl font-black tracking-[-0.05em]">{metric.value}</div>
                      <div className="mt-4 text-[11px] opacity-80">{metric.subtext}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.8fr]">
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">My tasks</h2>
                        <p className="text-sm text-slate-500">Your highest priority work</p>
                      </div>
                      <button type="button" onClick={() => handleViewChange("my-tasks")} className="text-sm font-semibold text-emerald-700">View all</button>
                    </div>

                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={filteredTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-3">
                          {filteredTasks.slice(0, 4).map((task) => (
                            <SortableTaskCard
                              key={task.id}
                              task={task}
                              onOpen={openTask}
                              onToggleComplete={(item) => void handleTaskStatusChange(item, item.status === "Completed" ? "To do" : "Completed")}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">Recent activity</h2>
                        <p className="text-sm text-slate-500">Across your workspace</p>
                      </div>
                      <button type="button" className="text-slate-400"><MessageSquareText className="h-4 w-4" /></button>
                    </div>

                    <div className="space-y-4">
                      {activity.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          Activity will appear here as your team creates and updates work.
                        </div>
                      ) : activity.map((item) => (
                        <div key={item.item} className="flex gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-black ${item.tone}`}>{item.initials}</div>
                          <div className="min-w-0 flex-1 text-sm text-slate-600">
                            <span className="font-medium text-slate-800">{item.text}</span> <span className="font-semibold text-slate-700">{item.item}</span>
                            <div className="mt-1 text-[11px] text-slate-400">{item.time}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Team overview</h2>
                      <p className="text-sm text-slate-500">Active work by department</p>
                    </div>
                    <button type="button" className="text-sm font-semibold text-emerald-700">Manage teams</button>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                    {teamOverview.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-4">
                        Add departments and teams to start tracking capacity.
                      </div>
                    ) : teamOverview.map((team) => (
                      <div key={team.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                          <span>{team.name}</span>
                          <span className="text-[11px] text-slate-500">{team.active} active</span>
                        </div>
                        <div className="mt-4 h-2.5 rounded-full bg-slate-200">
                          <div className={`h-2.5 rounded-full ${team.tone}`} style={{ width: `${team.value}%` }} />
                        </div>
                        <div className="mt-3 text-[11px] text-slate-500">{team.value}% on track</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {view === "stock" && organizationId && (
              <StockManagement organizationId={organizationId} role={currentRole} canManageOverride={canManageModule("stock")} />
            )}
            {view === "documents" && organizationId && (
              <DocumentManagement
                organizationId={organizationId}
                role={currentRole}
                canManageOverride={canManageModule("documents")}
                canDeleteAnyOverride={canManageModule("documents") && currentCustomRoleId !== null}
                projects={projects}
              />
            )}

            {view === "executive" && canViewModule("executive") && (
              <section>
                <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-700">Leadership workspace</div>
                    <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900 sm:text-4xl">Executive overview</h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-500">A decision-ready view of delivery health, workload, risk and workspace momentum.</p>
                  </div>
                  <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><TrendingUp className="h-4 w-4" /> Live workspace metrics</div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "Completion rate", value: `${executiveMetrics.completionRate}%`, note: `${executiveMetrics.completed} completed of ${executiveMetrics.total}`, tone: "bg-slate-950 text-white" },
                    { label: "Active workload", value: String(executiveMetrics.active), note: `${executiveMetrics.inProgress} currently in progress`, tone: "bg-white text-slate-900" },
                    { label: "At-risk tasks", value: String(overdueTasks.length + executiveMetrics.urgent), note: `${overdueTasks.length} overdue · ${executiveMetrics.urgent} urgent`, tone: "bg-amber-50 text-amber-950" },
                    { label: "Team members", value: String(members.length), note: `${projects.length} active projects`, tone: "bg-white text-slate-900" },
                  ].map((metric) => (
                    <div key={metric.label} className={`rounded-2xl border border-slate-200 p-5 ${metric.tone}`}>
                      <div className="text-xs font-semibold opacity-75">{metric.label}</div>
                      <div className="mt-4 text-4xl font-black tracking-[-0.06em]">{metric.value}</div>
                      <div className="mt-3 text-xs opacity-70">{metric.note}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="mb-5 flex items-center justify-between">
                      <div><h2 className="text-lg font-bold text-slate-900">Delivery health</h2><p className="text-sm text-slate-500">Current task distribution across the organization.</p></div>
                      <Gauge className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="space-y-4">
                      {(["Completed", "In progress", "Waiting", "To do"] as TaskStatus[]).map((status) => {
                        const count = tasks.filter((task) => task.status === status).length;
                        const percentage = executiveMetrics.total ? Math.round((count / executiveMetrics.total) * 100) : 0;
                        return <div key={status}><div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold text-slate-700">{status}</span><span className="text-slate-500">{count} · {percentage}%</span></div><div className="h-3 rounded-full bg-slate-100"><div className={`h-3 rounded-full ${status === "Completed" ? "bg-emerald-500" : status === "In progress" ? "bg-sky-500" : status === "Waiting" ? "bg-violet-500" : "bg-slate-400"}`} style={{ width: `${percentage}%` }} /></div></div>;
                      })}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900">Risk watch</h2><p className="text-sm text-slate-500">Work that needs leadership attention.</p></div><TriangleAlert className="h-5 w-5 text-amber-600" /></div>
                    <div className="space-y-3">
                      {overdueTasks.slice(0, 5).map((task) => <button key={task.supabaseId} type="button" onClick={() => openTask(task)} className="flex w-full items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 p-3 text-left"><div className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-800">{task.title}</div><div className="mt-1 text-xs text-rose-700">Overdue · {task.assignee}</div></div></button>)}
                      {overdueTasks.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No overdue tasks. Your delivery queue is clear.</div>}
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="mb-5"><h2 className="text-lg font-bold text-slate-900">Team workload</h2><p className="text-sm text-slate-500">Active assignments by team member.</p></div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {teamWorkload.slice(0, 8).map((member) => <div key={member.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-800">{member.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{member.name}</div><div className="text-xs text-slate-500">{member.activeTasks} active tasks</div></div></div><div className="mt-4 h-2 rounded-full bg-slate-200"><div className={`h-2 rounded-full ${member.activeTasks >= 5 ? "bg-rose-500" : member.activeTasks >= 3 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, member.activeTasks * 20)}%` }} /></div></div>)}
                    {teamWorkload.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 sm:col-span-2 xl:col-span-4">Team workload will appear after members are added.</div>}
                  </div>
                </div>
              </section>
            )}

            {(view === "my-tasks" || view === "all-tasks") && (
              <div>
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Work queue</div>
                    <h1 className="mt-2 text-2xl font-black tracking-[-0.06em] text-slate-900 sm:text-3xl">{view === "my-tasks" ? "My tasks" : "All tasks"}</h1>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="hidden rounded-xl border border-slate-200 bg-white p-1 sm:inline-flex">
                      <button type="button" onClick={() => setTaskLayout("list")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${taskLayout === "list" ? "bg-slate-950 text-white" : "text-slate-600"}`}>List</button>
                      <button type="button" onClick={() => setTaskLayout("kanban")} className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold ${taskLayout === "kanban" ? "bg-slate-950 text-white" : "text-slate-600"}`}><KanbanSquare className="h-3.5 w-3.5" /> Kanban</button>
                    </div>
                    {canManageModule("tasks") && <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 self-start rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(16,185,129,0.16)]">
                      <Plus className="h-4 w-4" /> New task
                    </button>}
                  </div>
                </div>

                <div className="mb-3 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  <div className="flex min-w-max gap-2 pb-1">
                    {[{ label: "All tasks", value: "all" }, ...(["To do", "In progress", "Waiting", "Completed"] as TaskStatus[]).map((status) => ({ label: status, value: status }))].map((filter) => {
                      const count = filter.value === "all" ? tasks.length : tasks.filter((task) => task.status === filter.value).length;
                      const selected = statusFilter === filter.value;
                      return (
                        <button key={filter.value} type="button" onClick={() => setStatusFilter(filter.value)} aria-pressed={selected} className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"}`}>
                          {filter.label}<span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 sm:p-3 md:flex md:items-center">
                  <label className="col-span-2 flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 md:flex-1">
                    <Search className="h-4 w-4" />
                    <input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full border-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                      placeholder="Filter tasks, clients or teams..."
                    />
                  </label>
                  <div className="flex items-center px-1 text-xs text-slate-500 md:hidden">{filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"} shown</div>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className="hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none md:block">
                    <option value="all">All statuses</option>
                    <option value="To do">To do</option>
                    <option value="In progress">In progress</option>
                    <option value="Waiting">Waiting</option>
                    <option value="Completed">Completed</option>
                  </select>
                  <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} aria-label="Filter by priority" className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2.5 text-sm text-slate-700 outline-none md:px-3">
                    <option value="all">All priorities</option>
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                {taskLayout === "kanban" ? (
                  <>
                    <div className="hidden md:block">
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleKanbanDragStart} onDragCancel={() => setActiveKanbanTask(null)} onDragEnd={handleKanbanDragEnd}>
                        <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-4">
                          {(["To do", "In progress", "Waiting", "Completed"] as TaskStatus[]).map((status) => (
                            <KanbanColumn key={status} status={status} count={filteredTasks.filter((task) => task.status === status).length}>
                              {filteredTasks.filter((task) => task.status === status).map((task) => (
                                <KanbanCard
                                  key={task.id}
                                  task={task}
                                  canEdit={canManageModule("tasks")}
                                  onOpen={openTask}
                                  onStatusChange={(item, nextStatus) => void handleTaskStatusChange(item, nextStatus)}
                                />
                              ))}
                            </KanbanColumn>
                          ))}
                        </div>
                        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
                          {activeKanbanTask ? <KanbanDragPreview task={activeKanbanTask} /> : null}
                        </DragOverlay>
                      </DndContext>
                    </div>
                    <MobileTaskTracker
                      tasks={filteredTasks}
                      onOpen={openTask}
                      onStatusChange={(task, status) => void handleTaskStatusChange(task, status)}
                      onToggleComplete={(task) => void handleTaskStatusChange(task, task.status === "Completed" ? "To do" : "Completed")}
                      canEdit={canManageModule("tasks")}
                    />
                  </>
                ) : <div>
                  <MobileTaskTracker
                    tasks={filteredTasks}
                    onOpen={openTask}
                    onStatusChange={(task, status) => void handleTaskStatusChange(task, status)}
                    onToggleComplete={(task) => void handleTaskStatusChange(task, task.status === "Completed" ? "To do" : "Completed")}
                    canEdit={canManageModule("tasks")}
                  />
                  <div className="hidden overflow-hidden rounded-3xl border border-slate-200 bg-white md:block">
                  <div className="hidden grid-cols-[2fr_1.1fr_1fr_0.9fr_0.8fr_24px] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 md:grid">
                    <span>Task</span>
                    <span>Assignee</span>
                    <span>Status</span>
                    <span>Priority</span>
                    <span>Due date</span>
                    <span />
                  </div>
                  {filteredTasks.length > 0 ? (
                    <div className="md:space-y-0 md:p-0">
                      {filteredTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => openTask(task)}
                          className="grid w-full grid-cols-1 gap-2 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 md:grid-cols-[2fr_1.1fr_1fr_0.9fr_0.8fr_24px] md:items-center md:gap-4 md:px-4 md:py-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`flex h-5 w-5 items-center justify-center rounded-md border text-[10px] font-bold ${task.status === "Completed" ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                              {task.status === "Completed" ? "✓" : ""}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-800">{task.title}</div>
                              <div className="mt-1 text-[11px] text-slate-500">{task.project} · {task.department}</div>
                              <div className="mt-2 flex items-center gap-2"><div className="h-1.5 w-24 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${task.progress}%` }} /></div><span className="text-[10px] font-semibold text-slate-500">{task.progress}%</span></div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 md:justify-start">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-800">{task.assignee.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
                            <span className="text-sm text-slate-700">{task.assignee}</span>
                          </div>

                          <div className="text-left md:text-left">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${getStatusClasses(task.status)}`}>{task.status}</span>
                          </div>

                          <div className="text-left md:text-left">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${getPriorityClasses(task.priority)}`}>{task.priority}</span>
                          </div>

                          <div className="text-sm text-slate-600">{task.due}</div>
                          <div className="hidden text-slate-400 md:block">•••</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><CircleDashed className="h-6 w-6" /></div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">No tasks match the filters</h3>
                        <p className="mt-1 text-sm text-slate-500">Try broadening your status or priority selection.</p>
                      </div>
                    </div>
                  )}
                  </div>
                </div>}
              </div>
            )}

            {(view === "team" || view === "clients" || view === "departments" || view === "projects") && (
              <div>
                <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Workspace directory</div>
                    <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900">{pageTitle}</h1>
                    <p className="mt-2 text-sm text-slate-500">Manage the people and structure connected to this organization.</p>
                  </div>
                  {canManageModule(view) && <form onSubmit={handleManagementSubmit} className="flex w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:w-auto md:flex-row md:items-center">
                    <input value={managementName} onChange={(event) => setManagementName(event.target.value)} required placeholder={view === "team" ? "Employee name" : view === "clients" ? "Client name" : view === "projects" ? "Project name" : "Department name"} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none" />
                    {view === "team" && (
                      <>
                        <input value={managementEmail} onChange={(event) => setManagementEmail(event.target.value)} required type="email" placeholder="Member email" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none" />
                        <input value={managementPassword} onChange={(event) => setManagementPassword(event.target.value)} required minLength={8} type="password" placeholder="Initial password (8+)" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none" />
                        <select value={managementRole} onChange={(event) => setManagementRole(event.target.value as WorkspaceMember["role"])} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none">
                          <option value="employee">Employee</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                        </select>
                        {canAssignCustomRoles && <select value={managementCustomRoleId} onChange={(event) => setManagementCustomRoleId(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none">
                          <option value="">Built-in permissions</option>
                          {workspaceRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                        </select>}
                        <fieldset className="min-w-48 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <legend className="px-1 text-xs font-semibold text-slate-600">Departments</legend>
                          <div className="max-h-28 space-y-1 overflow-y-auto">
                            {departments.length ? departments.map((department) => (
                              <label key={department.id} className="flex cursor-pointer items-center gap-2 py-1 text-xs text-slate-700">
                                <input type="checkbox" checked={managementDepartmentIds.includes(department.id)} onChange={() => toggleManagementDepartment(department.id)} className="h-4 w-4 accent-emerald-700" />
                                {department.name}
                              </label>
                            )) : <span className="text-xs text-slate-500">No departments created.</span>}
                          </div>
                        </fieldset>
                      </>
                    )}
                    {view === "clients" && (
                      <>
                        <input value={managementEmail} onChange={(event) => setManagementEmail(event.target.value)} required type="email" placeholder="Client login email" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none" />
                        <input value={managementPassword} onChange={(event) => setManagementPassword(event.target.value)} required minLength={8} type="password" placeholder="Initial password (8+)" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none" />
                        {canAssignCustomRoles && <select value={managementCustomRoleId} onChange={(event) => setManagementCustomRoleId(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none">
                          <option value="">Client defaults</option>
                          {workspaceRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                        </select>}
                      </>
                    )}
                    {view === "projects" && (
                      <>
                        <select value={managementDepartmentId} onChange={(event) => setManagementDepartmentId(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none">
                          <option value="">No client</option>
                          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                        </select>
                        <input type="date" value={projectStartDate} onChange={(event) => setProjectStartDate(event.target.value)} aria-label="Project start date" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none" />
                        <input type="date" value={projectTargetDate} onChange={(event) => setProjectTargetDate(event.target.value)} aria-label="Project target date" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none" />
                      </>
                    )}
                    <button disabled={managementBusy} type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"><Plus className="h-4 w-4" /> Add</button>
                  </form>}
                </div>

                {view === "departments" && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {departments.length ? departments.map((department) => (
                      <div key={department.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700"><FolderKanban className="h-5 w-5" /></div>
                          <div className="min-w-0 flex-1"><h3 className="truncate font-bold text-slate-800">{department.name}</h3><p className="text-xs text-slate-500">{members.filter((member) => member.departmentIds.includes(department.id)).length} employees</p></div>
                          {canManageModule("departments") && <button type="button" disabled={managementBusy} onClick={() => void handleDeleteDepartment(department)} aria-label={`Delete ${department.name} department`} title="Delete department" className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}
                        </div>
                      </div>
                    )) : <EmptyDirectory label="departments" />}
                  </div>
                )}

                {view === "team" && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {members.length ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-[720px] w-full text-left">
                          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                            <tr><th className="px-5 py-3 font-bold">Employee</th><th className="px-5 py-3 font-bold">Email</th><th className="px-5 py-3 font-bold">Role</th><th className="px-5 py-3 font-bold">Department</th><th className="px-5 py-3 text-right font-bold">Action</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {members.map((member) => (
                              <tr key={member.id} className="text-sm text-slate-700">
                                <td className="px-5 py-4 font-semibold text-slate-900">{member.name}</td>
                                <td className="px-5 py-4">{member.email}</td>
                                <td className="px-5 py-4"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">{memberRoleLabels[member.role]}</span></td>
                                <td className="px-5 py-4">{member.departmentIds.length ? member.departmentIds.map((departmentId) => departments.find((department) => department.id === departmentId)?.name).filter((name): name is string => Boolean(name)).join(", ") : "No department"}</td>
                                <td className="px-5 py-4 text-right"><button type="button" onClick={() => handleEditMember(member)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:text-emerald-700"><Pencil className="h-3.5 w-3.5" /> Edit</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <EmptyDirectory label="employees" />}
                  </div>
                )}

                {view === "clients" && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {clients.length ? clients.map((client) => (
                      <div key={client.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><BriefcaseBusiness className="h-5 w-5" /></div><div className="min-w-0"><h3 className="truncate font-bold text-slate-800">{client.name}</h3><p className="truncate text-xs text-slate-500">{client.contactEmail ?? "Client portal login"}</p></div></div>
                        {client.userId && canAssignCustomRoles && (
                          <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                            Portal role
                            <select value={client.customRoleId ?? ""} onChange={(event) => { if (client.userId) void handleAssignCustomRole(client.userId, event.target.value); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-700">
                              <option value="">Client defaults</option>
                              {workspaceRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                            </select>
                          </label>
                        )}
                      </div>
                    )) : <EmptyDirectory label="clients" />}
                  </div>
                )}

                {view === "projects" && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {projects.length ? projects.map((project) => (
                      <button key={project.id} type="button" disabled={projectDetailBusy} onClick={() => void openProjectDetails(project)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg disabled:cursor-wait disabled:opacity-60">
                        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><BarChart3 className="h-5 w-5" /></div><div><h3 className="font-bold text-slate-800">{project.name}</h3><p className="text-xs text-slate-500">{clients.find((client) => client.id === project.clientId)?.name ?? "Internal project"}</p></div></div>
                        <div className="mt-3 text-xs text-slate-500">{project.description || "No project description yet."}</div>
                        <div className="mt-4 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-600" style={{ width: `${Math.round((tasks.filter((task) => task.project === project.name && task.status === "Completed").length / Math.max(1, tasks.filter((task) => task.project === project.name).length)) * 100)}%` }} /></div>
                        <div className="mt-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span>{tasks.filter((task) => task.project === project.name).length} top-level tasks</span><span>{projectDetailBusy ? "Loading…" : "View details"}</span></div>
                      </button>
                    )) : <EmptyDirectory label="projects" />}
                  </div>
                )}
              </div>
            )}

            {view === "notifications" && (
              <section>
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Workspace updates</div>
                    <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900">Notifications</h1>
                    <p className="mt-2 text-sm text-slate-500">Stay up to date with assignments, comments and task changes.</p>
                  </div>
                  <button type="button" onClick={() => void markAllNotificationsRead()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700">
                    <Check className="h-4 w-4" /> Mark all read
                  </button>
                </div>
                <div className="space-y-3">
                  {notifications.length ? notifications.map((notification) => (
                    <button key={notification.id} type="button" onClick={() => void markNotificationRead(notification)} className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${notification.isRead ? "border-slate-200 bg-white" : "border-emerald-200 bg-emerald-50/60"}`}>
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${notification.isRead ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}><Bell className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold text-slate-900">{notification.title}</div>
                          <time className="text-[11px] text-slate-400">{formatUploadedDate(notification.createdAt)}</time>
                        </div>
                        <div className="mt-1 text-sm leading-6 text-slate-600">{notification.message}</div>
                        <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{notification.type.replaceAll("_", " ")}</div>
                      </div>
                      {!notification.isRead && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />}
                    </button>
                  )) : (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Bell className="h-6 w-6" /></div>
                      <h2 className="mt-4 text-lg font-bold text-slate-900">You’re all caught up</h2>
                      <p className="mt-1 text-sm text-slate-500">New workspace activity will appear here.</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {view === "notes" && (
              <section>
                <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-amber-600">Personal workspace</div>
                    <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900">Sticky notes</h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-500">Capture quick ideas, reminders and hand-offs. Add as many notes as you need and share them with your workspace or outside it.</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{notes.length} {notes.length === 1 ? "note" : "notes"}</div>
                </div>

                {canManageModule("notes") && <form id="sticky-note-composer" onSubmit={handleCreateNote} className={`relative mb-5 min-h-60 overflow-hidden rounded-sm border p-5 pt-7 shadow-[0_14px_28px_rgba(15,23,42,0.12)] transition-transform sm:p-6 sm:pt-8 ${noteColor === "yellow" ? "rotate-[-0.6deg] border-amber-200 bg-amber-100" : noteColor === "blue" ? "rotate-[0.5deg] border-sky-200 bg-sky-100" : noteColor === "green" ? "rotate-[-0.4deg] border-emerald-200 bg-emerald-100" : "rotate-[0.6deg] border-pink-200 bg-pink-100"}`}>
                  <span aria-hidden="true" className="absolute left-1/2 top-0 h-5 w-24 -translate-x-1/2 -translate-y-1/2 rotate-[-3deg] bg-white/70 shadow-sm" />
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><StickyNote className="h-4 w-4 text-amber-600" />{editingNoteId ? "Pick up and edit" : "Pin a new note"}</div>
                    <div className="flex items-center gap-2 rounded-full bg-white/55 px-2.5 py-1.5">
                      {(["yellow", "blue", "green", "pink"] as WorkspaceNote["color"][]).map((color) => (
                        <button key={color} type="button" onClick={() => setNoteColor(color)} aria-label={`${color} note`} aria-pressed={noteColor === color} className={`h-4 w-4 rounded-full ${color === "yellow" ? "bg-amber-400" : color === "blue" ? "bg-sky-400" : color === "green" ? "bg-emerald-400" : "bg-pink-400"} ${noteColor === color ? "ring-2 ring-slate-800 ring-offset-2 ring-offset-transparent" : ""}`} />
                      ))}
                    </div>
                  </div>
                  <input value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Add a short title…" className="w-full border-0 border-b border-black/10 bg-transparent px-0 py-2 text-base font-bold text-slate-900 outline-none placeholder:text-slate-500/70 focus:border-slate-500" />
                  <textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} required rows={4} placeholder="Jot down a reminder, idea or hand-off…" className="mt-3 w-full resize-y border-0 bg-transparent px-0 py-2 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-500/70" />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-600">{editingNoteId ? "Changes stay here until you save." : "Your note will be pinned to this wall."}</span>
                    <div className="flex shrink-0 gap-2">
                      {editingNoteId && <button type="button" onClick={() => { setEditingNoteId(null); setNoteTitle(""); setNoteBody(""); setNoteColor("yellow"); setSyncMessage(""); }} className="rounded-lg bg-white/60 px-3 py-2 text-xs font-semibold text-slate-700">Cancel</button>}
                      <button disabled={noteBusy} type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-60">{!editingNoteId && <Plus className="h-3.5 w-3.5" />}{noteBusy ? "Saving…" : editingNoteId ? "Pin changes" : "Pin note"}</button>
                    </div>
                  </div>
                </form>}

                {notes.length > 0 && (
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                    <label className="relative block min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input value={noteSearch} onChange={(event) => setNoteSearch(event.target.value)} placeholder="Search notes" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-amber-400" />
                    </label>
                    <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
                      {(["all", "yellow", "blue", "green", "pink"] as const).map((color) => (
                        <button key={color} type="button" onClick={() => setNoteColorFilter(color)} aria-pressed={noteColorFilter === color} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold capitalize ${noteColorFilter === color ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{color === "all" ? "All notes" : color}</button>
                      ))}
                    </div>
                  </div>
                )}

                {filteredNotes.length ? (
                  <div className="grid gap-5 px-1 py-2 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredNotes.map((note, index) => (
                      <article key={note.id} onDoubleClick={() => note.authorId === user?.id && startEditingNote(note)} className={`group relative flex min-h-56 cursor-default flex-col rounded-sm border p-5 pt-7 shadow-[0_12px_22px_rgba(15,23,42,0.10)] transition duration-200 hover:z-10 hover:scale-[1.025] hover:rotate-0 hover:shadow-[0_20px_35px_rgba(15,23,42,0.18)] ${index % 3 === 1 ? "rotate-[0.8deg]" : index % 3 === 2 ? "rotate-[-0.7deg]" : "rotate-[-0.35deg]"} ${note.color === "yellow" ? "border-amber-200 bg-amber-100" : note.color === "blue" ? "border-sky-200 bg-sky-100" : note.color === "green" ? "border-emerald-200 bg-emerald-100" : "border-pink-200 bg-pink-100"}`}>
                        <span aria-hidden="true" className="absolute left-1/2 top-0 h-5 w-20 -translate-x-1/2 -translate-y-1/2 rotate-[2deg] bg-white/65 shadow-sm" />
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="min-w-0 flex-1 break-words text-lg font-bold text-slate-900">{note.title || "Untitled note"}</h2>
                          {canManageModule("notes") && note.authorId === user?.id && <div className="flex shrink-0 items-center gap-1">
                            <button type="button" onClick={() => startEditingNote(note)} aria-label={`Edit ${note.title || "note"}`} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/70 hover:text-slate-900"><Pencil className="h-4 w-4" /></button>
                            <button type="button" onClick={() => void handleDeleteNote(note)} aria-label={`Delete ${note.title || "note"}`} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/70 hover:text-rose-600"><X className="h-4 w-4" /></button>
                          </div>}
                        </div>
                        <button type="button" onClick={() => startEditingNote(note)} disabled={note.authorId !== user?.id} aria-label={`Open ${note.title || "note"} to edit`} className="mt-3 flex-1 cursor-text whitespace-pre-wrap break-words text-left text-sm leading-6 text-slate-700 disabled:cursor-default">{note.body}</button>
                        <div className="mt-5 flex items-center justify-between gap-2 border-t border-black/5 pt-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{note.authorId === user?.id ? "You" : note.authorName}</span>
                            <span className="text-slate-300">·</span>
                            <span className="shrink-0 text-[10px] text-slate-500">{formatUploadedDate(note.updatedAt)}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {canManageModule("notes") && note.authorId === user?.id && (["yellow", "blue", "green", "pink"] as WorkspaceNote["color"][]).map((color) => (
                              <button key={color} type="button" onClick={() => void handleNoteColorChange(note, color)} aria-label={`Change note color to ${color}`} aria-pressed={note.color === color} className={`h-3.5 w-3.5 rounded-full ${color === "yellow" ? "bg-amber-300" : color === "blue" ? "bg-sky-300" : color === "green" ? "bg-emerald-300" : "bg-pink-300"} ${note.color === color ? "ring-2 ring-slate-700 ring-offset-1" : ""}`} />
                            ))}
                            {canManageModule("notes") && note.authorId === user?.id && <button type="button" onClick={() => setSharingNote(note)} aria-label={`Share ${note.title || "note"}`} className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white"><Share2 className="h-3.5 w-3.5" /> Share</button>}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-amber-300 bg-amber-50/50 px-6 py-16 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><StickyNote className="h-7 w-7" /></div>
                    <h2 className="mt-4 text-lg font-bold text-slate-900">{notes.length ? "No matching notes" : "Your notes will appear here"}</h2>
                    <p className="mt-1 text-sm text-slate-500">{notes.length ? "Try a different search term or color." : "Start with a quick reminder, idea or hand-off above."}</p>
                  </div>
                )}
              </section>
            )}

            {view === "settings" && (
              <section className="max-w-2xl">
                <div className="mb-5">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Account preferences</div>
                  <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900">Settings</h1>
                  <p className="mt-2 text-sm text-slate-500">Update your profile details for this workspace.</p>
                </div>
                <form onSubmit={handleProfileSave} className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-sm font-black text-emerald-800">{profileName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "U"}</div>
                    <div><div className="font-bold text-slate-900">{profileName || "Workspace member"}</div><div className="text-sm text-slate-500">{user.email}</div></div>
                  </div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Display name</label>
                  <input value={profileName} onChange={(event) => setProfileName(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 outline-none" />
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <div className="font-semibold text-slate-800">Workspace role</div>
                    <div className="mt-1 capitalize">{currentRole ?? "Member"}</div>
                  </div>
                  <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div><div className="text-sm font-semibold text-slate-800">Dark mode</div><div className="mt-1 text-xs text-slate-500">Optimized for low-light field work.</div></div>
                    <button type="button" onClick={() => setDarkMode((current) => !current)} aria-pressed={darkMode} className={`relative h-7 w-12 rounded-full transition ${darkMode ? "bg-emerald-600" : "bg-slate-300"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${darkMode ? "left-6" : "left-1"}`} /></button>
                  </div>
                  <div className="mt-5 flex justify-end">
                    <button disabled={settingsBusy} type="submit" className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{settingsBusy ? "Saving…" : "Save settings"}</button>
                  </div>
                </form>
                {canManageModule("settings") && (
                  <form onSubmit={handleOrganizationSave} className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
                    <div className="mb-5"><h2 className="text-lg font-bold text-slate-900">Organization profile</h2><p className="mt-1 text-sm text-slate-500">Keep the workspace identity and operating timezone current.</p></div>
                    <div className="space-y-4">
                      <div><label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Organization name</label><input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none" /></div>
                      <div><label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Website</label><input value={organizationWebsite} onChange={(event) => setOrganizationWebsite(event.target.value)} type="url" placeholder="https://example.com" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none" /></div>
                      <div><label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Timezone</label><select value={organizationTimezone} onChange={(event) => setOrganizationTimezone(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none"><option>UTC</option><option>Asia/Manila</option><option>Asia/Singapore</option><option>Asia/Tokyo</option><option>America/New_York</option><option>America/Los_Angeles</option><option>Europe/London</option></select></div>
                    </div>
                    <div className="mt-5 flex justify-end"><button disabled={settingsBusy} type="submit" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{settingsBusy ? "Saving…" : "Save organization"}</button></div>
                  </form>
                )}
                {(currentRole === "admin" || currentRole === "manager") && (
                  <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
                    <div className="mb-5">
                      <h2 className="text-lg font-bold text-slate-900">Workspace roles</h2>
                      <p className="mt-1 text-sm text-slate-500">Create employee or client roles with module-level view and manage access. Admin accounts always keep full access.</p>
                    </div>
                    {workspaceRoles.length > 0 && (
                      <div className="mb-6 space-y-2">
                        {workspaceRoles.map((role) => (
                          <div key={role.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-800">{role.name}</div>
                              <div className="truncate text-xs text-slate-500">{role.description || "No description"} · {members.filter((member) => member.customRoleId === role.id).length} employee assignments</div>
                            </div>
                            <button type="button" onClick={() => handleEditWorkspaceRole(role)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Edit</button>
                            <button type="button" onClick={() => void handleDeleteWorkspaceRole(role)} className="rounded-lg border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700">Delete</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <form onSubmit={handleSaveWorkspaceRole} className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-slate-600">
                          Role name
                          <input value={roleName} onChange={(event) => setRoleName(event.target.value)} required maxLength={60} placeholder="e.g. Site supervisor" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Description
                          <input value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} maxLength={160} placeholder="What this role can do" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
                        </label>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-slate-200">
                        <div className="grid grid-cols-[1fr_5rem_5rem] bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          <span>Module</span><span className="text-center">View</span><span className="text-center">Manage</span>
                        </div>
                        {roleModules.map(({ id, label }) => {
                          const access = rolePermissions[id] ?? { view: false, manage: false };
                          return (
                            <div key={id} className="grid grid-cols-[1fr_5rem_5rem] items-center border-t border-slate-100 px-3 py-2.5 text-sm">
                              <span className="font-medium text-slate-700">{label}</span>
                              <label className="flex justify-center" aria-label={`View ${label}`}>
                                <input type="checkbox" checked={access.view || access.manage} onChange={(event) => setRolePermissions((current) => ({
                                  ...current,
                                  [id]: { ...access, view: event.target.checked || access.manage },
                                }))} className="h-4 w-4 accent-emerald-700" />
                              </label>
                              <label className="flex justify-center" aria-label={`Manage ${label}`}>
                                <input type="checkbox" checked={access.manage} onChange={(event) => setRolePermissions((current) => ({
                                  ...current,
                                  [id]: { view: event.target.checked || access.view, manage: event.target.checked },
                                }))} className="h-4 w-4 accent-emerald-700" />
                              </label>
                            </div>
                          );
                        })}
                      </div>
                      {syncMessage && <div role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{syncMessage}</div>}
                      <div className="flex justify-end gap-2">
                        {editingWorkspaceRoleId && <button type="button" onClick={resetRoleEditor} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button>}
                        <button disabled={roleBusy} type="submit" className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{roleBusy ? "Saving…" : editingWorkspaceRoleId ? "Save role" : "Create role"}</button>
                      </div>
                    </form>
                  </section>
                )}
              </section>
            )}

            {view !== "dashboard" && view !== "executive" && view !== "my-tasks" && view !== "all-tasks" && view !== "team" && view !== "clients" && view !== "departments" && view !== "projects" && view !== "stock" && view !== "documents" && view !== "notifications" && view !== "notes" && view !== "settings" && (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-8 w-8" /></div>
                <h2 className="mt-5 text-2xl font-black tracking-[-0.06em] text-slate-900">{pageTitle} is ready for your next phase</h2>
                <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">This workspace is designed for a future-ready industrial operations layer.</p>
                <button type="button" onClick={() => handleViewChange("dashboard")} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Back to dashboard <ArrowRight className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        </main>
      </div>

      <div className="fixed bottom-0 left-0 z-40 flex w-full items-center justify-around gap-1 border-t border-slate-800 bg-slate-950/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl lg:hidden">
        {visibleNavItems.filter(({ id }) => id !== "all-tasks").slice(0, 5).map(({ label, id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleViewChange(id)}
            className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[10px] font-medium transition ${
              view === id ? "bg-emerald-600 text-white" : "text-slate-300"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="mt-1 max-w-full truncate leading-none">{id === "dashboard" ? "Home" : label === "My tasks" ? "Tasks" : id === "team" ? "Team" : label}</span>
          </button>
        ))}
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <button type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
          <aside className="relative flex h-full w-[min(86vw,22rem)] flex-col overflow-y-auto bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl">
            <div className="mb-8 flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <Image src="/logo.png" alt="Rigtech Engineering" width={900} height={900} className="h-20 w-20 object-contain" />
                <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">industrial operations</div>
              </div>
              <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            {canManageModule("tasks") && (
              <button type="button" onClick={() => { setShowCreate(true); setMobileNavOpen(false); }} className="mb-6 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(5,150,105,0.25)]">
                <Plus className="h-4 w-4" /> Create task
              </button>
            )}
            <nav className="flex-1 space-y-1 overflow-y-auto">{renderGroupedNavigation(true)}</nav>
            <div className="mt-auto flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-800">MA</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800">{userName}</div>
                <div className="truncate text-[11px] text-slate-500">{user.email}</div>
              </div>
              <button type="button" onClick={() => void supabase.auth.signOut()} aria-label="Sign out" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </aside>
        </div>
      )}

      {sharingNote && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center" onClick={() => setSharingNote(null)}>
          <div role="dialog" aria-modal="true" aria-label="Share sticky note" onClick={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Share note</div>
                <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-900">{sharingNote.title || "Untitled note"}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-slate-500">{sharingNote.body}</p>
              </div>
              <button type="button" onClick={() => setSharingNote(null)} aria-label="Close share dialog" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-6">
              <h3 className="text-sm font-bold text-slate-900">Share outside Rigtech</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => void handleShareExternally(sharingNote)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white"><Share2 className="h-4 w-4" /> Share from device</button>
                <button type="button" onClick={() => void navigator.clipboard.writeText(`${sharingNote.title || "Sticky note"}\n\n${sharingNote.body}`).then(() => setSyncMessage("Sticky note copied to your clipboard."))} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">Copy note text</button>
              </div>
            </div>
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900">Share within workspace</h3>
                <span className="text-xs text-slate-400">{members.length} members</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Choose a person and they will see this note in their Sticky notes view.</p>
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {members.filter((member) => member.id !== user?.id).map((member) => (
                  <button key={member.id} type="button" disabled={shareBusy} onClick={() => void handleShareInternally(sharingNote, member)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-60">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-800">{member.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{member.name}</span><span className="block truncate text-xs text-slate-500">{member.email}</span></span>
                    <Share2 className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
                {!members.filter((member) => member.id !== user?.id).length && <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-sm text-slate-500">No other workspace members yet.</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-6 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/90 p-2 shadow-[0_20px_50px_rgba(15,23,42,0.14)] backdrop-blur-xl lg:flex">
        {visibleNavItems.filter(({ id }) => id !== "all-tasks").slice(0, 5).map(({ label, id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleViewChange(id)}
            className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition ${
              view === id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {selectedProject && (
        <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm" onClick={() => setSelectedProject(null)}>
          <motion.aside
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
            className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto border-l border-slate-200 bg-white p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:p-7"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-700">Project details</div>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900">{selectedProject.project.name}</h2>
                <p className="mt-2 text-sm text-slate-500">{selectedProject.project.description || "No project description yet."}</p>
              </div>
              <button type="button" onClick={() => setSelectedProject(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-950 p-4 text-white"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Tasks</div><div className="mt-2 text-2xl font-black">{selectedProject.tasks.filter((task) => !task.parentTaskId).length}</div><div className="text-xs text-slate-400">{selectedProject.tasks.length} including subtasks</div></div>
              <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-950"><div className="text-[10px] uppercase tracking-[0.14em] text-emerald-700">Completion</div><div className="mt-2 text-2xl font-black">{selectedProject.tasks.length ? Math.round((selectedProject.tasks.filter((task) => task.status === "Completed").length / selectedProject.tasks.length) * 100) : 0}%</div><div className="text-xs text-emerald-700">Based on all project tasks</div></div>
              <div className="rounded-2xl bg-slate-50 p-4 text-slate-900"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Client</div><div className="mt-2 truncate text-lg font-black">{clients.find((client) => client.id === selectedProject.project.clientId)?.name ?? "Internal project"}</div><div className="text-xs text-slate-500">{selectedProject.project.status ?? "Active"}</div></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1.5">Start: {selectedProject.project.startDate ?? "Not set"}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5">Target: {selectedProject.project.targetDate ?? "Not set"}</span>
            </div>

            <section className="mt-7">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">Milestones</h3><span className="text-xs text-slate-400">{selectedProject.milestones.filter((milestone) => milestone.completedAt).length}/{selectedProject.milestones.length} complete</span></div>
              <form onSubmit={addProjectMilestone} className="mb-3 grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
                <input value={milestoneName} onChange={(event) => setMilestoneName(event.target.value)} required placeholder="Add milestone" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none" />
                <input value={milestoneDueDate} onChange={(event) => setMilestoneDueDate(event.target.value)} type="date" aria-label="Milestone due date" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none" />
                <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Add</button>
              </form>
              <div className="space-y-2">
                {selectedProject.milestones.map((milestone) => (
                  <button key={milestone.id} type="button" onClick={() => void toggleProjectMilestone(milestone)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-emerald-300">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${milestone.completedAt ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}>{milestone.completedAt ? "✓" : ""}</span>
                    <span className={`min-w-0 flex-1 text-sm font-semibold ${milestone.completedAt ? "text-slate-400 line-through" : "text-slate-800"}`}>{milestone.name}</span>
                    <span className="text-xs text-slate-400">{milestone.dueDate ?? "No date"}</span>
                  </button>
                ))}
                {!selectedProject.milestones.length && <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">No milestones yet.</div>}
              </div>
            </section>

            <section className="mt-7">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">Project tasks</h3><span className="text-xs text-slate-400">{selectedProject.tasks.length} records</span></div>
              <div className="space-y-2">
                {selectedProject.tasks.length ? selectedProject.tasks.map((task) => (
                  <div key={task.id} className={`rounded-2xl border border-slate-200 bg-white p-4 ${task.parentTaskId ? "ml-5 sm:ml-8" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0"><div className="font-semibold text-slate-900">{task.title}</div><div className="mt-1 text-xs text-slate-500">{task.assignee} · {task.due}</div></div>
                      <div className="flex gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${getStatusClasses(task.status)}`}>{task.status}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${getPriorityClasses(task.priority)}`}>{task.priority}</span></div>
                    </div>
                    {task.description && <p className="mt-3 text-sm leading-6 text-slate-600">{task.description}</p>}
                  </div>
                )) : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">No tasks are linked to this project yet.</div>}
              </div>
            </section>

            <section className="mt-7">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-slate-500">Attachments</h3>
              {selectedProject.attachments.length ? <div className="space-y-2">{selectedProject.attachments.map((attachment) => <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><div className="min-w-0"><div className="truncate text-slate-700">{attachment.fileName}</div><div className="mt-1 text-[11px] text-slate-400">Uploaded {formatUploadedDate(attachment.uploadedAt)}</div></div>{attachment.url && <a href={attachment.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-emerald-700">Open</a>}</div>)}</div> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">No attachments on project tasks.</div>}
            </section>

            <section className="mt-7">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-slate-500">Comments</h3>
              {selectedProject.comments.length ? <div className="space-y-2">{selectedProject.comments.map((comment) => <div key={comment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="text-sm font-semibold text-slate-800">{comment.authorName}</div><div className="mt-1 text-sm text-slate-600">{comment.body}</div></div>)}</div> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">No comments on project tasks.</div>}
            </section>
          </motion.aside>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm" onClick={() => setSelectedTask(null)}>
          <motion.aside
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
            className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Task details</div>
              <div className="flex items-center gap-2">
                {canManageModule("tasks") && <button type="button" onClick={() => void handleDeleteTask(selectedTask)} aria-label={`Delete task ${selectedTask.title}`} title="Delete task and subtasks" className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 text-rose-600 transition hover:bg-rose-50">
                  <Trash2 className="h-4 w-4" />
                </button>}
                <button type="button" onClick={() => setSelectedTask(null)} aria-label="Close task details" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-xs font-black text-emerald-800">{selectedTask.assignee.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
              <div>
                <div className="text-xs uppercase tracking-[0.15em] text-slate-500">{selectedTask.department}</div>
                <div className="text-sm font-medium text-slate-700">{selectedTask.assignee}</div>
              </div>
            </div>

            <form onSubmit={handleTaskTitleSave} className="flex items-start gap-2">
              <input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} readOnly={!canManageModule("tasks")} className="min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-0 text-3xl font-black tracking-[-0.06em] text-slate-900 outline-none focus:border-slate-200 focus:bg-slate-50 focus:px-2" aria-label="Task title" />
              {canManageModule("tasks") && titleDraft.trim() !== selectedTask.title && <button disabled={titleBusy} type="submit" className="mt-1 shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{titleBusy ? "Saving…" : "Save"}</button>}
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${getPriorityClasses(selectedTask.priority)}`}>{selectedTask.priority}</span>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${getStatusClasses(selectedTask.status)}`}>{selectedTask.status}</span>
              {canManageModule("tasks") && (
                <select
                  value={selectedTask.status}
                  onChange={(event) => void handleTaskStatusChange(selectedTask, event.target.value as TaskStatus)}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 outline-none"
                  aria-label="Change task status"
                >
                  {(["To do", "In progress", "Waiting", "Completed"] as TaskStatus[]).map((option) => <option key={option}>{option}</option>)}
                </select>
              )}
            </div>

            <form onSubmit={handleTaskDescriptionSave} className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Description</div>
              <textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} readOnly={!canManageModule("tasks")} rows={3} placeholder="Add task details, scope or handoff notes..." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400" />
              {canManageModule("tasks") && <div className="mt-2 flex justify-end">
                <button disabled={descriptionBusy} type="submit" className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{descriptionBusy ? "Saving…" : "Save description"}</button>
              </div>}
            </form>

            <div className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Client</div>
                <div className="mt-2 text-sm font-semibold text-slate-800">{selectedTask.client}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Due</div>
                <div className="mt-2 text-sm font-semibold text-slate-800">{selectedTask.due}</div>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">Activity history</h3>
                <span className="text-xs text-slate-400">{auditEvents.length} events</span>
              </div>
              <div className="space-y-2">
                {auditEvents.length ? auditEvents.map((event) => (
                  <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                    <span className="font-semibold capitalize text-slate-800">{event.action}</span>
                    {event.changedFields.length > 0 && <span> · {event.changedFields.join(", ")}</span>}
                    <span className="ml-2 text-slate-400">{formatUploadedDate(event.createdAt)}</span>
                  </div>
                )) : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">No activity recorded yet.</div>}
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">Subtasks</h3>
                <span className="text-sm text-slate-500">{getSubtaskStats(selectedTask.subtasks).done}/{getSubtaskStats(selectedTask.subtasks).total}</span>
              </div>

              {canManageModule("tasks") && <form onSubmit={handleCreateSubtask} className="mb-3 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-600">{subtaskParentId ? "Add nested subtask" : "Add subtask"}</div>
                  {subtaskParentId && <button type="button" onClick={() => { setSubtaskParentId(null); setSubtaskDescription(""); }} className="text-xs font-semibold text-slate-400 hover:text-slate-700">Cancel nesting</button>}
                </div>
                <div className="flex gap-2">
                  <input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} required placeholder={subtaskParentId ? "Add a subtask under this item..." : "Add a subtask..."} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none" />
                  <button disabled={subtaskBusy} type="submit" className="rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{subtaskBusy ? "…" : "Add"}</button>
                </div>
                <textarea value={subtaskDescription} onChange={(event) => setSubtaskDescription(event.target.value)} rows={2} placeholder="Optional description..." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400" />
              </form>}

              <div className="space-y-2">
                {selectedTask.subtasks.length > 0 ? (
                  renderSubtaskTree(selectedTask.subtasks).map((subtask) => (
                    <div key={subtask.supabaseId} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700" style={{ marginLeft: subtask.depth * 14 }}>
                      <button
                        type="button"
                        onClick={() => void handleSubtaskStatusChange(subtask)}
                        disabled={!canManageModule("tasks")}
                        aria-label={`${subtask.completed ? "Reopen" : "Complete"} ${subtask.title}`}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold transition ${subtask.completed ? "bg-emerald-100 text-emerald-700" : "border border-slate-200 bg-slate-100 text-slate-500"} disabled:cursor-not-allowed disabled:opacity-70`}
                      >
                        {subtask.completed ? "✓" : ""}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="break-words">{subtask.title}</div>
                        <textarea
                          defaultValue={subtask.description}
                          onBlur={(event) => void handleSubtaskDescriptionSave(subtask, event.target.value)}
                          readOnly={!canManageModule("tasks")}
                          rows={1}
                          placeholder="Add description..."
                          className="mt-1 w-full resize-y border-0 bg-transparent p-0 text-xs leading-5 text-slate-500 outline-none placeholder:text-slate-400"
                          aria-label={`Description for ${subtask.title}`}
                        />
                      </div>
                      {canManageModule("tasks") && (
                        <button type="button" onClick={() => setSubtaskParentId(subtask.supabaseId)} className="shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700">
                          Add child
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">No subtasks yet.</div>
                )}
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">Attachments</h3>
                {canManageModule("tasks") && <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:text-emerald-700">
                  <Paperclip className="h-3.5 w-3.5" /> {attachmentBusy ? "Uploading…" : "Add file"}
                  <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" capture="environment" onChange={handleUploadAttachment} disabled={attachmentBusy} className="hidden" />
                </label>}
              </div>
              {canManageModule("tasks") && attachmentRetry && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <span className="truncate">Upload failed: {attachmentRetry.name}</span>
                  <button type="button" disabled={attachmentBusy} onClick={() => void uploadAttachment(attachmentRetry)} className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1.5 font-semibold text-white disabled:opacity-60">Retry</button>
                </div>
              )}
              {attachments.length ? (
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="truncate text-slate-700">{attachment.fileName}</div>
                        <div className="mt-1 text-[11px] text-slate-400">Uploaded {formatUploadedDate(attachment.uploadedAt)}</div>
                      </div>
                      {attachment.url && <a href={attachment.url} target="_blank" rel="noreferrer" className="ml-3 shrink-0 text-xs font-semibold text-emerald-700">Open</a>}
                    </div>
                  ))}
                </div>
              ) : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">No attachments yet.</div>}
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">Comments</h3>
                <span className="text-slate-400"><MessageSquareText className="h-4 w-4" /></span>
              </div>
              <div className="space-y-2">
                {comments.length ? comments.map((comment) => (
                  <div key={comment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-sm font-semibold text-slate-800">{comment.authorName}</div>
                    <div className="mt-1 text-sm text-slate-600">{comment.body}</div>
                  </div>
                )) : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">No comments yet.</div>}
              </div>
              {canManageModule("tasks") && <form onSubmit={handleAddComment} className="mt-4 flex gap-2">
                <input value={commentBody} onChange={(event) => setCommentBody(event.target.value)} required className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400" placeholder="Write a comment..." />
                <button type="submit" className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Send</button>
              </form>}
            </div>
          </motion.aside>
        </div>
      )}

      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={() => setEditingMember(null)}>
          <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-6 flex items-center justify-between">
              <div><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Employee management</div><h2 className="mt-2 text-2xl font-black tracking-[-0.06em] text-slate-900">Edit employee</h2></div>
              <button type="button" onClick={() => setEditingMember(null)} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleSaveMember} className="space-y-4">
              <input value={managementMemberName} onChange={(event) => setManagementMemberName(event.target.value)} required placeholder="Full name" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none" />
              <input value={managementEmail} onChange={(event) => setManagementEmail(event.target.value)} required type="email" placeholder="Login email" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none" />
              <input value={managementPassword} onChange={(event) => setManagementPassword(event.target.value)} minLength={8} type="password" placeholder="New password (leave blank to keep current)" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none" />
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={managementRole} onChange={(event) => setManagementRole(event.target.value as WorkspaceMember["role"])} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none">
                  <option value="employee">Employee</option><option value="supervisor">Supervisor</option><option value="manager">Manager</option><option value="admin">Admin</option>
                </select>
                {canAssignCustomRoles && <select value={managementCustomRoleId} onChange={(event) => setManagementCustomRoleId(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none">
                  <option value="">Built-in permissions</option>{workspaceRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>}
                <fieldset className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <legend className="px-1 text-xs font-semibold text-slate-600">Departments</legend>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {departments.length ? departments.map((department) => (
                      <label key={department.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm text-slate-700">
                        <input type="checkbox" checked={managementDepartmentIds.includes(department.id)} onChange={() => toggleManagementDepartment(department.id)} className="h-4 w-4 accent-emerald-700" />
                        {department.name}
                      </label>
                    )) : <span className="text-sm text-slate-500">No departments created.</span>}
                  </div>
                </fieldset>
                <select value={managementTeamId} onChange={(event) => setManagementTeamId(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none">
                  <option value="">No team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
                <select value={managementAvailability} onChange={(event) => setManagementAvailability(event.target.value as WorkspaceMember["availabilityStatus"])} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none">
                  <option value="available">Available</option><option value="limited">Limited</option><option value="unavailable">Unavailable</option><option value="leave">On leave</option>
                </select>
                <input value={managementCapacity} onChange={(event) => setManagementCapacity(event.target.value)} type="number" min="0" max="168" step="0.5" placeholder="Hours/week" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none" />
                <input value={managementMaxTasks} onChange={(event) => setManagementMaxTasks(event.target.value)} type="number" min="0" placeholder="Max active tasks" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none" />
              </div>
              {syncMessage && <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{syncMessage}</div>}
              <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setEditingMember(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button disabled={managementBusy} type="submit" className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{managementBusy ? "Saving…" : "Save changes"}</button></div>
            </form>
          </motion.div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(event) => event.stopPropagation()} className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Task creation</div>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.06em] text-slate-900">Create a task</h2>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600"><X className="h-4 w-4" /></button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">What needs to be done?</label>
                <input name="title" required placeholder="e.g. Repair Mud Tank 32 side panel" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400" />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Assign to</label>
                  <div className="mt-2 max-h-36 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {members.length ? members.map((member) => (
                      <label key={member.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" name="assignee_ids" value={member.id} defaultChecked={member.id === user.id} className="h-4 w-4 accent-emerald-700" />
                        <span>{member.name}</span>
                      </label>
                    )) : <span className="text-sm text-slate-500">No workspace members available.</span>}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">Select one or more people. The first selected person is the primary assignee.</p>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Project</label>
                  <select name="project_id" defaultValue="" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none">
                    <option value="">Standalone task</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Priority</label>
                  <select name="priority" defaultValue="Medium" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none">
                    <option>Urgent</option>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Client visibility</label>
                <select name="visibility" defaultValue="internal" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none">
                  <option value="internal">Internal only</option>
                  <option value="client_visible">Visible to selected client</option>
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Due date</label>
                  <input name="due" type="date" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Client</label>
                  <select name="client_id" defaultValue="" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none">
                    <option value="">Internal / no client</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Description</label>
                <textarea name="description" rows={3} placeholder="Add context, scope or handoff details..." className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400" />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Subtasks</label>
                    <p className="mt-1 text-xs text-slate-500">Add the checklist items needed to complete this task.</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-400">{newSubtasks.length}</span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={newSubtaskTitle}
                    onChange={(event) => setNewSubtaskTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const title = newSubtaskTitle.trim();
                        if (!title) return;
                        setNewSubtasks((current) => [...current, title]);
                        setNewSubtaskTitle("");
                      }
                    }}
                    placeholder="Add a subtask..."
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const title = newSubtaskTitle.trim();
                      if (!title) return;
                      setNewSubtasks((current) => [...current, title]);
                      setNewSubtaskTitle("");
                    }}
                    className="rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white"
                  >
                    Add
                  </button>
                </div>
                {newSubtasks.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {newSubtasks.map((subtask, index) => (
                      <div key={`${subtask}-${index}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">{index + 1}</div>
                        <span className="min-w-0 flex-1 break-words">{subtask}</span>
                        <button type="button" onClick={() => setNewSubtasks((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="shrink-0 text-xs font-semibold text-slate-400 hover:text-rose-600">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-emerald-700"><ShieldCheck className="h-4 w-4" /></div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Client portal access</div>
                    <div className="text-[11px] text-slate-500">Choose visibility above to share progress with the selected client.</div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
                <button type="submit" className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Create task</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
