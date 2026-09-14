"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, PointerSensor, closestCenter, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarRange,
  ChevronRight,
  CircleDashed,
  Check,
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
  Plus,
  Pencil,
  Paperclip,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

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
  departmentId: string | null;
  teamId: string | null;
  availabilityStatus: "available" | "limited" | "unavailable" | "leave";
  capacityHoursPerWeek: number;
  maxActiveTasks: number;
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
  { label: "Employees", id: "team", icon: Users },
  { label: "Clients", id: "clients", icon: BriefcaseBusiness },
  { label: "Departments", id: "departments", icon: FolderKanban },
  { label: "Notifications", id: "notifications", icon: Bell },
  { label: "Settings", id: "settings", icon: ShieldCheck },
] as const;

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
  const [view, setView] = useState<(typeof navItems)[number]["id"]>("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
  const [managementDepartmentId, setManagementDepartmentId] = useState("");
  const [managementTeamId, setManagementTeamId] = useState("");
  const [managementAvailability, setManagementAvailability] = useState<WorkspaceMember["availabilityStatus"]>("available");
  const [managementCapacity, setManagementCapacity] = useState("40");
  const [managementMaxTasks, setManagementMaxTasks] = useState("10");
  const [projectStartDate, setProjectStartDate] = useState("");
  const [projectTargetDate, setProjectTargetDate] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationWebsite, setOrganizationWebsite] = useState("");
  const [organizationTimezone, setOrganizationTimezone] = useState("UTC");
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
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentRetry, setAttachmentRetry] = useState<File | null>(null);
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [profileName, setProfileName] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [darkMode, setDarkMode] = useState(() => typeof window !== "undefined" && localStorage.getItem("rigtech:dark-mode") === "true");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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
    if (!user) return;
    const cacheKey = `rigtech:tasks:${user.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const cachedTasks = JSON.parse(cached) as Task[];
        window.setTimeout(() => setTasks(cachedTasks), 0);
      } catch {
        localStorage.removeItem(cacheKey);
      }
    }
  }, [user]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("rigtech:dark-mode", String(darkMode));
  }, [darkMode]);


  useEffect(() => {
    if (!user || !tasks.length) return;
    localStorage.setItem(`rigtech:tasks:${user.id}`, JSON.stringify(tasks));
  }, [tasks, user]);

  useEffect(() => {
    if (!user) return;

    const fetchTaskData = async () => {
      try {
        const { data: membership, error: membershipError } = await supabase
          .from("organization_members")
          .select("organization_id, role")
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
        const memberResult = await supabase
          .from("organization_members")
          .select("user_id, department_id, team_id, role, availability_status, capacity_hours_per_week, max_active_tasks")
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
        const [{ data, error }, { data: clientRows, error: clientsError }, { data: departmentRows, error: departmentsError }, { data: teamRows, error: teamsError }, { data: projectRows, error: projectsError }] = await Promise.all([
          supabase.from("task_tree").select("*").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(50),
          supabase.from("clients").select("id, name, contact_email").eq("organization_id", membership.organization_id).order("name"),
          supabase.from("departments").select("id, name").eq("organization_id", membership.organization_id).order("name"),
          supabase.from("teams").select("id, name, department_id").eq("organization_id", membership.organization_id).order("name"),
          supabase.from("projects").select("id, name, description, client_id, status, start_date, target_date, created_at").eq("organization_id", membership.organization_id).order("name"),
        ]);
        if (error) throw new Error(`Task lookup failed: ${error.message}`);
        if (membersError) throw new Error(`Member lookup failed: ${membersError.message}`);
        if (clientsError) throw new Error(`Client lookup failed: ${clientsError.message}`);
        if (departmentsError) throw new Error(`Department lookup failed: ${departmentsError.message}`);
        if (teamsError) throw new Error(`Team lookup failed: ${teamsError.message}`);
        if (organizationError) throw new Error(`Organization lookup failed: ${organizationError.message}`);
        if (projectsError) throw new Error(`Project lookup failed: ${projectsError.message}`);

        const memberIds = (memberRows ?? []).map((row) => row.user_id);
        if (memberIds.length) {
          const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, full_name, name, email")
            .in("id", memberIds);
          if (profilesError) throw new Error(`Profile lookup failed: ${profilesError.message}`);
          const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
          setMembers((memberRows ?? []).map((row) => {
            const profile = profileById.get(row.user_id);
            return {
              id: row.user_id,
              name: profile?.full_name ?? profile?.name ?? "Workspace member",
              email: profile?.email ?? "",
              role: row.role,
              departmentId: row.department_id,
              teamId: row.team_id ?? null,
              availabilityStatus: row.availability_status ?? "available",
              capacityHoursPerWeek: Number(row.capacity_hours_per_week ?? 40),
              maxActiveTasks: Number(row.max_active_tasks ?? 10),
            };
          }));
        } else {
          setMembers([]);
        }
        setClients((clientRows ?? []).map((client) => ({ id: client.id, name: client.name, contactEmail: client.contact_email })));
        setDepartments((departmentRows ?? []).map((department) => ({ id: department.id, name: department.name })));
        setTeams((teamRows ?? []).map((team) => ({ id: team.id, name: team.name, departmentId: team.department_id })));
        setProjects((projectRows ?? []).map((project) => ({ id: project.id, name: project.name, description: project.description, clientId: project.client_id, status: project.status, startDate: project.start_date, targetDate: project.target_date, createdAt: project.created_at })));
        setOrganizationName(organizationRow?.name ?? "");
        setOrganizationWebsite(organizationRow?.website ?? "");
        setOrganizationTimezone(organizationRow?.timezone ?? "UTC");
        setProfileName(String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? ""));

        const taskRows = data as Array<Record<string, unknown>>;
        const childrenByParent = new Map<string, Array<Record<string, unknown>>>();
        taskRows.forEach((task) => {
          const parentId = typeof task.parent_task_id === "string" ? task.parent_task_id : null;
          if (parentId) childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), task]);
        });
        const toSubtasks = (parentId: string): TaskSubtask[] =>
          (childrenByParent.get(parentId) ?? []).map((child) => ({
            id: Number(String(child.id).replaceAll("-", "").slice(0, 8)) || Date.now(),
            supabaseId: String(child.id),
            title: String(child.title ?? "Untitled subtask"),
            description: String(child.description ?? ""),
            completed: child.status === "completed",
            children: toSubtasks(String(child.id)),
          }));

        const nextTasks: Task[] = taskRows.filter((task) => !task.parent_task_id).map((task, index) => ({
          id: Number(index + 1),
          supabaseId: String(task.id),
          title: String(task.title ?? `Task ${index + 1}`),
          project: String(task.project_name ?? "Standalone task"),
          assignee: String(task.assignee_name ?? "Unassigned"),
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
        }));

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
    activeTasks: tasks.filter((task) => task.assignee === member.name && task.status !== "Completed").length,
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
    if (!selectedTask || !titleDraft.trim() || titleDraft.trim() === selectedTask.title) return;
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
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title) return;

    const nextTask: Task = {
      id: Date.now(),
      supabaseId: "",
      title,
      project: projects.find((project) => project.id === String(form.get("project_id") ?? ""))?.name ?? "Standalone task",
      assignee: members.find((member) => member.id === String(form.get("assignee_id") ?? ""))?.name ?? "Unassigned",
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
        assignee_id: String(form.get("assignee_id") ?? "") || null,
        assigned_to_user_id: String(form.get("assignee_id") ?? "") || null,
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
        id: Date.now() + createdSubtasks.length,
        supabaseId: createdSubtask.id,
        title: subtask,
        description: "",
        completed: false,
        children: [],
      });
    }

    setSyncMessage(subtaskSaveWarning || "Task saved to Supabase.");
    const savedTask = { ...nextTask, supabaseId: createdTask.id, subtasks: createdSubtasks };
    setTasks((current) => [savedTask, ...current]);
    const assigneeId = String(form.get("assignee_id") ?? "");
    if (assigneeId && assigneeId !== user.id) {
      const { error: notificationError } = await supabase.from("notifications").insert({
        user_id: assigneeId,
        title: "New task assigned",
        message: `${nextTask.title} was assigned to you.`,
        type: "task_assigned",
        task_id: createdTask.id,
      });
      if (notificationError) console.error("Unable to create assignment notification.", notificationError);
    }
    openTask(savedTask);
    setShowCreate(false);
    setView("my-tasks");
    setNewSubtasks([]);
    setNewSubtaskTitle("");
    event.currentTarget.reset();
  };

  const handleCreateSubtask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      const child = { id: Date.now(), supabaseId: data.id, title, description: subtaskDescription.trim(), completed: false, children: [] };
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
    setManagementDepartmentId("");
    setManagementTeamId("");
    setManagementAvailability("available");
    setManagementCapacity("40");
    setManagementMaxTasks("10");
  };

  const handleEditMember = (member: WorkspaceMember) => {
    setEditingMember(member);
    setManagementMemberName(member.name);
    setManagementEmail(member.email);
    setManagementRole(member.role);
    setManagementDepartmentId(member.departmentId ?? "");
    setManagementTeamId(member.teamId ?? "");
    setManagementAvailability(member.availabilityStatus);
    setManagementCapacity(String(member.capacityHoursPerWeek));
    setManagementMaxTasks(String(member.maxActiveTasks));
    setManagementPassword("");
    setSyncMessage("");
  };

  const handleSaveMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingMember || currentRole === "client") return;
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
        department_id: managementDepartmentId || null,
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
      const updatedMember = result.data.member as WorkspaceMember & { department_id: string | null; team_id?: string | null; availability_status?: WorkspaceMember["availabilityStatus"]; capacity_hours_per_week?: number; max_active_tasks?: number };
      setMembers((current) => current.map((member) => member.id === updatedMember.id ? {
        ...member,
        name: updatedMember.name,
        email: updatedMember.email,
        role: updatedMember.role,
        departmentId: updatedMember.department_id,
        teamId: updatedMember.team_id ?? member.teamId,
        availabilityStatus: updatedMember.availability_status ?? member.availabilityStatus,
        capacityHoursPerWeek: Number(updatedMember.capacity_hours_per_week ?? member.capacityHoursPerWeek),
        maxActiveTasks: Number(updatedMember.max_active_tasks ?? member.maxActiveTasks),
      } : member).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingMember(null);
      resetManagementForm();
      setSyncMessage("Employee updated in Supabase.");
    }
    setManagementBusy(false);
  };

  const handleManagementSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId || !managementName.trim() || currentRole === "client") return;

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
          department_id: managementDepartmentId || null,
          member_name: managementMemberName.trim() || name,
          member_email: managementEmail.trim(),
          member_password: managementPassword,
          role: managementRole,
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
          departmentId: result.data.member.department_id,
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
        }].sort((a, b) => a.name.localeCompare(b.name)));
      }
    }

    if (error) {
      setSyncMessage(`Unable to create ${view === "team" ? "employee login" : view === "clients" ? "client" : view === "projects" ? "project" : "department"}: ${error.message}`);
    } else {
      setSyncMessage(`${view === "team" ? "Employee login" : view === "clients" ? "Client" : view === "projects" ? "Project" : "Department"} created in Supabase.`);
      resetManagementForm();
    }
    setManagementBusy(false);
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
          : view === "team"
            ? "Employees"
            : view === "clients"
              ? "Clients"
              : view === "departments"
                ? "Departments"
                : view === "notifications"
                  ? "Notifications"
                  : "Settings";
  const handleViewChange = (nextView: (typeof navItems)[number]["id"]) => {
    setView(nextView);
    setMobileNavOpen(false);
  };
  if (!authReady) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f7f5] text-sm text-slate-500">Loading your secure workspace…</div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7f5] px-4 py-8">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-lg font-bold text-white">R</div>
            <div>
              <div className="text-xl font-black tracking-[-0.05em] text-slate-900">rigtech</div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">secure operations workspace</div>
            </div>
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
    <div className="min-h-screen overflow-x-hidden bg-[#f4f7f5] pb-24 text-slate-900 lg:pb-0">
      <div className="flex w-full">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white px-4 py-5 lg:flex lg:flex-col">
          <div className="mb-8 flex items-center gap-3 px-2 py-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-lg font-bold text-white">R</div>
            <div>
              <div className="text-xl font-black tracking-[-0.05em] text-slate-900">rigtech</div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">industrial operations</div>
            </div>
          </div>

          {currentRole !== "client" && <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mb-7 flex items-center justify-between rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(5,150,105,0.25)] transition hover:bg-emerald-800"
          >
            <span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Create task</span>
            <span className="rounded-lg border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-bold">C</span>
          </button>}

          <nav className="space-y-3">
            {navItems.filter(({ id }) => id !== "executive" || currentRole === "admin" || currentRole === "manager").map(({ label, id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleViewChange(id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                  view === id ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{label}</span>
                {id === "notifications" && notifications.filter((notification) => !notification.isRead).length > 0 && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{notifications.filter((notification) => !notification.isRead).length}</span>}
              </button>
            ))}
          </nav>

          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-800">MA</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-800">{userName}</div>
              <div className="text-[11px] text-slate-500">{user.email}</div>
            </div>
            <button
              type="button"
              onClick={() => void supabase.auth.signOut()}
              aria-label="Sign out"
              title="Sign out"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
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
                <button type="button" onClick={() => setView("notifications")} aria-label="Open notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700">
                  <Bell className="h-4 w-4" />
                  {notifications.some((notification) => !notification.isRead) && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}
                </button>
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
                Offline mode: cached tasks are available. Changes will sync when you reconnect.
              </div>
            )}
            {view === "dashboard" && (
              <>
                <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Monday, September 15, 2025</div>
                    <h1 className="mt-2 text-[2rem] font-black leading-tight tracking-[-0.06em] text-slate-900 sm:text-4xl">Good morning, {userName}</h1>
                    <p className="mt-2 text-sm text-slate-500">A quick view of the current workload across fabrication, field and client work.</p>
                  </div>
                  <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                    <CalendarRange className="h-4 w-4" /> September 2025
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
                      <button type="button" onClick={() => setView("my-tasks")} className="text-sm font-semibold text-emerald-700">View all</button>
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

            {view === "executive" && (currentRole === "admin" || currentRole === "manager") && (
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
                    <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900">{view === "my-tasks" ? "My tasks" : "All tasks"}</h1>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                      <button type="button" onClick={() => setTaskLayout("list")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${taskLayout === "list" ? "bg-slate-950 text-white" : "text-slate-600"}`}>List</button>
                      <button type="button" onClick={() => setTaskLayout("kanban")} className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold ${taskLayout === "kanban" ? "bg-slate-950 text-white" : "text-slate-600"}`}><KanbanSquare className="h-3.5 w-3.5" /> Kanban</button>
                    </div>
                    {currentRole !== "client" && <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 self-start rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(16,185,129,0.16)]">
                      <Plus className="h-4 w-4" /> New task
                    </button>}
                  </div>
                </div>

                <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row md:items-center">
                  <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">
                    <Search className="h-4 w-4" />
                    <input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full border-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                      placeholder="Filter tasks, clients or teams..."
                    />
                  </label>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none">
                    <option value="all">All statuses</option>
                    <option value="To do">To do</option>
                    <option value="In progress">In progress</option>
                    <option value="Waiting">Waiting</option>
                    <option value="Completed">Completed</option>
                  </select>
                  <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none">
                    <option value="all">All priorities</option>
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                {taskLayout === "kanban" ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleKanbanDragStart} onDragCancel={() => setActiveKanbanTask(null)} onDragEnd={handleKanbanDragEnd}>
                    <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-4">
                      {(["To do", "In progress", "Waiting", "Completed"] as TaskStatus[]).map((status) => (
                        <KanbanColumn key={status} status={status} count={filteredTasks.filter((task) => task.status === status).length}>
                          {filteredTasks.filter((task) => task.status === status).map((task) => (
                            <KanbanCard
                              key={task.id}
                              task={task}
                              canEdit={currentRole !== "client"}
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
                ) : <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                  <div className="hidden grid-cols-[2fr_1.1fr_1fr_0.9fr_0.8fr_24px] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 md:grid">
                    <span>Task</span>
                    <span>Assignee</span>
                    <span>Status</span>
                    <span>Priority</span>
                    <span>Due date</span>
                    <span />
                  </div>

                  {filteredTasks.length > 0 ? (
                    <div className="space-y-2 p-2 md:space-y-0 md:p-0">
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
                  {currentRole !== "client" && <form onSubmit={handleManagementSubmit} className="flex w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:w-auto md:flex-row md:items-center">
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
                        <select value={managementDepartmentId} onChange={(event) => setManagementDepartmentId(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none">
                          <option value="">No department</option>
                          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                        </select>
                      </>
                    )}
                    {view === "clients" && (
                      <>
                        <input value={managementEmail} onChange={(event) => setManagementEmail(event.target.value)} required type="email" placeholder="Client login email" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none" />
                        <input value={managementPassword} onChange={(event) => setManagementPassword(event.target.value)} required minLength={8} type="password" placeholder="Initial password (8+)" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none" />
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
                        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700"><FolderKanban className="h-5 w-5" /></div><div><h3 className="font-bold text-slate-800">{department.name}</h3><p className="text-xs text-slate-500">{members.filter((member) => member.departmentId === department.id).length} employees</p></div></div>
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
                                <td className="px-5 py-4">{departments.find((department) => department.id === member.departmentId)?.name ?? "No department"}</td>
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
                {(currentRole === "admin" || currentRole === "manager") && (
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
              </section>
            )}

            {view !== "dashboard" && view !== "executive" && view !== "my-tasks" && view !== "all-tasks" && view !== "team" && view !== "clients" && view !== "departments" && view !== "projects" && view !== "notifications" && view !== "settings" && (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-8 w-8" /></div>
                <h2 className="mt-5 text-2xl font-black tracking-[-0.06em] text-slate-900">{pageTitle} is ready for your next phase</h2>
                <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">This workspace is designed for a future-ready industrial operations layer.</p>
                <button type="button" onClick={() => setView("dashboard")} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Back to dashboard <ArrowRight className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        </main>
      </div>

      <div className="fixed bottom-0 left-0 z-40 flex w-full items-center justify-around gap-1 border-t border-slate-800 bg-slate-950/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl lg:hidden">
        {navItems.filter(({ id }) => id !== "all-tasks").slice(0, 5).map(({ label, id, icon: Icon }) => (
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
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-lg font-bold text-white">R</div>
                <div>
                  <div className="text-xl font-black tracking-[-0.05em] text-slate-900">rigtech</div>
                  <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">industrial operations</div>
                </div>
              </div>
              <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            {currentRole !== "client" && (
              <button type="button" onClick={() => { setShowCreate(true); setMobileNavOpen(false); }} className="mb-6 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(5,150,105,0.25)]">
                <Plus className="h-4 w-4" /> Create task
              </button>
            )}
            <nav className="space-y-1.5">
              {navItems.filter(({ id }) => id !== "executive" || currentRole === "admin" || currentRole === "manager").map(({ label, id, icon: Icon }) => (
                <button key={id} type="button" onClick={() => handleViewChange(id)} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${view === id ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "text-slate-600 hover:bg-slate-100"}`}>
                  <Icon className="h-5 w-5" />
                  <span className="flex-1">{label}</span>
                  {id === "notifications" && notifications.filter((notification) => !notification.isRead).length > 0 && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{notifications.filter((notification) => !notification.isRead).length}</span>}
                </button>
              ))}
            </nav>
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

      <div className="fixed bottom-6 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/90 p-2 shadow-[0_20px_50px_rgba(15,23,42,0.14)] backdrop-blur-xl lg:flex">
        {navItems.filter(({ id }) => id !== "all-tasks").slice(0, 5).map(({ label, id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
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
              <button type="button" onClick={() => setSelectedTask(null)} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-xs font-black text-emerald-800">{selectedTask.assignee.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
              <div>
                <div className="text-xs uppercase tracking-[0.15em] text-slate-500">{selectedTask.department}</div>
                <div className="text-sm font-medium text-slate-700">{selectedTask.assignee}</div>
              </div>
            </div>

            <form onSubmit={handleTaskTitleSave} className="flex items-start gap-2">
              <input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-0 text-3xl font-black tracking-[-0.06em] text-slate-900 outline-none focus:border-slate-200 focus:bg-slate-50 focus:px-2" aria-label="Task title" />
              {titleDraft.trim() !== selectedTask.title && <button disabled={titleBusy} type="submit" className="mt-1 shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{titleBusy ? "Saving…" : "Save"}</button>}
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${getPriorityClasses(selectedTask.priority)}`}>{selectedTask.priority}</span>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${getStatusClasses(selectedTask.status)}`}>{selectedTask.status}</span>
              {currentRole !== "client" && (
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
              <textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} rows={3} placeholder="Add task details, scope or handoff notes..." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400" />
              <div className="mt-2 flex justify-end">
                <button disabled={descriptionBusy} type="submit" className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{descriptionBusy ? "Saving…" : "Save description"}</button>
              </div>
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

              <form onSubmit={handleCreateSubtask} className="mb-3 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-600">{subtaskParentId ? "Add nested subtask" : "Add subtask"}</div>
                  {subtaskParentId && <button type="button" onClick={() => { setSubtaskParentId(null); setSubtaskDescription(""); }} className="text-xs font-semibold text-slate-400 hover:text-slate-700">Cancel nesting</button>}
                </div>
                <div className="flex gap-2">
                  <input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} required placeholder={subtaskParentId ? "Add a subtask under this item..." : "Add a subtask..."} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none" />
                  <button disabled={subtaskBusy} type="submit" className="rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{subtaskBusy ? "…" : "Add"}</button>
                </div>
                <textarea value={subtaskDescription} onChange={(event) => setSubtaskDescription(event.target.value)} rows={2} placeholder="Optional description..." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400" />
              </form>

              <div className="space-y-2">
                {selectedTask.subtasks.length > 0 ? (
                  renderSubtaskTree(selectedTask.subtasks).map((subtask) => (
                    <div key={subtask.supabaseId} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700" style={{ marginLeft: subtask.depth * 14 }}>
                      <button
                        type="button"
                        onClick={() => void handleSubtaskStatusChange(subtask)}
                        disabled={currentRole === "client"}
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
                          rows={1}
                          placeholder="Add description..."
                          className="mt-1 w-full resize-y border-0 bg-transparent p-0 text-xs leading-5 text-slate-500 outline-none placeholder:text-slate-400"
                          aria-label={`Description for ${subtask.title}`}
                        />
                      </div>
                      {currentRole !== "client" && (
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
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:text-emerald-700">
                  <Paperclip className="h-3.5 w-3.5" /> {attachmentBusy ? "Uploading…" : "Add file"}
                  <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" capture="environment" onChange={handleUploadAttachment} disabled={attachmentBusy} className="hidden" />
                </label>
              </div>
              {attachmentRetry && (
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
              <form onSubmit={handleAddComment} className="mt-4 flex gap-2">
                <input value={commentBody} onChange={(event) => setCommentBody(event.target.value)} required className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400" placeholder="Write a comment..." />
                <button type="submit" className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Send</button>
              </form>
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
                <select value={managementDepartmentId} onChange={(event) => setManagementDepartmentId(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none">
                  <option value="">No department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
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
                  <select name="assignee_id" defaultValue={user.id} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none">
                    <option value="">Unassigned</option>
                    {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
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
