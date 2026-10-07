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
  Download,
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

type ProjectDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  fileSize: number;
  createdAt: string;
};

type ProjectStockMovement = {
  id: string;
  stockItemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  movementType: "receipt" | "issue";
  quantity: number;
  movementDate: string;
  area: string | null;
  comments: string | null;
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
  documents: ProjectDocument[];
  stockMovements: ProjectStockMovement[];
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

const getLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

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
  if (role === "client") return targetView === "projects";
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
  emptyTitle,
  emptyDescription,
}: {
  tasks: Task[];
  onOpen: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onToggleComplete: (task: Task) => void;
  canEdit: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  return (
    <div className="space-y-3 md:hidden">
      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
          <CircleDashed className="mx-auto h-8 w-8 text-slate-400" />
          <h2 className="mt-3 text-sm font-bold text-slate-900">{emptyTitle ?? "No tasks match these filters"}</h2>
          <p className="mt-1 text-xs text-slate-600">{emptyDescription ?? "Try another status or priority."}</p>
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
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${task.status === "Completed" ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-slate-200 bg-slate-50 text-transparent"} disabled:cursor-default disabled:opacity-70`}
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
                <span
                  role="progressbar"
                  aria-label={`Progress for ${task.title}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.max(0, Math.min(100, task.progress))}
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
                >
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
                  className="min-h-11 max-w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
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

function TaskAssigneeSelect({
  members,
  currentUserId,
  selectedIds: selectedIdsProp,
  onSelectionChange,
  ariaLabel,
}: {
  members: WorkspaceMember[];
  currentUserId: string;
  selectedIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  ariaLabel?: string;
}) {
  const [internalSelectedIds, setInternalSelectedIds] = useState(() => members
    .filter((member) => member.id === currentUserId)
    .map((member) => member.id));
  const selectedIds = selectedIdsProp ?? internalSelectedIds;
  const [search, setSearch] = useState("");
  const selectedMembers = members.filter((member) => selectedIds.includes(member.id));
  const filteredMembers = members.filter((member) =>
    `${member.name} ${member.email}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const toggleMember = (memberId: string) => {
    const nextSelectedIds = selectedIds.includes(memberId)
      ? selectedIds.filter((id) => id !== memberId)
      : [...selectedIds, memberId];
    if (onSelectionChange) onSelectionChange(nextSelectedIds);
    else setInternalSelectedIds(nextSelectedIds);
  };

  return (
    <details className="group relative mt-2">
      <summary aria-label={ariaLabel} className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm outline-none transition hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {selectedMembers.length ? (
            <>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">
                {selectedMembers[0].name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}
              </span>
              <span className="truncate text-sm font-medium text-slate-700">{selectedMembers[0].name}</span>
              {selectedMembers.length > 1 && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">+{selectedMembers.length - 1}</span>}
            </>
          ) : <span className="text-sm text-slate-400">Select team members</span>}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 rotate-90 text-slate-400 transition group-open:-rotate-90" />
      </summary>
      <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <label className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-slate-400">
          <Search className="h-4 w-4 shrink-0" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people"
            aria-label="Search team members"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
          <span className="shrink-0 text-[10px] font-medium text-slate-400">{selectedIds.length} selected</span>
        </label>
        <div className="max-h-52 overflow-y-auto p-1.5">
          {filteredMembers.length ? filteredMembers.map((member) => {
            const isSelected = selectedIds.includes(member.id);
            return (
              <label key={member.id} className={`flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition ${isSelected ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
                <input
                  type="checkbox"
                  name="assignee_ids"
                  value={member.id}
                  checked={isSelected}
                  onChange={() => toggleMember(member.id)}
                  className="h-4 w-4 shrink-0 accent-emerald-700"
                />
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                  {member.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{member.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">{member.email}</span>
                </span>
              </label>
            );
          }) : <p className="px-3 py-5 text-center text-sm text-slate-500">No team members match that search.</p>}
        </div>
        <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">Select multiple people to assign this task to a team.</div>
      </div>
    </details>
  );
}

const toTaskStatus = (status: unknown): TaskStatus =>
  status === "in_progress" ? "In progress" : status === "completed" ? "Completed" : status === "waiting" ? "Waiting" : "To do";

const toTaskPriority = (priority: unknown): TaskPriority =>
  priority === "urgent" ? "Urgent" : priority === "high" ? "High" : priority === "low" ? "Low" : "Medium";

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const taskDetailCloseRef = useRef<HTMLButtonElement>(null);
  const createTaskCloseRef = useRef<HTMLButtonElement>(null);
  const projectDetailCloseRef = useRef<HTMLButtonElement>(null);
  const shareNoteCloseRef = useRef<HTMLButtonElement>(null);
  const editMemberCloseRef = useRef<HTMLButtonElement>(null);
  const mobileNavCloseRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<WorkspaceView>("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsedNavGroups, setCollapsedNavGroups] = useState<string[]>([]);
  const [syncMessage, setSyncMessage] = useState("");
  useEffect(() => {
    if (!syncMessage) return;
    const timeout = window.setTimeout(() => setSyncMessage(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [syncMessage]);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
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
  const [editingProject, setEditingProject] = useState(false);
  const [showMobileProjectForm, setShowMobileProjectForm] = useState(false);
  const [showMobileDirectoryForm, setShowMobileDirectoryForm] = useState(false);
  const [directorySearch, setDirectorySearch] = useState("");
  const [employeeRoleFilter, setEmployeeRoleFilter] = useState("all");
  const [employeeDepartmentFilter, setEmployeeDepartmentFilter] = useState("all");
  const [notificationFilter, setNotificationFilter] = useState<"all" | "unread">("all");
  const [showNoteComposer, setShowNoteComposer] = useState(false);
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
  const [taskAssigneeDraft, setTaskAssigneeDraft] = useState<string[]>([]);
  const [assigneeBusy, setAssigneeBusy] = useState(false);
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
  const canManageModule = (module: string) => currentRole !== "client" && moduleAccess(module).manage;
  const canAssignCustomRoles = currentRole === "admin" || currentRole === "manager";
  const canView = (targetView: WorkspaceView) =>
    currentRole === "client"
      ? targetView === "projects"
      : canViewModule(viewModule(targetView)) || (targetView === "documents" && currentRole !== null);
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
      StatusBar.setBackgroundColor({ color: "#f9fafb" }),
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
        console.error("Unable to reach the Rigtech workspace while loading sticky notes.", error);
        setSyncMessage(error instanceof TypeError && error.message.toLowerCase().includes("fetch")
          ? "Unable to reach the Rigtech workspace while loading sticky notes. Check your internet connection and retry."
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
        let memberQuery = supabase
          .from("organization_members")
          .select("user_id, department_id, team_id, role, custom_role_id, availability_status, capacity_hours_per_week, max_active_tasks")
          .eq("organization_id", membership.organization_id);
        memberQuery = membership.role === "client"
          ? memberQuery.eq("user_id", user.id)
          : memberQuery.neq("role", "client");
        const memberResult = await memberQuery;
        let legacyMemberResult = null;
        if (memberResult.error && /(team_id|availability_status|capacity_hours_per_week|max_active_tasks)/.test(memberResult.error.message)) {
          let legacyMemberQuery = supabase
            .from("organization_members")
            .select("user_id, department_id, role")
            .eq("organization_id", membership.organization_id);
          legacyMemberQuery = membership.role === "client"
            ? legacyMemberQuery.eq("user_id", user.id)
            : legacyMemberQuery.neq("role", "client");
          legacyMemberResult = await legacyMemberQuery;
        }
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
        setSyncMessage(error instanceof Error ? error.message : "Unable to load your Rigtech workspace.");
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

  const activeDialogType = selectedProject
    ? "project"
    : selectedTask
      ? "details"
      : showCreate
        ? "create"
        : sharingNote
          ? "share-note"
          : editingMember
            ? "edit-member"
            : mobileNavOpen
              ? "mobile-nav"
              : null;
  useEffect(() => {
    if (!activeDialogType) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const manageDialogKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (activeDialogType === "project") setSelectedProject(null);
        else if (activeDialogType === "details") setSelectedTask(null);
        else if (activeDialogType === "create") setShowCreate(false);
        else if (activeDialogType === "share-note") setSharingNote(null);
        else if (activeDialogType === "edit-member") setEditingMember(null);
        else if (activeDialogType === "mobile-nav") setMobileNavOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
      const focusableElements = dialog?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusableElements?.length) return;
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", manageDialogKeyboard);
    const focusFrame = window.    requestAnimationFrame(() => {
      const initialFocus = activeDialogType === "project"
        ? projectDetailCloseRef.current
        : activeDialogType === "details"
          ? taskDetailCloseRef.current
          : activeDialogType === "create"
            ? createTaskCloseRef.current
            : activeDialogType === "share-note"
              ? shareNoteCloseRef.current
              : activeDialogType === "edit-member"
                ? editMemberCloseRef.current
                : mobileNavCloseRef.current;
      initialFocus?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", manageDialogKeyboard);
      window.cancelAnimationFrame(focusFrame);
      previouslyFocused?.focus();
    };
  }, [activeDialogType]);

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

  const filteredNotifications = useMemo(
    () => notificationFilter === "unread"
      ? notifications.filter((notification) => !notification.isRead)
      : notifications,
    [notifications, notificationFilter],
  );

  const filteredDirectoryMembers = useMemo(() => {
    const query = directorySearch.trim().toLowerCase();
    return members.filter((member) => {
      const departmentNames = member.departmentIds
        .map((departmentId) => departments.find((department) => department.id === departmentId)?.name ?? "")
        .join(" ");
      const customRoleName = workspaceRoles.find((role) => role.id === member.customRoleId)?.name ?? "";
      return (employeeRoleFilter === "all" || member.role === employeeRoleFilter) &&
        (employeeDepartmentFilter === "all" || member.departmentIds.includes(employeeDepartmentFilter)) &&
        (!query || `${member.name} ${member.email} ${departmentNames} ${customRoleName} ${memberRoleLabels[member.role]}`.toLowerCase().includes(query));
    });
  }, [members, departments, workspaceRoles, directorySearch, employeeRoleFilter, employeeDepartmentFilter]);

  const filteredDirectoryClients = useMemo(() => {
    const query = directorySearch.trim().toLowerCase();
    return clients.filter((client) => {
      const customRoleName = workspaceRoles.find((role) => role.id === client.customRoleId)?.name ?? "";
      const projectNames = projects.filter((project) => project.clientId === client.id).map((project) => project.name).join(" ");
      return !query || `${client.name} ${client.contactEmail ?? ""} ${customRoleName} ${projectNames}`.toLowerCase().includes(query);
    });
  }, [clients, workspaceRoles, projects, directorySearch]);

  const filteredDirectoryDepartments = useMemo(() => {
    const query = directorySearch.trim().toLowerCase();
    return departments.filter((department) =>
      !query || department.name.toLowerCase().includes(query),
    );
  }, [departments, directorySearch]);

  const openProjectDetails = async (project: WorkspaceProject) => {
    if (!organizationId) {
      setSyncMessage("Your workspace is not ready. Reload the page and try again.");
      return;
    }
    setProjectDetailBusy(true);
    setEditingProject(false);
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
    const { data: attachmentRows, error: attachmentError } = currentRole !== "client" && taskIds.length
      ? await supabase.from("attachments").select("id, file_name, mime_type, storage_path, task_id, created_at").in("task_id", taskIds).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (attachmentError) {
      setSyncMessage(`Unable to load project attachments: ${attachmentError.message}`);
      setProjectDetailBusy(false);
      return;
    }

    const { data: commentRows, error: commentError } = currentRole !== "client" && taskIds.length
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

    const [documentResult, stockMovementResult] = await Promise.all([
      currentRole !== "client"
        ? supabase.from("workspace_documents")
          .select("id, file_name, storage_path, mime_type, file_size, created_at")
          .eq("organization_id", organizationId)
          .eq("project_id", project.id)
          .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      currentRole !== "client" && canViewModule("stock")
        ? supabase.from("stock_movements")
          .select("id, stock_item_id, movement_type, quantity, movement_date, area, comments")
          .eq("organization_id", organizationId)
          .eq("project_id", project.id)
          .order("movement_date", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (documentResult.error) {
      setSyncMessage(`Unable to load project documents: ${documentResult.error.message}`);
      setProjectDetailBusy(false);
      return;
    }
    if (stockMovementResult.error) {
      setSyncMessage(`Unable to load project stock activity: ${stockMovementResult.error.message}`);
      setProjectDetailBusy(false);
      return;
    }
    const stockItemIds = [...new Set((stockMovementResult.data ?? []).map((movement) => movement.stock_item_id))];
    const { data: stockItems, error: stockItemsError } = stockItemIds.length
      ? await supabase.from("stock_items").select("id, item_code, name, unit").in("id", stockItemIds)
      : { data: [], error: null };
    if (stockItemsError) {
      setSyncMessage(`Unable to load project stock item details: ${stockItemsError.message}`);
      setProjectDetailBusy(false);
      return;
    }
    const stockItemById = new Map((stockItems ?? []).map((item) => [item.id, item]));

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
        assignee: currentRole === "client" ? "Rigtech team" : String(task.assignee_name ?? "Unassigned"),
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
      documents: (documentResult.data ?? []).map((document) => ({
        id: document.id,
        fileName: document.file_name,
        storagePath: document.storage_path,
        mimeType: document.mime_type,
        fileSize: Number(document.file_size),
        createdAt: document.created_at,
      })),
      stockMovements: (stockMovementResult.data ?? []).flatMap((movement) => {
        const item = stockItemById.get(movement.stock_item_id);
        return item ? [{
          id: movement.id,
          stockItemId: movement.stock_item_id,
          itemCode: item.item_code,
          itemName: item.name,
          unit: item.unit,
          movementType: movement.movement_type as ProjectStockMovement["movementType"],
          quantity: Number(movement.quantity),
          movementDate: movement.movement_date,
          area: movement.area,
          comments: movement.comments,
        }] : [];
      }),
    });
    setProjectDetailBusy(false);
  };

  const openProjectDocument = async (document: ProjectDocument) => {
    const { data, error } = await supabase.storage.from("workspace-documents").createSignedUrl(document.storagePath, 60, { download: true });
    if (error || !data?.signedUrl) {
      setSyncMessage(`Unable to open ${document.fileName}: ${error?.message ?? "No download link was returned."}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleUpdateProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !selectedProject || !canManageModule("projects")) return;

    const form = new FormData(event.currentTarget);
    const projectId = selectedProject.project.id;
    const updatedProject = {
      name: String(form.get("name") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      client_id: String(form.get("client_id") ?? "") || null,
      status: String(form.get("status") ?? "active"),
      start_date: String(form.get("start_date") ?? "") || null,
      target_date: String(form.get("target_date") ?? "") || null,
    };
    if (!updatedProject.name) return;

    setProjectDetailBusy(true);
    setSyncMessage("");
    const { data, error } = await supabase
      .from("projects")
      .update(updatedProject)
      .eq("id", projectId)
      .eq("organization_id", organizationId)
      .select("id, name, description, client_id, status, start_date, target_date")
      .maybeSingle();
    if (error || !data) {
      setSyncMessage(`Unable to update project: ${error?.message ?? "The project was not updated. Check your access and try again."}`);
      setProjectDetailBusy(false);
      return;
    }

    const project: WorkspaceProject = {
      ...selectedProject.project,
      id: data.id,
      name: data.name,
      description: data.description ?? "",
      clientId: data.client_id,
      status: data.status,
      startDate: data.start_date,
      targetDate: data.target_date,
    };
    setProjects((current) => current.map((item) => item.id === project.id ? project : item).sort((a, b) => a.name.localeCompare(b.name)));
    setTasks((current) => current.map((task) => task.project === selectedProject.project.name ? { ...task, project: project.name } : task));
    setSelectedProject((current) => current ? { ...current, project } : current);
    setEditingProject(false);
    setProjectDetailBusy(false);
    setSyncMessage(`Project "${project.name}" updated.`);
  };

  const handleDeleteProject = async () => {
    if (!organizationId || !selectedProject || !canManageModule("projects")) return;
    const project = selectedProject.project;
    if (!window.confirm(`Delete "${project.name}"? Its tasks will be kept as standalone tasks. This cannot be undone.`)) return;

    setProjectDetailBusy(true);
    setSyncMessage("");
    const { data, error } = await supabase
      .from("projects")
      .delete()
      .eq("id", project.id)
      .eq("organization_id", organizationId)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      const errorText = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;
      const linkedDocuments = error?.code === "23503" && errorText.includes("workspace_documents");
      setSyncMessage(linkedDocuments
        ? "Unable to delete this project while documents are linked to it. Move or delete its documents first."
        : `Unable to delete project: ${error?.message ?? "No project was deleted. Your account may be missing project-management access, or the project may have linked documents. Refresh and try again; contact an admin if the problem continues."}`);
      setProjectDetailBusy(false);
      return;
    }

    setProjects((current) => current.filter((item) => item.id !== project.id));
    setTasks((current) => current.map((task) => task.project === project.name ? { ...task, project: "Standalone task" } : task));
    setSelectedProject(null);
    setProjectDetailBusy(false);
    setSyncMessage(`Project "${project.name}" deleted. Its tasks remain in the workspace.`);
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

  const projectStockUsage = selectedProject?.stockMovements
    .filter((movement) => movement.movementType === "issue")
    .reduce((usage, movement) => {
      const current = usage.get(movement.stockItemId);
      if (current) current.quantity += movement.quantity;
      else usage.set(movement.stockItemId, {
        itemCode: movement.itemCode,
        itemName: movement.itemName,
        unit: movement.unit,
        quantity: movement.quantity,
      });
      return usage;
    }, new Map<string, { itemCode: string; itemName: string; unit: string; quantity: number }>());

  const metrics = [
    { label: "Active tasks", value: String(tasks.filter((task) => task.status !== "Completed").length), subtext: "From your Rigtech workspace", tone: "bg-slate-950 text-white" },
    { label: "Due today", value: String(tasks.filter((task) => task.due === "Today").length), subtext: "Current assigned work", tone: "bg-white text-slate-900" },
    { label: "Completed", value: String(tasks.filter((task) => task.status === "Completed").length), subtext: "Completed workspace tasks", tone: "bg-white text-slate-900" },
    { label: "Team capacity", value: tasks.length ? "—" : "0", subtext: tasks.length ? "Capacity tracking coming next" : "No task data yet", tone: "bg-white text-slate-900" },
  ];
  const dashboardTodayKey = getLocalDateKey(currentDate ?? new Date());
  const dueTodayTasks = tasks.filter((task) =>
    task.status !== "Completed" && (
      task.due === "Today" ||
      /^\d{4}-\d{2}-\d{2}/.test(task.due) && task.due.slice(0, 10) === dashboardTodayKey
    ),
  );

  const executiveMetrics = {
    total: tasks.length,
    active: tasks.filter((task) => task.status !== "Completed").length,
    completed: tasks.filter((task) => task.status === "Completed").length,
    inProgress: tasks.filter((task) => task.status === "In progress").length,
    urgent: tasks.filter((task) => task.priority === "Urgent" && task.status !== "Completed").length,
    completionRate: tasks.length ? Math.round((tasks.filter((task) => task.status === "Completed").length / tasks.length) * 100) : 0,
  };
  const overdueTasks = tasks.filter((task) =>
    task.status !== "Completed" && formatTaskDueDate(task.due).overdue,
  );
  const executiveRiskTasks = tasks.filter((task) =>
    task.status !== "Completed" &&
    (formatTaskDueDate(task.due).overdue || task.priority === "Urgent"),
  ).sort((first, second) =>
    Number(formatTaskDueDate(second.due).overdue) - Number(formatTaskDueDate(first.due).overdue) ||
    first.due.localeCompare(second.due),
  );
  const executiveMetricCards = [
    { label: "Completion rate", value: `${executiveMetrics.completionRate}%`, note: `${executiveMetrics.completed} of ${executiveMetrics.total} tasks`, tone: "bg-slate-950 text-white" },
    { label: "Active workload", value: String(executiveMetrics.active), note: `${executiveMetrics.inProgress} in progress`, tone: "bg-white text-slate-900" },
    { label: "At-risk tasks", value: String(executiveRiskTasks.length), note: `${overdueTasks.length} overdue · ${executiveMetrics.urgent} urgent`, tone: "bg-amber-50 text-amber-950" },
    { label: "Team members", value: String(members.length), note: `${projects.length} active projects`, tone: "bg-white text-slate-900" },
  ];
  const mobileDashboardTasks = [...tasks]
    .filter((task) => task.status !== "Completed")
    .sort((first, second) => {
      const attentionScore = (task: Task) =>
        (formatTaskDueDate(task.due).overdue ? 100 : 0) +
        (task.priority === "Urgent" ? 40 : task.priority === "High" ? 20 : task.priority === "Medium" ? 10 : 0);
      const attentionDifference = attentionScore(second) - attentionScore(first);
      if (attentionDifference) return attentionDifference;
      const firstDue = /^\d{4}-\d{2}-\d{2}/.test(first.due) ? first.due.slice(0, 10) : "9999-99-99";
      const secondDue = /^\d{4}-\d{2}-\d{2}/.test(second.due) ? second.due.slice(0, 10) : "9999-99-99";
      return firstDue.localeCompare(secondDue);
    })
    .slice(0, 3);
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

    const { data: deletedTasks, error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", task.supabaseId)
      .eq("organization_id", organizationId)
      .select("id");
    if (error) {
      setSyncMessage(`Unable to delete task: ${error.message}`);
      return;
    }
    if (!deletedTasks?.some((deletedTask) => deletedTask.id === task.supabaseId)) {
      setSyncMessage("The task was not deleted. Check your task-management access and try again.");
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
    setTaskAssigneeDraft(task.assigneeIds);
    setTaskDescription(task.description);
    setSubtaskParentId(null);
    setSubtaskDescription("");
  };

  const handleTaskAssigneesSave = async () => {
    if (!canManageModule("tasks") || !selectedTask || !user) return;
    const assigneeIds = [...new Set(taskAssigneeDraft)];
    setAssigneeBusy(true);

    if (assigneeIds.length) {
      const { error: assignmentError } = await supabase.from("task_members").upsert(
        assigneeIds.map((userId) => ({ task_id: selectedTask.supabaseId, user_id: userId })),
        { onConflict: "task_id,user_id" },
      );
      if (assignmentError) {
        setSyncMessage(`Unable to save task assignees: ${assignmentError.message}`);
        setAssigneeBusy(false);
        return;
      }
    }

    const { error: taskError } = await supabase.from("tasks").update({
      assignee_id: assigneeIds[0] ?? null,
      assigned_to_user_id: assigneeIds[0] ?? null,
    }).eq("id", selectedTask.supabaseId);
    if (taskError) {
      setSyncMessage(`Unable to update the primary task assignee: ${taskError.message}`);
      setAssigneeBusy(false);
      return;
    }

    const deleteQuery = supabase.from("task_members").delete().eq("task_id", selectedTask.supabaseId);
    const { error: removalError } = assigneeIds.length
      ? await deleteQuery.not("user_id", "in", `(${assigneeIds.map((id) => `"${id}"`).join(",")})`)
      : await deleteQuery;
    if (removalError) {
      setSyncMessage(`The primary assignee was updated, but the team assignments could not be fully synchronized: ${removalError.message}`);
      setAssigneeBusy(false);
      return;
    }

    const assigneeNames = assigneeIds
      .map((id) => members.find((member) => member.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    const updatedTask = {
      ...selectedTask,
      assigneeIds,
      assignee: assigneeNames.join(", ") || "Unassigned",
    };
    setSelectedTask(updatedTask);
    setTasks((current) => current.map((task) => task.supabaseId === selectedTask.supabaseId ? updatedTask : task));
    setTaskAssigneeDraft(assigneeIds);
    setSyncMessage("Task assignments saved.");
    setAssigneeBusy(false);
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
      console.error("Unable to create task in the Rigtech workspace.", createError);
      if (createError?.code === "42501") {
        setSyncMessage(`Task creation was blocked by Rigtech workspace access rules${createError.message ? `: ${createError.message}` : "."} Check that your account has Tasks → Manage access in this organization.`);
      } else if (createError) {
        const diagnostic = [
          createError.code ? `(${createError.code})` : "",
          createError.message,
          createError.details,
          createError.hint ? `Hint: ${createError.hint}` : "",
        ].filter(Boolean).join(" ");
        setSyncMessage(`Task was not saved to Rigtech: ${diagnostic}`);
      } else {
        setSyncMessage("Rigtech did not return the created task. Refresh and check the task list before retrying.");
      }
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

    setSyncMessage(assignmentSaveWarning || subtaskSaveWarning || "Task saved to Rigtech.");
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
      setSyncMessage("Subtask saved to Rigtech.");
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
      setSyncMessage("Attachment uploaded to Rigtech.");
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

    const result = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (result.error) {
      setAuthError(result.error.message);
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
      error = result.error
        ? {
            message: result.error.code === "23505"
              ? "A project with this name already exists in your organization. Choose a different name."
              : result.error.code === "42501" || result.error.message.toLowerCase().includes("row-level security")
                ? "Your account does not have permission to create projects. Ask an organization admin to grant Projects management access. If you already have access, ask an admin to update the Rigtech workspace."
                : result.error.message,
          }
        : null;
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
      if (view === "projects") setShowMobileProjectForm(false);
      if (view === "team" || view === "clients" || view === "departments") setShowMobileDirectoryForm(false);
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
      setShowNoteComposer(false);
      setSyncMessage(editingNoteId ? "Sticky note updated." : "Sticky note saved.");
    } catch (error) {
      console.error("Unable to reach the Rigtech workspace while saving a sticky note.", error);
      setSyncMessage(error instanceof TypeError && error.message.toLowerCase().includes("fetch")
        ? "Unable to reach the Rigtech workspace. Check your internet connection and try again; your note is still in the editor."
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
    setShowNoteComposer(true);
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
    if (!window.confirm(`Delete "${note.title || "Untitled note"}"? This cannot be undone.`)) return;
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
    try {
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
    } catch (error) {
      setSyncMessage(`Unable to share sticky note: ${error instanceof Error ? error.message : "Unexpected network error."}`);
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyNote = async (note: WorkspaceNote) => {
    try {
      await navigator.clipboard.writeText(`${note.title || "Sticky note"}\n\n${note.body}`);
      setSyncMessage("Sticky note copied to your clipboard.");
    } catch (error) {
      setSyncMessage(`Unable to copy sticky note: ${error instanceof Error ? error.message : "Clipboard access is unavailable."}`);
    }
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
      ? "Task overview"
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
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-slate-500">Loading your secure workspace…</div>;
  }

  if (!user) {
    return (
      <main className="grid min-h-[100svh] bg-[#f6f7f4] text-slate-900 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative hidden min-h-[100svh] overflow-hidden bg-slate-950 lg:flex lg:items-center lg:justify-center">
          <div aria-hidden="true" className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div aria-hidden="true" className="absolute -left-48 -top-48 h-[42rem] w-[42rem] rounded-full border border-white/[0.08]" />
          <div aria-hidden="true" className="absolute -left-28 -top-28 h-[32rem] w-[32rem] rounded-full border border-white/[0.08]" />
          <div className="relative flex h-full w-full items-center justify-center">
            <Image src="/logo.png" alt="Rigtech Engineering" width={900} height={900} priority className="w-[min(62%,420px)] object-contain" />
          </div>
          <div aria-hidden="true" className="absolute bottom-0 left-0 h-1 w-full bg-[#b9953b]" />
        </aside>

        <section className="flex min-h-[100svh] flex-col bg-[#f6f7f4] px-6 py-4 sm:px-12 sm:py-7 lg:px-16 xl:px-24">
          <header className="flex justify-center lg:hidden">
            <Image src="/logo.png" alt="Rigtech Engineering" width={900} height={900} priority className="h-80 w-80 object-contain" />
          </header>
          <div className="flex flex-1 items-center justify-center py-2 sm:py-8">
            <div className="w-full max-w-[400px]">
              <div className="mb-6 sm:mb-9">
                <div className="mb-3 h-1 w-10 rounded-full bg-[#b9953b]" />
                <h1 className="text-3xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-[34px]">Welcome back</h1>
                <p className="mt-2 text-sm text-slate-500">Sign in to continue.</p>
              </div>
              <form onSubmit={handleAuthSubmit} className="space-y-4 sm:space-y-6">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Email address</span>
                  <input
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    required
                    type="email"
                    autoComplete="username"
                    placeholder="you@company.com"
                    className="mt-2 min-h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-emerald-800 focus:ring-4 focus:ring-emerald-800/10 lg:min-h-13 lg:rounded-lg lg:text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Password</span>
                  <input
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    required
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="mt-2 min-h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-emerald-800 focus:ring-4 focus:ring-emerald-800/10 lg:min-h-13 lg:rounded-lg lg:text-sm"
                  />
                </label>
                {authError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{authError}</div>}
                <button disabled={authBusy} type="submit" className="min-h-14 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/20 disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-13 lg:rounded-lg">
                  {authBusy ? "Signing in…" : "Sign in"}
                </button>
              </form>
              <p className="mt-5 text-sm text-slate-500 sm:mt-8">Need access? Contact your workspace administrator.</p>
            </div>
          </div>
          <footer className="hidden justify-between border-t border-slate-200/80 py-4 text-[11px] text-slate-400 sm:flex">
            <span>Rigtech Engineering</span>
            <span>Operations workspace</span>
          </footer>
        </section>
      </main>
    );
  }

  if (needsOrganization) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
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
    <div className="min-h-screen overflow-x-clip bg-background pb-24 text-slate-900 lg:pb-0">
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
                <div className="min-w-0 lg:hidden">
                  <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Rigtech Operations</div>
                  <div className="truncate text-base font-bold leading-5 text-slate-900">{pageTitle}</div>
                </div>
                <div className="hidden max-w-[8rem] truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:block">RIGTECH ENGINEERING</div>
                <ChevronRight className="hidden h-4 w-4 text-slate-400 lg:block" />
                <div className="hidden max-w-[12rem] truncate text-sm font-semibold text-slate-700 lg:block">{pageTitle}</div>
              </div>

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
                {canView("notes") && <button
                  type="button"
                  onClick={() => handleViewChange("notes")}
                  aria-label="Open sticky notes"
                  title="Sticky notes"
                  className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${view === "notes" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"}`}
                >
                  <StickyNote className="h-4 w-4" />
                </button>}
                {canView("notifications") && <button type="button" onClick={() => handleViewChange("notifications")} aria-label="Open notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700">
                  <Bell className="h-4 w-4" />
                  {notifications.some((notification) => !notification.isRead) && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}
                </button>}
              </div>
            </div>
          </header>

          <div className="px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pb-28">
          {syncMessage && (
            <div role="status" aria-live="polite" className="fixed left-4 right-4 top-[calc(env(safe-area-inset-top)+5rem)] z-[70] mx-auto max-w-lg rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 text-sm text-emerald-900 shadow-lg backdrop-blur sm:left-auto sm:right-6 sm:top-5">
              <span>{syncMessage}</span>
            </div>
          )}
            {offlineMode && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                Offline mode: only tasks loaded during this session remain available. Changes will sync when you reconnect.
              </div>
            )}
            {view === "dashboard" && (
              <>
                <section className="space-y-5 md:hidden" aria-labelledby="mobile-task-overview-title">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800">
                        {currentDate ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(currentDate) : "Your workspace"}
                      </div>
                      <h1 id="mobile-task-overview-title" className="mt-1 text-3xl font-black tracking-[-0.06em] text-slate-950">Your work</h1>
                      <p className="mt-1 text-sm text-slate-600">A quick look at the team’s tasks.</p>
                    </div>
                    {canManageModule("tasks") && (
                      <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        aria-label="Create a task"
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
                      >
                        <Plus className="h-5 w-5" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <div className="flex min-h-28 w-full items-center justify-between rounded-3xl bg-slate-950 px-5 py-4 text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
                    <span>
                      <span className="block text-sm font-medium text-slate-300">Active workload</span>
                      <span className="mt-1 block text-4xl font-black tracking-tight">{tasks.filter((task) => task.status !== "Completed").length}</span>
                      <span className="mt-1 block text-xs text-slate-300">Tasks still in progress</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter("all");
                        setPriorityFilter("all");
                        setSearchTerm("");
                        handleViewChange("my-tasks");
                      }}
                      className="flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-semibold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    >
                      View tasks <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3" aria-label="Task priorities and deadlines">
                    {[
                      { label: "Due today", value: dueTodayTasks.length, tone: "border-amber-200 bg-amber-50 text-amber-950" },
                      { label: "Overdue", value: overdueTasks.length, tone: overdueTasks.length ? "border-rose-200 bg-rose-50 text-rose-950" : "border-slate-200 bg-white text-slate-950" },
                      { label: "Urgent", value: executiveMetrics.urgent, tone: executiveMetrics.urgent ? "border-rose-200 bg-white text-rose-950" : "border-slate-200 bg-white text-slate-950" },
                      { label: "In progress", value: executiveMetrics.inProgress, tone: "border-sky-200 bg-sky-50 text-sky-950" },
                    ].map((metric) => (
                      <div key={metric.label} className={`min-h-20 rounded-2xl border p-3.5 ${metric.tone}`}>
                        <div className="text-xs font-semibold opacity-80">{metric.label}</div>
                        <div className="mt-1 text-2xl font-black tracking-tight">{metric.value}</div>
                      </div>
                    ))}
                  </div>

                  <section aria-labelledby="mobile-up-next-title">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h2 id="mobile-up-next-title" className="text-lg font-bold text-slate-950">Needs attention</h2>
                        <p className="text-xs text-slate-600">Urgent and nearest-due work first</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter("all");
                          setPriorityFilter("all");
                          setSearchTerm("");
                          handleViewChange("my-tasks");
                        }}
                        className="min-h-11 rounded-xl px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                      >
                        All tasks
                      </button>
                    </div>
                    <MobileTaskTracker
                      tasks={mobileDashboardTasks}
                      onOpen={openTask}
                      onStatusChange={(task, status) => void handleTaskStatusChange(task, status)}
                      onToggleComplete={(task) => void handleTaskStatusChange(task, task.status === "Completed" ? "To do" : "Completed")}
                      canEdit={canManageModule("tasks")}
                      emptyTitle={tasks.length ? "You're all caught up" : "No tasks yet"}
                      emptyDescription={tasks.length ? "There are no open tasks needing attention." : "New tasks will appear here as work is assigned."}
                    />
                  </section>
                </section>

                <div className="hidden md:block">
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
                </div>
              </>
            )}

            {view === "stock" && organizationId && (
              <StockManagement organizationId={organizationId} role={currentRole} canManageOverride={canManageModule("stock")} projects={projects} />
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
              <section className="space-y-4 pb-2 md:space-y-0">
                <div className="mb-5 flex items-center justify-between gap-3 md:hidden">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Leadership</div>
                    <h1 className="mt-1 text-2xl font-black tracking-[-0.05em] text-slate-950">Executive overview</h1>
                  </div>
                  <div className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-bold text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />Live</div>
                </div>
                <div className="mb-6 hidden flex-col gap-3 md:flex md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-700">Leadership workspace</div>
                    <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900 sm:text-4xl">Executive overview</h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-500">A decision-ready view of delivery health, workload, risk and workspace momentum.</p>
                  </div>
                  <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><TrendingUp className="h-4 w-4" /> Live workspace metrics</div>
                </div>

                <div className="rounded-3xl bg-emerald-500 p-5 text-white shadow-sm md:hidden">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.14em] text-white/80">Delivery completion</div>
                      <div className="mt-2 flex items-baseline gap-1"><span className="text-5xl font-black tracking-[-0.07em]">{executiveMetrics.completionRate}</span><span className="text-2xl font-bold">%</span></div>
                      <p className="mt-1 text-sm text-white/85">{executiveMetrics.completed} of {executiveMetrics.total} tasks completed</p>
                    </div>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20"><Gauge className="h-6 w-6" /></div>
                  </div>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/15"><div className="h-full rounded-full bg-slate-950" style={{ width: `${executiveMetrics.completionRate}%` }} /></div>
                </div>

                <div className="grid grid-cols-3 gap-2.5 md:hidden">
                  {[
                    { label: "Active", value: executiveMetrics.active, icon: Layers3, style: "text-slate-950" },
                    { label: "At risk", value: executiveRiskTasks.length, icon: TriangleAlert, style: "text-amber-800" },
                    { label: "People", value: members.length, icon: Users, style: "text-slate-950" },
                  ].map(({ label, value, icon: Icon, style }) => (
                    <div key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 ${style}`}><Icon className="h-3.5 w-3.5" />{label}</div>
                      <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:hidden">
                  <div className="mb-4 flex items-center justify-between">
                    <div><h2 className="text-base font-bold text-slate-950">Delivery health</h2><p className="mt-0.5 text-xs text-slate-500">Task status at a glance</p></div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{executiveMetrics.total} total</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                    {(["In progress", "To do", "Waiting", "Completed"] as TaskStatus[]).map((status) => {
                      const count = tasks.filter((task) => task.status === status).length;
                      const percentage = executiveMetrics.total ? Math.round((count / executiveMetrics.total) * 100) : 0;
                      const barTone = status === "Completed" ? "bg-emerald-600" : status === "In progress" ? "bg-sky-500" : status === "Waiting" ? "bg-violet-500" : "bg-slate-400";
                      return (
                        <div key={status} className="min-w-0">
                          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs"><span className="truncate font-semibold text-slate-700">{status}</span><span className="shrink-0 font-bold text-slate-950">{count}</span></div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${barTone}`} style={{ width: `${percentage}%` }} /></div>
                          <div className="mt-1 text-[10px] text-slate-400">{percentage}% of tasks</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:hidden">
                  <div className="mb-3 flex items-center justify-between">
                    <div><h2 className="text-base font-bold text-slate-950">Needs attention</h2><p className="mt-0.5 text-xs text-slate-500">Urgent and overdue work</p></div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${executiveRiskTasks.length ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{executiveRiskTasks.length ? `${executiveRiskTasks.length} items` : "All clear"}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {executiveRiskTasks.slice(0, 4).map((task) => (
                      <button key={task.supabaseId} type="button" onClick={() => openTask(task)} className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${formatTaskDueDate(task.due).overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}><TriangleAlert className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{task.title}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{formatTaskDueDate(task.due).overdue ? "Overdue" : "Urgent"} · {task.assignee}</span></span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>
                    ))}
                    {!executiveRiskTasks.length && <div className="py-5 text-center text-sm text-slate-500">No urgent or overdue tasks right now.</div>}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:hidden">
                  <div className="mb-3"><h2 className="text-base font-bold text-slate-950">Team workload</h2><p className="mt-0.5 text-xs text-slate-500">Active assignments by person</p></div>
                  <div className="divide-y divide-slate-100">
                    {teamWorkload.slice(0, 5).map((member) => (
                      <div key={member.id} className="flex items-center gap-3 py-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-900">{member.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
                        <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-800">{member.name}</div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${member.activeTasks >= 5 ? "bg-rose-500" : member.activeTasks >= 3 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${Math.min(100, member.activeTasks * 20)}%` }} /></div></div>
                        <div className="shrink-0 text-xs font-bold text-slate-600">{member.activeTasks} active</div>
                      </div>
                    ))}
                    {!teamWorkload.length && <div className="py-5 text-center text-sm text-slate-500">Team workload will appear after members are added.</div>}
                  </div>
                </div>

                <div className="hidden gap-4 sm:grid-cols-2 xl:grid-cols-4 md:grid">
                  {executiveMetricCards.map((metric) => (
                    <div key={metric.label} className={`rounded-2xl border border-slate-200 p-5 ${metric.tone}`}>
                      <div className="text-xs font-semibold opacity-75">{metric.label}</div>
                      <div className="mt-4 text-4xl font-black tracking-[-0.06em]">{metric.value}</div>
                      <div className="mt-3 text-xs opacity-70">{metric.note}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 hidden gap-6 xl:grid-cols-[1.2fr_0.8fr] md:grid">
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

                <div className="mt-6 hidden rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 md:block">
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
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800">Work queue</div>
                    <h1 className="mt-1 text-3xl font-black tracking-[-0.06em] text-slate-950 sm:text-3xl">{view === "my-tasks" ? "My tasks" : "All tasks"}</h1>
                    <p className="mt-1 text-sm text-slate-600">{filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"} match your view</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="hidden rounded-xl border border-slate-200 bg-white p-1 sm:inline-flex">
                      <button type="button" onClick={() => setTaskLayout("list")} aria-pressed={taskLayout === "list"} className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold ${taskLayout === "list" ? "bg-slate-950 text-white" : "text-slate-600"}`}>List</button>
                      <button type="button" onClick={() => setTaskLayout("kanban")} aria-pressed={taskLayout === "kanban"} className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold ${taskLayout === "kanban" ? "bg-slate-950 text-white" : "text-slate-600"}`}><KanbanSquare className="h-3.5 w-3.5" /> Kanban</button>
                    </div>
                    {canManageModule("tasks") && <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 self-start rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(16,185,129,0.16)]">
                      <Plus className="h-4 w-4" /> New task
                    </button>}
                  </div>
                </div>

                <div className="mb-3 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  <div className="flex min-w-max gap-2 pb-1" role="group" aria-label="Filter tasks by status">
                    {[{ label: "All tasks", value: "all" }, ...(["To do", "In progress", "Waiting", "Completed"] as TaskStatus[]).map((status) => ({ label: status, value: status }))].map((filter) => {
                      const count = filter.value === "all" ? tasks.length : tasks.filter((task) => task.status === filter.value).length;
                      const selected = statusFilter === filter.value;
                      return (
                        <button key={filter.value} type="button" onClick={() => setStatusFilter(filter.value)} aria-pressed={selected} className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 ${selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300"}`}>
                          {filter.label}<span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 sm:p-3 md:flex md:items-center">
                  <label className="col-span-2 flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-500 md:flex-1">
                    <Search className="h-4 w-4" />
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      aria-label="Search tasks, clients or teams"
                      className="w-full border-0 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-500 md:text-sm"
                      placeholder="Filter tasks, clients or teams..."
                    />
                  </label>
                  <div className="flex min-h-11 items-center px-1 text-xs text-slate-600 md:hidden" aria-live="polite">{filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"} shown</div>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className="hidden min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none md:block">
                    <option value="all">All statuses</option>
                    <option value="To do">To do</option>
                    <option value="In progress">In progress</option>
                    <option value="Waiting">Waiting</option>
                    <option value="Completed">Completed</option>
                  </select>
                  <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} aria-label="Filter by priority" className="min-h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:px-3">
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
                        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{currentRole === "client" ? "Client portal" : view === "projects" ? "Project workspace" : "Workspace directory"}</div>
                    <h1 className="mt-1 text-3xl font-black tracking-[-0.06em] text-slate-950">{pageTitle}</h1>
                        <p className="mt-1 text-sm text-slate-600">{view === "projects" ? currentRole === "client" ? "Projects shared with your organization. Open a project to view its progress and milestones." : `${projects.length} ${projects.length === 1 ? "project" : "projects"} · open a project for tasks and milestones.` : "Manage the people and structure connected to this organization."}</p>
                  </div>
                  {canManageModule(view) && <form onSubmit={handleManagementSubmit} className="hidden w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:flex md:w-auto md:flex-row md:items-center">
                    <input value={managementName} onChange={(event) => setManagementName(event.target.value)} required aria-label={view === "projects" ? "Project name" : view === "team" ? "Employee name" : view === "clients" ? "Client name" : "Department name"} placeholder={view === "team" ? "Employee name" : view === "clients" ? "Client name" : view === "projects" ? "Project name" : "Department name"} className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:min-h-0 md:py-2.5 md:text-sm" />
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
                          <legend className="px-1 text-xs font-semibold text-slate-600">Departments · select any</legend>
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
                        <select aria-label="Project client" value={managementDepartmentId} onChange={(event) => setManagementDepartmentId(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:min-h-0 md:py-2.5 md:text-sm">
                          <option value="">No client</option>
                          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                        </select>
                        <input type="date" value={projectStartDate} onChange={(event) => setProjectStartDate(event.target.value)} aria-label="Project start date" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:min-h-0 md:py-2.5 md:text-sm" />
                        <input type="date" value={projectTargetDate} onChange={(event) => setProjectTargetDate(event.target.value)} aria-label="Project target date" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:min-h-0 md:py-2.5 md:text-sm" />
                      </>
                    )}
                    <button disabled={managementBusy} type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 md:min-h-0"><Plus className="h-4 w-4" /> Add</button>
                  </form>}
                  {(view === "projects" || view === "team" || view === "clients" || view === "departments") && canManageModule(view) && (
                    <button type="button" onClick={() => view === "projects" ? setShowMobileProjectForm((current) => !current) : setShowMobileDirectoryForm((current) => !current)} aria-expanded={view === "projects" ? showMobileProjectForm : showMobileDirectoryForm} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 md:hidden">
                      <Plus className="h-4 w-4" /> {view === "projects" ? (showMobileProjectForm ? "Close project form" : "New project") : (showMobileDirectoryForm ? "Close form" : view === "team" ? "Add employee" : view === "clients" ? "Add client" : "Add department")}
                    </button>
                  )}
                </div>

                {view === "projects" && showMobileProjectForm && canManageModule("projects") && (
                  <form onSubmit={handleManagementSubmit} className="mb-4 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:hidden">
                    <input value={managementName} onChange={(event) => setManagementName(event.target.value)} required aria-label="Project name" placeholder="Project name" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" />
                    <select aria-label="Project client" value={managementDepartmentId} onChange={(event) => setManagementDepartmentId(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                      <option value="">No client</option>
                      {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-semibold text-slate-700">Start date<input type="date" value={projectStartDate} onChange={(event) => setProjectStartDate(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label>
                      <label className="text-xs font-semibold text-slate-700">Target date<input type="date" value={projectTargetDate} onChange={(event) => setProjectTargetDate(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label>
                    </div>
                    <button disabled={managementBusy} type="submit" className="min-h-12 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60">{managementBusy ? "Adding…" : "Add project"}</button>
                  </form>
                )}

                {(view === "team" || view === "clients" || view === "departments") && showMobileDirectoryForm && canManageModule(view) && (
                  <form onSubmit={handleManagementSubmit} className="mb-4 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:hidden">
                    <label className="text-xs font-semibold text-slate-600">
                      {view === "team" ? "Employee name" : view === "clients" ? "Client or company name" : "Department name"}
                      <input value={managementName} onChange={(event) => setManagementName(event.target.value)} required aria-label={view === "team" ? "Employee name" : view === "clients" ? "Client name" : "Department name"} placeholder={view === "team" ? "Full name" : view === "clients" ? "Company or client name" : "Department name"} className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" />
                    </label>
                    {view === "team" && (
                      <>
                        <label className="text-xs font-semibold text-slate-600">Login email<input value={managementEmail} onChange={(event) => setManagementEmail(event.target.value)} required type="email" autoComplete="email" placeholder="name@example.com" className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label>
                        <label className="text-xs font-semibold text-slate-600">Temporary password<input value={managementPassword} onChange={(event) => setManagementPassword(event.target.value)} required minLength={8} type="password" autoComplete="new-password" placeholder="At least 8 characters" className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label>
                        <label className="text-xs font-semibold text-slate-600">Built-in role
                          <select value={managementRole} onChange={(event) => setManagementRole(event.target.value as WorkspaceMember["role"])} className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                            <option value="employee">Employee</option><option value="supervisor">Supervisor</option><option value="manager">Manager</option><option value="admin">Admin</option>
                          </select>
                        </label>
                        {canAssignCustomRoles && <label className="text-xs font-semibold text-slate-600">Access profile
                          <select value={managementCustomRoleId} onChange={(event) => setManagementCustomRoleId(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                            <option value="">Built-in permissions</option>{workspaceRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                          </select>
                        </label>}
                        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <legend className="px-1 text-xs font-semibold text-slate-600">Departments · select any</legend>
                          <div className="max-h-36 space-y-1 overflow-y-auto">
                            {departments.length ? departments.map((department) => (
                              <label key={department.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-700">
                                <input type="checkbox" checked={managementDepartmentIds.includes(department.id)} onChange={() => toggleManagementDepartment(department.id)} className="h-4 w-4 accent-emerald-700" />
                                {department.name}
                              </label>
                            )) : <span className="text-sm text-slate-500">Add a department first.</span>}
                          </div>
                        </fieldset>
                      </>
                    )}
                    {view === "clients" && (
                      <>
                        <label className="text-xs font-semibold text-slate-600">Portal login email<input value={managementEmail} onChange={(event) => setManagementEmail(event.target.value)} required type="email" autoComplete="email" placeholder="client@example.com" className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label>
                        <label className="text-xs font-semibold text-slate-600">Temporary password<input value={managementPassword} onChange={(event) => setManagementPassword(event.target.value)} required minLength={8} type="password" autoComplete="new-password" placeholder="At least 8 characters" className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label>
                        {canAssignCustomRoles && <label className="text-xs font-semibold text-slate-600">Portal access profile
                          <select value={managementCustomRoleId} onChange={(event) => setManagementCustomRoleId(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                            <option value="">Client defaults</option>{workspaceRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                          </select>
                        </label>}
                      </>
                    )}
                    <button disabled={managementBusy} type="submit" className="min-h-12 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60">{managementBusy ? "Saving…" : view === "team" ? "Create employee login" : view === "clients" ? "Create client portal" : "Add department"}</button>
                  </form>
                )}

                {(view === "team" || view === "clients" || view === "departments") && (
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                    <label className="relative block min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input type="search" value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} placeholder={view === "team" ? "Search employees, emails, departments" : view === "clients" ? "Search clients, portal emails, projects" : "Search departments"} aria-label={view === "team" ? "Search employees" : view === "clients" ? "Search clients" : "Search departments"} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" />
                    </label>
                    {view === "team" && (
                      <>
                        <select value={employeeRoleFilter} onChange={(event) => setEmployeeRoleFilter(event.target.value)} aria-label="Filter employees by role" className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                          <option value="all">All roles</option><option value="employee">Employees</option><option value="supervisor">Supervisors</option><option value="manager">Managers</option><option value="admin">Admins</option>
                        </select>
                        <select value={employeeDepartmentFilter} onChange={(event) => setEmployeeDepartmentFilter(event.target.value)} aria-label="Filter employees by department" className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                          <option value="all">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                        </select>
                      </>
                    )}
                    <div className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
                      {view === "team" ? `${filteredDirectoryMembers.length} of ${members.length} employees` : view === "clients" ? `${filteredDirectoryClients.length} of ${clients.length} clients` : `${filteredDirectoryDepartments.length} of ${departments.length} departments`}
                    </div>
                  </div>
                )}

                {view === "departments" && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredDirectoryDepartments.length ? filteredDirectoryDepartments.map((department) => {
                      const departmentMembers = members.filter((member) => member.departmentIds.includes(department.id));
                      return (
                        <article key={department.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700"><FolderKanban className="h-5 w-5" /></div>
                            <div className="min-w-0 flex-1"><h2 className="break-words font-bold text-slate-900">{department.name}</h2><p className="mt-0.5 text-xs text-slate-500">{departmentMembers.length} {departmentMembers.length === 1 ? "employee" : "employees"}</p></div>
                            {canManageModule("departments") && <button type="button" disabled={managementBusy} onClick={() => void handleDeleteDepartment(department)} aria-label={`Delete ${department.name} department`} title="Delete department" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}
                          </div>
                          {departmentMembers.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{departmentMembers.slice(0, 4).map((member) => <span key={member.id} className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{member.name}</span>)}{departmentMembers.length > 4 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">+{departmentMembers.length - 4}</span>}</div>}
                        </article>
                      );
                    }) : directorySearch ? <EmptyDirectory label="matching departments" /> : <EmptyDirectory label="departments" />}
                  </div>
                )}

                {view === "team" && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    {filteredDirectoryMembers.length ? (
                      <>
                      <div className="divide-y divide-slate-100 md:hidden">
                        {filteredDirectoryMembers.map((member) => {
                          const departmentNames = member.departmentIds
                            .map((departmentId) => departments.find((department) => department.id === departmentId)?.name)
                            .filter((name): name is string => Boolean(name));
                          const customRoleName = workspaceRoles.find((role) => role.id === member.customRoleId)?.name;
                          return (
                            <article key={member.id} className="p-4">
                              <div className="flex items-start gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">{member.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</div>
                                <div className="min-w-0 flex-1">
                                  <h2 className="break-words text-sm font-bold text-slate-900">{member.name}</h2>
                                  <p className="mt-0.5 break-all text-xs text-slate-500">{member.email}</p>
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">{memberRoleLabels[member.role]}</span>
                                    {customRoleName && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-800">{customRoleName}</span>}
                                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${member.availabilityStatus === "available" ? "bg-sky-50 text-sky-800" : "bg-amber-50 text-amber-800"}`}>{member.availabilityStatus === "leave" ? "On leave" : member.availabilityStatus}</span>
                                  </div>
                                  <p className="mt-2 text-xs text-slate-500">{departmentNames.length ? departmentNames.join(" · ") : "No department"}</p>
                                </div>
                                <button type="button" onClick={() => handleEditMember(member)} aria-label={`Edit ${member.name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700"><Pencil className="h-4 w-4" /></button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                      <div className="hidden overflow-x-auto md:block">
                        <table className="min-w-[720px] w-full text-left">
                          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                            <tr><th className="px-5 py-3 font-bold">Employee</th><th className="px-5 py-3 font-bold">Email</th><th className="px-5 py-3 font-bold">Role / access profile</th><th className="px-5 py-3 font-bold">Department</th><th className="px-5 py-3 font-bold">Availability</th><th className="px-5 py-3 text-right font-bold">Action</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredDirectoryMembers.map((member) => (
                              <tr key={member.id} className="text-sm text-slate-700">
                                <td className="px-5 py-4 font-semibold text-slate-900">{member.name}</td>
                                <td className="px-5 py-4 break-all">{member.email}</td>
                                <td className="px-5 py-4"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">{memberRoleLabels[member.role]}</span>{workspaceRoles.find((role) => role.id === member.customRoleId) && <div className="mt-1 text-xs text-slate-500">{workspaceRoles.find((role) => role.id === member.customRoleId)?.name}</div>}</td>
                                <td className="px-5 py-4">{member.departmentIds.length ? member.departmentIds.map((departmentId) => departments.find((department) => department.id === departmentId)?.name).filter((name): name is string => Boolean(name)).join(", ") : "No department"}</td>
                                <td className="px-5 py-4 capitalize">{member.availabilityStatus.replace("_", " ")}</td>
                                <td className="px-5 py-4 text-right"><button type="button" onClick={() => handleEditMember(member)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:text-emerald-700"><Pencil className="h-3.5 w-3.5" /> Edit</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      </>
                    ) : members.length ? <div className="p-8 text-center text-sm text-slate-500">No employees match these search or filter settings.</div> : <EmptyDirectory label="employees" />}
                  </div>
                )}

                {view === "clients" && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredDirectoryClients.length ? filteredDirectoryClients.map((client) => {
                      const projectCount = projects.filter((project) => project.clientId === client.id).length;
                      const portalRole = workspaceRoles.find((role) => role.id === client.customRoleId);
                      return (
                        <article key={client.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                          <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><BriefcaseBusiness className="h-5 w-5" /></div>
                            <div className="min-w-0 flex-1">
                              <h2 className="break-words font-bold text-slate-900">{client.name}</h2>
                              <p className="mt-1 break-all text-xs text-slate-500">{client.contactEmail || "No portal email"}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${client.userId ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{client.userId ? "Portal active" : "No portal login"}</span>
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                            <span className="text-xs text-slate-500">{projectCount} {projectCount === 1 ? "project" : "projects"}</span>
                            {client.userId && <span className="text-xs font-medium text-slate-600">{portalRole?.name ?? "Client default access"}</span>}
                          </div>
                          {client.userId && canAssignCustomRoles && (
                            <label className="mt-3 block text-xs font-semibold text-slate-600">
                              Portal access profile
                              <select value={client.customRoleId ?? ""} onChange={(event) => { if (client.userId) void handleAssignCustomRole(client.userId, event.target.value); }} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-700">
                                <option value="">Client defaults</option>
                                {workspaceRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                              </select>
                            </label>
                          )}
                        </article>
                      );
                    }) : clients.length ? <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No clients match your search.</div> : <EmptyDirectory label="clients" />}
                  </div>
                )}

                {view === "projects" && (
                  <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
                    {projects.length ? projects.map((project) => {
                      const projectTasks = tasks.filter((task) => task.project === project.name);
                      const completedTasks = projectTasks.filter((task) => task.status === "Completed").length;
                      const completion = projectTasks.length ? Math.round((completedTasks / projectTasks.length) * 100) : 0;
                      const clientName = clients.find((client) => client.id === project.clientId)?.name ?? "Internal project";
                      return (
                        <button key={project.id} type="button" disabled={projectDetailBusy} onClick={() => void openProjectDetails(project)} aria-label={`Open project ${project.name}`} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:p-5">
                          <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><BarChart3 className="h-5 w-5" aria-hidden="true" /></div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="line-clamp-2 text-base font-bold leading-5 text-slate-950">{project.name}</h3>
                                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">{project.status ?? "Active"}</span>
                              </div>
                              <p className="mt-1 truncate text-xs text-slate-600">{clientName}</p>
                            </div>
                          </div>
                          <div className="mt-4 flex items-end justify-between gap-3">
                            <div>
                              <div className="text-2xl font-black tracking-tight text-slate-950">{projectTasks.length}</div>
                              <div className="text-xs text-slate-600">tasks · {completedTasks} done</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-emerald-800">{completion}%</div>
                              <div className="text-[10px] text-slate-600">complete</div>
                            </div>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${project.name} completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}>
                            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${completion}%` }} />
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600">
                            <span className="truncate">{project.targetDate ? `Target ${project.targetDate}` : "No target date"}</span>
                            <span className="shrink-0 font-semibold text-emerald-800">{projectDetailBusy ? "Loading…" : "Details →"}</span>
                          </div>
                        </button>
                      );
                    }) : <EmptyDirectory label="projects" />}
                  </div>
                )}
              </div>
            )}

            {view === "notifications" && (
              <section>
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Workspace updates</div>
                    <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900">Notifications</h1>
                    <p className="mt-2 text-sm text-slate-500">{notifications.filter((notification) => !notification.isRead).length} unread · latest workspace activity</p>
                  </div>
                  <button type="button" disabled={!notifications.some((notification) => !notification.isRead)} onClick={() => void markAllNotificationsRead()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                    <Check className="h-4 w-4" /> Mark all read
                  </button>
                </div>
                <div role="group" aria-label="Filter notifications" className="mb-4 flex gap-2">
                  {(["all", "unread"] as const).map((filter) => (
                    <button key={filter} type="button" onClick={() => setNotificationFilter(filter)} aria-pressed={notificationFilter === filter} className={`min-h-11 rounded-xl px-4 text-sm font-semibold capitalize ${notificationFilter === filter ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
                      {filter === "all" ? `All · ${notifications.length}` : `Unread · ${notifications.filter((notification) => !notification.isRead).length}`}
                    </button>
                  ))}
                </div>
                <div className="space-y-3">
                  {filteredNotifications.length ? filteredNotifications.map((notification) => (
                    <button key={notification.id} type="button" onClick={() => void markNotificationRead(notification)} aria-label={`${notification.isRead ? "Read" : "Mark read"} notification: ${notification.title}`} className={`flex min-h-24 w-full items-start gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${notification.isRead ? "border-slate-200 bg-white" : "border-emerald-200 bg-emerald-50/60"}`}>
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${notification.isRead ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}><Bell className="h-4 w-4" /></div>
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
                      <h2 className="mt-4 text-lg font-bold text-slate-900">{notificationFilter === "unread" ? "You’re all caught up" : "No notifications yet"}</h2>
                      <p className="mt-1 text-sm text-slate-500">{notificationFilter === "unread" ? "There are no unread updates." : "New workspace activity will appear here."}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {view === "notes" && (
              <section>
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-amber-600">Personal workspace</div>
                    <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900">Sticky notes</h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-500">Quick reminders and hand-offs, ready to edit or share.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800">{notes.length} {notes.length === 1 ? "note" : "notes"}</div>
                    {canManageModule("notes") && <button type="button" onClick={() => setShowNoteComposer((current) => !current)} aria-expanded={showNoteComposer} aria-controls="sticky-note-composer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white md:hidden"><Plus className="h-4 w-4" />{showNoteComposer ? "Close editor" : "New note"}</button>}
                  </div>
                </div>

                {canManageModule("notes") && <form id="sticky-note-composer" onSubmit={handleCreateNote} className={`${showNoteComposer ? "block" : "hidden"} relative mb-5 min-h-60 overflow-hidden rounded-sm border p-4 pt-7 shadow-[0_14px_28px_rgba(15,23,42,0.12)] transition-transform md:block sm:p-6 sm:pt-8 ${noteColor === "yellow" ? "rotate-[-0.6deg] border-amber-200 bg-amber-100" : noteColor === "blue" ? "rotate-[0.5deg] border-sky-200 bg-sky-100" : noteColor === "green" ? "rotate-[-0.4deg] border-emerald-200 bg-emerald-100" : "rotate-[0.6deg] border-pink-200 bg-pink-100"}`}>
                  <span aria-hidden="true" className="absolute left-1/2 top-0 h-5 w-24 -translate-x-1/2 -translate-y-1/2 rotate-[-3deg] bg-white/70 shadow-sm" />
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><StickyNote className="h-4 w-4 text-amber-600" />{editingNoteId ? "Pick up and edit" : "Pin a new note"}</div>
                    <div className="flex items-center gap-2 rounded-full bg-white/55 px-2.5 py-1.5">
                      {(["yellow", "blue", "green", "pink"] as WorkspaceNote["color"][]).map((color) => (
                        <button key={color} type="button" onClick={() => setNoteColor(color)} aria-label={`${color} note`} aria-pressed={noteColor === color} className="flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-800"><span aria-hidden="true" className={`h-4 w-4 rounded-full ${color === "yellow" ? "bg-amber-400" : color === "blue" ? "bg-sky-400" : color === "green" ? "bg-emerald-400" : "bg-pink-400"} ${noteColor === color ? "ring-2 ring-slate-800 ring-offset-2 ring-offset-transparent" : ""}`} /></button>
                      ))}
                    </div>
                  </div>
                  <input value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} aria-label="Note title" placeholder="Add a short title…" className="min-h-11 w-full border-0 border-b border-black/10 bg-transparent px-0 py-2 text-base font-bold text-slate-900 outline-none placeholder:text-slate-500/70 focus:border-slate-500" />
                  <textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} required rows={4} aria-label="Note text" placeholder="Jot down a reminder, idea or hand-off…" className="mt-3 w-full resize-y border-0 bg-transparent px-0 py-2 text-base leading-6 text-slate-800 outline-none placeholder:text-slate-500/70" />
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[11px] font-medium text-slate-600">{editingNoteId ? "Changes stay here until you save." : "Your note will be pinned to this wall."}</span>
                    <div className="flex gap-2 sm:shrink-0">
                      {editingNoteId && <button type="button" onClick={() => { setEditingNoteId(null); setNoteTitle(""); setNoteBody(""); setNoteColor("yellow"); setShowNoteComposer(false); setSyncMessage(""); }} className="min-h-11 flex-1 rounded-lg bg-white/70 px-3 text-sm font-semibold text-slate-700 sm:flex-none">Cancel</button>}
                      <button disabled={noteBusy} type="submit" className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60 sm:flex-none">{!editingNoteId && <Plus className="h-4 w-4" />}{noteBusy ? "Saving…" : editingNoteId ? "Save changes" : "Pin note"}</button>
                    </div>
                  </div>
                </form>}

                {notes.length > 0 && (
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                    <label className="relative block min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input value={noteSearch} onChange={(event) => setNoteSearch(event.target.value)} placeholder="Search notes" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-amber-400" />
                    </label>
                    <div role="group" aria-label="Filter sticky notes by color" className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
                      {(["all", "yellow", "blue", "green", "pink"] as const).map((color) => (
                        <button key={color} type="button" onClick={() => setNoteColorFilter(color)} aria-pressed={noteColorFilter === color} className={`min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold capitalize ${noteColorFilter === color ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{color === "all" ? "All notes" : color}</button>
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
                            <button type="button" onClick={() => startEditingNote(note)} aria-label={`Edit ${note.title || "note"}`} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white/70 hover:text-slate-900"><Pencil className="h-4 w-4" /></button>
                            <button type="button" onClick={() => void handleDeleteNote(note)} aria-label={`Delete ${note.title || "note"}`} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white/70 hover:text-rose-600"><X className="h-4 w-4" /></button>
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
                              <button key={color} type="button" onClick={() => void handleNoteColorChange(note, color)} aria-label={`Change note color to ${color}`} aria-pressed={note.color === color} className="flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-800"><span aria-hidden="true" className={`h-3.5 w-3.5 rounded-full ${color === "yellow" ? "bg-amber-300" : color === "blue" ? "bg-sky-300" : color === "green" ? "bg-emerald-300" : "bg-pink-300"} ${note.color === color ? "ring-2 ring-slate-700 ring-offset-1" : ""}`} /></button>
                            ))}
                            {canManageModule("notes") && note.authorId === user?.id && <button type="button" onClick={() => setSharingNote(note)} aria-label={`Share ${note.title || "note"}`} className="ml-1 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-white/80 px-3 text-xs font-semibold text-slate-700 transition hover:bg-white"><Share2 className="h-4 w-4" /> Share</button>}
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
              <section className="mx-auto max-w-3xl pb-4">
                <div className="mb-5">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Account preferences</div>
                  <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900">Settings</h1>
                  <p className="mt-2 text-sm text-slate-500">Personal preferences and workspace details.</p>
                </div>
                <form onSubmit={handleProfileSave} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-sm font-black text-emerald-800">{profileName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "U"}</div>
                    <div className="min-w-0"><div className="truncate font-bold text-slate-900">{profileName || "Workspace member"}</div><div className="break-all text-sm text-slate-500">{user.email}</div></div>
                  </div>
                  <label htmlFor="profile-display-name" className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Display name</label>
                  <input id="profile-display-name" value={profileName} onChange={(event) => setProfileName(event.target.value)} required autoComplete="name" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" />
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <div className="font-semibold text-slate-800">Workspace role</div>
                    <div className="mt-1 capitalize">{currentRole ?? "Member"}</div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div><div className="text-sm font-semibold text-slate-800">Dark mode</div><div className="mt-1 text-xs text-slate-500">Optimized for low-light field work.</div></div>
                    <button type="button" onClick={() => setDarkMode((current) => !current)} aria-label="Dark mode" aria-pressed={darkMode} className={`relative h-8 w-14 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 ${darkMode ? "bg-emerald-600" : "bg-slate-300"}`}><span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${darkMode ? "left-7" : "left-1"}`} /></button>
                  </div>
                  <div className="mt-5 flex justify-end">
                    <button disabled={settingsBusy} type="submit" className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">{settingsBusy ? "Saving…" : "Save settings"}</button>
                  </div>
                </form>
                {canManageModule("settings") && (
                  <form onSubmit={handleOrganizationSave} className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                    <div className="mb-5"><h2 className="text-lg font-bold text-slate-900">Organization profile</h2><p className="mt-1 text-sm text-slate-500">Keep the workspace identity and operating timezone current.</p></div>
                    <div className="space-y-4">
                      <label className="block text-xs font-semibold text-slate-600">Organization name<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} required className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label>
                      <label className="block text-xs font-semibold text-slate-600">Website<input value={organizationWebsite} onChange={(event) => setOrganizationWebsite(event.target.value)} type="url" inputMode="url" placeholder="https://example.com" className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label>
                      <label className="block text-xs font-semibold text-slate-600">Timezone<select value={organizationTimezone} onChange={(event) => setOrganizationTimezone(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><option>UTC</option><option>Asia/Manila</option><option>Asia/Singapore</option><option>Asia/Tokyo</option><option>America/New_York</option><option>America/Los_Angeles</option><option>Europe/London</option></select></label>
                    </div>
                    <div className="mt-5 flex justify-end"><button disabled={settingsBusy} type="submit" className="min-h-12 w-full rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">{settingsBusy ? "Saving…" : "Save organization"}</button></div>
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
                              <div className="text-xs text-slate-500">{role.description || "No description"} · {members.filter((member) => member.customRoleId === role.id).length + clients.filter((client) => client.customRoleId === role.id).length} assignments across employees and client portals</div>
                            </div>
                            <button type="button" onClick={() => handleEditWorkspaceRole(role)} className="min-h-11 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700">Edit</button>
                            <button type="button" onClick={() => void handleDeleteWorkspaceRole(role)} className="min-h-11 rounded-lg border border-rose-100 px-4 text-xs font-semibold text-rose-700">Delete</button>
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
                        <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_5rem] bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:grid-cols-[minmax(0,1fr)_5rem_5rem]">
                          <span>Module</span><span className="text-center">View</span><span className="text-center">Manage</span>
                        </div>
                        {roleModules.map(({ id, label }) => {
                          const access = rolePermissions[id] ?? { view: false, manage: false };
                          return (
                            <div key={id} className="grid min-h-12 grid-cols-[minmax(0,1fr)_4.5rem_5rem] items-center border-t border-slate-100 px-3 py-1 text-sm sm:grid-cols-[minmax(0,1fr)_5rem_5rem]">
                              <span className="font-medium text-slate-700">{label}</span>
                              <label className="flex min-h-11 cursor-pointer items-center justify-center" aria-label={`View ${label}`}>
                                <input type="checkbox" checked={access.view || access.manage} onChange={(event) => setRolePermissions((current) => ({
                                  ...current,
                                  [id]: { ...access, view: event.target.checked || access.manage },
                                }))} className="h-5 w-5 accent-emerald-700" />
                              </label>
                              <label className="flex min-h-11 cursor-pointer items-center justify-center" aria-label={`Manage ${label}`}>
                                <input type="checkbox" checked={access.manage} onChange={(event) => setRolePermissions((current) => ({
                                  ...current,
                                  [id]: { view: event.target.checked || access.view, manage: event.target.checked },
                                }))} className="h-5 w-5 accent-emerald-700" />
                              </label>
                            </div>
                          );
                        })}
                      </div>
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
        {visibleNavItems.filter(({ id }) => id !== "all-tasks").slice(0, 4).map(({ label, id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleViewChange(id)}
            aria-current={view === id ? "page" : undefined}
            className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[10px] font-medium transition ${
              view === id ? "bg-emerald-600 text-white" : "text-slate-300"
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950`}
          >
            <Icon className="h-4 w-4" />
            <span className="mt-1 max-w-full truncate leading-none">{id === "dashboard" ? "Home" : label === "My tasks" ? "Tasks" : id === "team" ? "Team" : id === "executive" ? "Exec" : label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open all pages"
          aria-expanded={mobileNavOpen}
          aria-haspopup="dialog"
          className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[10px] font-medium transition ${
            mobileNavOpen || !visibleNavItems.filter(({ id }) => id !== "all-tasks").slice(0, 4).some(({ id }) => id === view)
              ? "bg-emerald-600 text-white"
              : "text-slate-300"
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950`}
        >
          <Menu className="h-4 w-4" />
          <span className="mt-1 leading-none">More</span>
        </button>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <button type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
          <aside className="relative flex h-full w-[min(86vw,22rem)] flex-col overflow-y-auto bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] shadow-2xl">
            <div className="mb-8 flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <Image src="/logo.png" alt="Rigtech Engineering" width={900} height={900} className="h-16 w-16 object-contain" />
                <div>
                  <div className="text-sm font-bold text-slate-900">Rigtech</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">Operations</div>
                </div>
              </div>
              <button ref={mobileNavCloseRef} type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
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
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-800">{userName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div>
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
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setSharingNote(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="share-note-dialog-title" onClick={(event) => event.stopPropagation()} className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Share note</div>
                <h2 id="share-note-dialog-title" className="mt-1 break-words text-xl font-black tracking-[-0.04em] text-slate-900">{sharingNote.title || "Untitled note"}</h2>
                <p className="mt-2 line-clamp-3 break-words text-sm text-slate-500">{sharingNote.body}</p>
              </div>
              <button ref={shareNoteCloseRef} type="button" onClick={() => setSharingNote(null)} aria-label="Close share dialog" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-6">
              <h3 className="text-sm font-bold text-slate-900">Share outside Rigtech</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => void handleShareExternally(sharingNote)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-semibold text-white"><Share2 className="h-4 w-4" /> Share from device</button>
                <button type="button" onClick={() => void handleCopyNote(sharingNote)} className="min-h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">Copy note text</button>
              </div>
            </div>
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900">Share within workspace</h3>
                <span className="text-xs text-slate-400">{members.length} members</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Choose a person and they will see this note in their Sticky notes view.</p>
              <div className="mt-3 max-h-[40dvh] space-y-2 overflow-y-auto overscroll-contain">
                {members.filter((member) => member.id !== user?.id).map((member) => (
                  <button key={member.id} type="button" disabled={shareBusy} onClick={() => void handleShareInternally(sharingNote, member)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60">
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-detail-title"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
            className="absolute right-0 top-0 h-[100dvh] w-full max-w-3xl overflow-y-auto border-slate-200 bg-white px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] shadow-2xl sm:border-l sm:p-7"
          >
            <div className="mb-6 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-700">Project details</div>
                <h2 id="project-detail-title" className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-950">{selectedProject.project.name}</h2>
                <p className="mt-2 text-sm text-slate-500">{selectedProject.project.description || "No project description yet."}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canManageModule("projects") && (
                  <>
                    <button type="button" disabled={projectDetailBusy} onClick={() => setEditingProject((current) => !current)} aria-label={editingProject ? "Cancel project editing" : "Edit project"} title={editingProject ? "Cancel editing" : "Edit project"} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50">
                      {editingProject ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    </button>
                    <button type="button" disabled={projectDetailBusy} onClick={() => void handleDeleteProject()} aria-label={`Delete project ${selectedProject.project.name}`} title="Delete project" className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
                <button ref={projectDetailCloseRef} type="button" onClick={() => setSelectedProject(null)} aria-label="Close project details" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><X className="h-4 w-4" /></button>
              </div>
            </div>

            {editingProject && canManageModule("projects") && (
              <form onSubmit={handleUpdateProject} className="mb-6 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Project name
                  <input name="name" required maxLength={160} defaultValue={selectedProject.project.name} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" />
                </label>
                <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Description
                  <textarea name="description" rows={3} defaultValue={selectedProject.project.description} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" />
                </label>
                <label className="text-xs font-semibold text-slate-600">Client
                  <select name="client_id" defaultValue={selectedProject.project.clientId ?? ""} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                    <option value="">Internal project</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">Status
                  <select name="status" defaultValue={selectedProject.project.status ?? "active"} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                    <option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">Start date
                  <input name="start_date" type="date" defaultValue={selectedProject.project.startDate ?? ""} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" />
                </label>
                <label className="text-xs font-semibold text-slate-600">Target date
                  <input name="target_date" type="date" defaultValue={selectedProject.project.targetDate ?? ""} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" />
                </label>
                <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
                  <button type="button" disabled={projectDetailBusy} onClick={() => setEditingProject(false)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={projectDetailBusy} className="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-50">{projectDetailBusy ? "Saving…" : "Save project"}</button>
                </div>
              </form>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-950 p-4 text-white"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Tasks</div><div className="mt-2 text-2xl font-black">{selectedProject.tasks.filter((task) => !task.parentTaskId).length}</div><div className="text-xs text-slate-400">{selectedProject.tasks.length} including subtasks</div></div>
              <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-950"><div className="text-[10px] uppercase tracking-[0.14em] text-emerald-700">Completion</div><div className="mt-2 text-2xl font-black">{selectedProject.tasks.length ? Math.round((selectedProject.tasks.filter((task) => task.status === "Completed").length / selectedProject.tasks.length) * 100) : 0}%</div><div className="text-xs text-emerald-700">Based on all project tasks</div></div>
              <div className="rounded-2xl bg-slate-50 p-4 text-slate-900"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Client</div><div className="mt-2 truncate text-lg font-black">{clients.find((client) => client.id === selectedProject.project.clientId)?.name ?? "Internal project"}</div><div className="text-xs text-slate-500">{selectedProject.project.status ?? "Active"}</div></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1.5">Start: {selectedProject.project.startDate ?? "Not set"}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5">Target: {selectedProject.project.targetDate ?? "Not set"}</span>
            </div>

            {currentRole !== "client" && (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-600">Project documents</h3>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">{selectedProject.documents.length}</span>
                  </div>
                  {selectedProject.documents.length ? (
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {selectedProject.documents.map((document) => (
                        <div key={document.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
                          <Files className="h-4 w-4 shrink-0 text-sky-700" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-semibold text-slate-800" title={document.fileName}>{document.fileName}</div>
                            <div className="mt-0.5 text-[10px] text-slate-500">
                              {formatUploadedDate(document.createdAt)} · {document.fileSize < 1024 * 1024 ? `${Math.max(1, Math.round(document.fileSize / 1024))} KB` : `${(document.fileSize / (1024 * 1024)).toFixed(1)} MB`}
                            </div>
                          </div>
                          <button type="button" onClick={() => void openProjectDocument(document)} aria-label={`Download ${document.fileName}`} title="Download document" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-xs text-slate-500">No accessible documents are tagged to this project.</div>}
                </section>

                {canViewModule("stock") && (
                  <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-600">Stock used</h3>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">{projectStockUsage?.size ?? 0} items</span>
                    </div>
                    {projectStockUsage?.size ? (
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {[...projectStockUsage.entries()].map(([stockItemId, item]) => (
                          <div key={stockItemId} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-slate-800">{item.itemName}</div>
                              <div className="mt-0.5 text-[10px] text-slate-500">{item.itemCode}</div>
                            </div>
                            <div className="shrink-0 text-right text-sm font-bold tabular-nums text-slate-900">{new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(item.quantity)} <span className="text-[10px] font-medium text-slate-500">{item.unit}</span></div>
                          </div>
                        ))}
                      </div>
                    ) : <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-xs text-slate-500">No stock issues are linked to this project yet.</div>}
                  </section>
                )}
              </div>
            )}

            <section className="mt-7">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">Milestones</h3><span className="text-xs text-slate-400">{selectedProject.milestones.filter((milestone) => milestone.completedAt).length}/{selectedProject.milestones.length} complete</span></div>
              {currentRole !== "client" && <form onSubmit={addProjectMilestone} className="mb-3 grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
                <input value={milestoneName} onChange={(event) => setMilestoneName(event.target.value)} required aria-label="Milestone name" placeholder="Add milestone" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:min-h-0 md:py-2.5 md:text-sm" />
                <input value={milestoneDueDate} onChange={(event) => setMilestoneDueDate(event.target.value)} type="date" aria-label="Milestone due date" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:min-h-0 md:py-2.5 md:text-sm" />
                <button type="submit" className="min-h-12 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 md:min-h-0">Add milestone</button>
              </form>}
              <div className="space-y-2">
                {selectedProject.milestones.map((milestone) => (
                  currentRole === "client" ? (
                    <div key={milestone.id} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left">
                      <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${milestone.completedAt ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}>{milestone.completedAt ? "✓" : ""}</span>
                      <span className={`min-w-0 flex-1 text-sm font-semibold ${milestone.completedAt ? "text-slate-400 line-through" : "text-slate-800"}`}>{milestone.name}</span>
                      <span className="text-xs text-slate-400">{milestone.dueDate ?? "No date"}</span>
                    </div>
                  ) : (
                    <button key={milestone.id} type="button" onClick={() => void toggleProjectMilestone(milestone)} aria-pressed={Boolean(milestone.completedAt)} aria-label={`${milestone.completedAt ? "Reopen" : "Complete"} milestone ${milestone.name}`} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                      <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${milestone.completedAt ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}>{milestone.completedAt ? "✓" : ""}</span>
                      <span className={`min-w-0 flex-1 text-sm font-semibold ${milestone.completedAt ? "text-slate-400 line-through" : "text-slate-800"}`}>{milestone.name}</span>
                      <span className="text-xs text-slate-400">{milestone.dueDate ?? "No date"}</span>
                    </button>
                  )
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

            {currentRole !== "client" && <>
              <section className="mt-7">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-slate-500">Attachments</h3>
                {selectedProject.attachments.length ? <div className="space-y-2">{selectedProject.attachments.map((attachment) => <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><div className="min-w-0"><div className="truncate text-slate-700">{attachment.fileName}</div><div className="mt-1 text-[11px] text-slate-400">Uploaded {formatUploadedDate(attachment.uploadedAt)}</div></div>{attachment.url && <a href={attachment.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-emerald-700">Open</a>}</div>)}</div> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">No attachments on project tasks.</div>}
              </section>

              <section className="mt-7">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-slate-500">Comments</h3>
                {selectedProject.comments.length ? <div className="space-y-2">{selectedProject.comments.map((comment) => <div key={comment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="text-sm font-semibold text-slate-800">{comment.authorName}</div><div className="mt-1 text-sm text-slate-600">{comment.body}</div></div>)}</div> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">No comments on project tasks.</div>}
              </section>
            </>}
          </motion.aside>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm" onClick={() => setSelectedTask(null)}>
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`Task details: ${selectedTask.title}`}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
            className="absolute right-0 top-0 h-[100dvh] w-full max-w-xl overflow-y-auto border-slate-200 bg-white px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] shadow-2xl sm:border-l sm:p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Task details</div>
              <div className="flex items-center gap-2">
                {canManageModule("tasks") && <button type="button" onClick={() => void handleDeleteTask(selectedTask)} aria-label={`Delete task ${selectedTask.title}`} title="Delete task and subtasks" className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-200 text-rose-600 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600">
                  <Trash2 className="h-4 w-4" />
                </button>}
                <button ref={taskDetailCloseRef} type="button" onClick={() => setSelectedTask(null)} aria-label="Close task details" className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
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
              <input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} readOnly={!canManageModule("tasks")} className="min-h-12 min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-0 text-2xl font-black tracking-[-0.06em] text-slate-900 outline-none focus:border-slate-200 focus:bg-slate-50 focus:px-2 sm:text-3xl" aria-label="Task title" />
              {canManageModule("tasks") && titleDraft.trim() !== selectedTask.title && <button disabled={titleBusy} type="submit" className="mt-1 min-h-11 shrink-0 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-60">{titleBusy ? "Saving…" : "Save"}</button>}
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${getPriorityClasses(selectedTask.priority)}`}>{selectedTask.priority}</span>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${getStatusClasses(selectedTask.status)}`}>{selectedTask.status}</span>
              {canManageModule("tasks") && (
                <select
                  value={selectedTask.status}
                  onChange={(event) => void handleTaskStatusChange(selectedTask, event.target.value as TaskStatus)}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  aria-label="Change task status"
                >
                  {(["To do", "In progress", "Waiting", "Completed"] as TaskStatus[]).map((option) => <option key={option}>{option}</option>)}
                </select>
              )}
            </div>

            {canManageModule("tasks") && (
              <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3" aria-labelledby="task-assignment-heading">
                <div id="task-assignment-heading" className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">Assigned team</div>
                <TaskAssigneeSelect
                  members={members}
                  currentUserId={user?.id ?? ""}
                  selectedIds={taskAssigneeDraft}
                  onSelectionChange={setTaskAssigneeDraft}
                  ariaLabel="Choose task assignees"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-600">{taskAssigneeDraft.length} selected</span>
                  <button
                    type="button"
                    onClick={() => void handleTaskAssigneesSave()}
                    disabled={assigneeBusy || (taskAssigneeDraft.length === selectedTask.assigneeIds.length && taskAssigneeDraft.every((id, index) => id === selectedTask.assigneeIds[index]))}
                    className="min-h-11 rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {assigneeBusy ? "Saving…" : "Save assignments"}
                  </button>
                </div>
              </section>
            )}

            <form onSubmit={handleTaskDescriptionSave} className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Description</div>
              <textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} readOnly={!canManageModule("tasks")} rows={3} placeholder="Add task details, scope or handoff notes..." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-base leading-6 text-slate-700 outline-none placeholder:text-slate-400 sm:text-sm" />
              {canManageModule("tasks") && <div className="mt-2 flex justify-end">
                <button disabled={descriptionBusy} type="submit" className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60">{descriptionBusy ? "Saving…" : "Save description"}</button>
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
                  <input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} required placeholder={subtaskParentId ? "Add a subtask under this item..." : "Add a subtask..."} className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-base outline-none sm:text-sm" />
                  <button disabled={subtaskBusy} type="submit" className="min-h-12 shrink-0 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{subtaskBusy ? "…" : "Add"}</button>
                </div>
                <textarea value={subtaskDescription} onChange={(event) => setSubtaskDescription(event.target.value)} rows={2} placeholder="Optional description..." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-base outline-none placeholder:text-slate-400 sm:text-sm" />
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
                {canManageModule("tasks") && <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:text-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700 focus-within:ring-offset-2">
                  <Paperclip className="h-3.5 w-3.5" /> {attachmentBusy ? "Uploading…" : "Add file"}
                  <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" capture="environment" onChange={handleUploadAttachment} disabled={attachmentBusy} className="sr-only" />
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setEditingMember(null)}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="edit-employee-title" initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(event) => event.stopPropagation()} className="max-h-[96dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="mb-6 flex items-center justify-between">
              <div><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Employee management</div><h2 id="edit-employee-title" className="mt-2 text-2xl font-black tracking-[-0.06em] text-slate-900">Edit employee</h2></div>
              <button ref={editMemberCloseRef} type="button" onClick={() => setEditingMember(null)} aria-label="Close edit employee" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleSaveMember} className="space-y-4">
              <input value={managementMemberName} onChange={(event) => setManagementMemberName(event.target.value)} required aria-label="Full name" placeholder="Full name" className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none" />
              <input value={managementEmail} onChange={(event) => setManagementEmail(event.target.value)} required type="email" aria-label="Login email" placeholder="Login email" className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none" />
              <input value={managementPassword} onChange={(event) => setManagementPassword(event.target.value)} minLength={8} type="password" aria-label="New password" placeholder="New password (leave blank to keep current)" className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none" />
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={managementRole} onChange={(event) => setManagementRole(event.target.value as WorkspaceMember["role"])} aria-label="Built-in role" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none">
                  <option value="employee">Employee</option><option value="supervisor">Supervisor</option><option value="manager">Manager</option><option value="admin">Admin</option>
                </select>
                {canAssignCustomRoles && <select value={managementCustomRoleId} onChange={(event) => setManagementCustomRoleId(event.target.value)} aria-label="Custom access profile" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none">
                  <option value="">Built-in permissions</option>{workspaceRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>}
                <fieldset className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <legend className="px-1 text-xs font-semibold text-slate-600">Departments · select any</legend>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {departments.length ? departments.map((department) => (
                      <label key={department.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-700">
                        <input type="checkbox" checked={managementDepartmentIds.includes(department.id)} onChange={() => toggleManagementDepartment(department.id)} className="h-5 w-5 accent-emerald-700" />
                        {department.name}
                      </label>
                    )) : <span className="text-sm text-slate-500">No departments created.</span>}
                  </div>
                </fieldset>
                <select value={managementTeamId} onChange={(event) => setManagementTeamId(event.target.value)} aria-label="Team" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none">
                  <option value="">No team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
                <select value={managementAvailability} onChange={(event) => setManagementAvailability(event.target.value as WorkspaceMember["availabilityStatus"])} aria-label="Availability" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none">
                  <option value="available">Available</option><option value="limited">Limited</option><option value="unavailable">Unavailable</option><option value="leave">On leave</option>
                </select>
                <input value={managementCapacity} onChange={(event) => setManagementCapacity(event.target.value)} type="number" min="0" max="168" step="0.5" aria-label="Hours per week" placeholder="Hours/week" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none" />
                <input value={managementMaxTasks} onChange={(event) => setManagementMaxTasks(event.target.value)} type="number" min="0" aria-label="Maximum active tasks" placeholder="Max active tasks" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 text-base outline-none" />
              </div>
              <div className="flex gap-2 pt-2"><button type="button" onClick={() => setEditingMember(null)} className="min-h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cancel</button><button disabled={managementBusy} type="submit" className="min-h-11 flex-1 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{managementBusy ? "Saving…" : "Save changes"}</button></div>
            </form>
          </motion.div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setShowCreate(false)}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="create-task-title" initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(event) => event.stopPropagation()} className="max-h-[100dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-slate-200 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Task creation</div>
                <h2 id="create-task-title" className="mt-2 text-2xl font-black tracking-[-0.06em] text-slate-900">Create a task</h2>
              </div>
              <button ref={createTaskCloseRef} type="button" onClick={() => setShowCreate(false)} aria-label="Close create task form" className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><X className="h-4 w-4" /></button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label htmlFor="create-task-title-input" className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">What needs to be done?</label>
                <input id="create-task-title-input" name="title" required placeholder="e.g. Repair Mud Tank 32 side panel" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-emerald-700 md:text-sm" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Assign to</label>
                  <TaskAssigneeSelect members={members} currentUserId={user.id} />
                  <p className="mt-1 text-[11px] text-slate-400">Select one or more people. The first selected person is the primary assignee.</p>
                </div>
                <div>
                  <label htmlFor="create-task-project" className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Project</label>
                  <select id="create-task-project" name="project_id" defaultValue="" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:text-sm">
                    <option value="">Standalone task</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="create-task-priority" className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Priority</label>
                  <select id="create-task-priority" name="priority" defaultValue="Medium" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:text-sm">
                    <option>Urgent</option>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="create-task-visibility" className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Client visibility</label>
                <select id="create-task-visibility" name="visibility" defaultValue="internal" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:text-sm">
                  <option value="internal">Internal only</option>
                  <option value="client_visible">Visible to selected client</option>
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="create-task-due" className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Due date</label>
                  <input id="create-task-due" name="due" type="date" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:text-sm" />
                </div>
                <div>
                  <label htmlFor="create-task-client" className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Client</label>
                  <select id="create-task-client" name="client_id" defaultValue="" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:text-sm">
                    <option value="">Internal / no client</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="create-task-description" className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Description</label>
                <textarea id="create-task-description" name="description" rows={3} placeholder="Add context, scope or handoff details..." className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-emerald-700 md:text-sm" />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Subtasks</h3>
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
                    aria-label="New subtask title"
                    placeholder="Add a subtask..."
                    className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-emerald-700 md:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const title = newSubtaskTitle.trim();
                      if (!title) return;
                      setNewSubtasks((current) => [...current, title]);
                      setNewSubtaskTitle("");
                    }}
                    className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
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
