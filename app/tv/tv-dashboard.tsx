"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Layers3,
  Newspaper,
  RefreshCw,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type DisplayProject = {
  id: string;
  name: string;
  status: string;
  target_date: string | null;
  client_id: string | null;
  completed_at: string | null;
};

type DisplayTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  project_id: string | null;
  project_name: string | null;
  assignee_name: string | null;
  department_name: string | null;
  parent_task_id: string | null;
};

type DisplayDepartment = { id: string; name: string };
type DisplayMember = {
  user_id: string;
  department_id: string | null;
  capacity_hours_per_week: number | null;
  max_active_tasks: number | null;
  name: string;
};
type MonthlyWork = { label: string; created: number; completed: number };
type NewsHeadline = { title: string; url: string; source: string; publishedAt: string | null };
type NewsResponse = { headlines: NewsHeadline[]; source: string; error: string | null };
type DashboardData = {
  organizationName: string;
  projects: DisplayProject[];
  tasks: DisplayTask[];
  departments: DisplayDepartment[];
  members: DisplayMember[];
};

const statusOrder = ["completed", "in_progress", "waiting", "todo"] as const;
const statusLabels: Record<(typeof statusOrder)[number], string> = {
  completed: "Complete",
  in_progress: "In progress",
  waiting: "Waiting",
  todo: "To do",
};
const statusColors: Record<(typeof statusOrder)[number], string> = {
  completed: "#c29337",
  in_progress: "#4f7cff",
  waiting: "#a78bfa",
  todo: "#2dd4bf",
};
const displayStatus = (status: string): (typeof statusOrder)[number] =>
  status === "completed" ? "completed" :
    status === "in_progress" ? "in_progress" :
      status === "waiting" ? "waiting" : "todo";
const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : "No target";
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const safeError = (error: unknown) => error instanceof Error ? error.message : "Unexpected network error.";
const formatNewsTime = (value: string | null) => {
  if (!value) return "LATEST";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "LATEST"
    : new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
};

function StatusDonut({ counts, total }: { counts: Record<(typeof statusOrder)[number], number>; total: number }) {
  const circumference = 2 * Math.PI * 42;
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 100 100" role="img" aria-label={`Task status distribution across ${total} tasks`} className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#26354a" strokeWidth="11" />
          {statusOrder.map((status, index) => {
            const length = total ? circumference * counts[status] / total : 0;
            const currentOffset = statusOrder.slice(0, index).reduce(
              (sum, previousStatus) => sum + circumference * counts[previousStatus] / (total || 1),
              0,
            );
            return length > 0 ? (
              <circle
                key={status}
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={statusColors[status]}
                strokeWidth="11"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-currentOffset}
                strokeLinecap="butt"
              />
            ) : null;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black tracking-[-0.06em] text-white">{total}</span>
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#9aa9bd]">work items</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        {statusOrder.map((status) => (
          <div key={status} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-[#bac6d6]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: statusColors[status] }} />
              <span className="truncate">{statusLabels[status]}</span>
            </span>
            <span className="text-xs font-bold tabular-nums text-white">{counts[status]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkTrend({ data }: { data: MonthlyWork[] }) {
  const width = 580;
  const height = 174;
  const maxValue = Math.max(1, ...data.flatMap((point) => [point.created, point.completed]));
  const x = (index: number) => 24 + index * (width - 48) / Math.max(1, data.length - 1);
  const y = (value: number) => height - 25 - value / maxValue * (height - 52);
  const linePath = (field: "created" | "completed") =>
    data.map((point, index) => `${index ? "L" : "M"} ${x(index)} ${y(point[field])}`).join(" ");
  const createdPath = linePath("created");
  const completedPath = linePath("completed");
  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#bac6d6]"><span className="h-2 w-2 rounded-full bg-[#c29337]" />Created</span>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#bac6d6]"><span className="h-2 w-2 rounded-full bg-[#4f7cff]" />Completed</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Monthly task creation and completion trend" className="h-36 w-full overflow-visible">
        {[0, 1, 2, 3].map((line) => {
          const lineY = 16 + line * 39;
          return <line key={line} x1="24" x2={width - 24} y1={lineY} y2={lineY} stroke="#33445c" strokeDasharray="3 5" />;
        })}
        <path d={`${createdPath} L ${x(data.length - 1)} ${height - 25} L ${x(0)} ${height - 25} Z`} fill="#c29337" opacity="0.09" />
        <path className="tv-trend-line" d={createdPath} fill="none" stroke="#c29337" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path className="tv-trend-line tv-trend-line-delay" d={completedPath} fill="none" stroke="#4f7cff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((point, index) => (
          <g key={point.label}>
            <circle className="tv-chart-point" cx={x(index)} cy={y(point.created)} r="3.5" fill="#c29337" stroke="#172338" strokeWidth="2" />
            <circle className="tv-chart-point tv-chart-point-delay" cx={x(index)} cy={y(point.completed)} r="3.5" fill="#4f7cff" stroke="#172338" strokeWidth="2" />
            <text x={x(index)} y={height - 3} textAnchor="middle" fill="#9aa9bd" fontSize="9" fontWeight="600">{point.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function TvDashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [displayOrganizationId, setDisplayOrganizationId] = useState<string | null>(null);
  const [news, setNews] = useState<NewsResponse | null>(null);
  const [newsStatus, setNewsStatus] = useState<"connecting" | "live" | "unavailable">("connecting");
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "live" | "polling">("connecting");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadDashboard = useCallback(async () => {
    setError("");
    try {
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError) throw new Error(`Unable to verify this display account: ${userError.message}`);
      if (!userResult.user) {
        setDashboard(null);
        setError("Sign in with the dedicated TV Display account to activate this screen.");
        return;
      }

      const { data: isTvDisplay, error: roleError } = await supabase.rpc("current_user_is_tv_display");
      if (roleError) throw new Error(`Unable to verify TV display access: ${roleError.message}`);
      if (!isTvDisplay) {
        setDashboard(null);
        setError('This account is not assigned the "TV Display" read-only role.');
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userResult.user.id)
        .limit(1)
        .maybeSingle();
      if (membershipError) throw new Error(`Unable to load display organization: ${membershipError.message}`);
      if (!membership) throw new Error("The TV display account is not attached to an organization.");
      const organizationId = membership.organization_id;
      setDisplayOrganizationId(organizationId);

      const [
        organizationResult,
        projectsResult,
        departmentsResult,
        memberResult,
      ] = await Promise.all([
        supabase.from("organizations").select("name").eq("id", organizationId).single(),
        supabase.from("projects").select("id, name, status, target_date, client_id, completed_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
        supabase.from("departments").select("id, name").eq("organization_id", organizationId).order("name"),
        supabase.from("organization_members").select("user_id, department_id, capacity_hours_per_week, max_active_tasks").eq("organization_id", organizationId).neq("role", "client"),
      ]);
      if (organizationResult.error) throw new Error(`Unable to load organization details: ${organizationResult.error.message}`);
      if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`);
      if (departmentsResult.error) throw new Error(`Unable to load departments: ${departmentsResult.error.message}`);
      if (memberResult.error) throw new Error(`Unable to load team assignments: ${memberResult.error.message}`);
      const memberRows = (memberResult.data ?? []) as Array<Omit<DisplayMember, "name">>;
      const memberIds = memberRows.map((member) => member.user_id);
      const { data: profiles, error: profilesError } = memberIds.length
        ? await supabase.from("profiles").select("id, full_name, name").in("id", memberIds)
        : { data: [], error: null };
      if (profilesError) throw new Error(`Unable to load display team names: ${profilesError.message}`);
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

      const taskRows: DisplayTask[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error: tasksError } = await supabase
          .from("task_tree")
          .select("id, title, status, priority, due_date, created_at, updated_at, completed_at, project_id, project_name, assignee_name, department_name, parent_task_id")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (tasksError) throw new Error(`Unable to load tasks: ${tasksError.message}`);
        const page = (data ?? []) as DisplayTask[];
        taskRows.push(...page);
        if (page.length < pageSize) break;
      }

      setDashboard({
        organizationName: organizationResult.data.name,
        projects: (projectsResult.data ?? []) as DisplayProject[],
        tasks: taskRows,
        departments: (departmentsResult.data ?? []) as DisplayDepartment[],
        members: memberRows.map((member) => ({
          ...member,
          capacity_hours_per_week: member.capacity_hours_per_week === null ? null : Number(member.capacity_hours_per_week),
          max_active_tasks: member.max_active_tasks === null ? null : Number(member.max_active_tasks),
          name: profileById.get(member.user_id)?.full_name ?? profileById.get(member.user_id)?.name ?? "Team member",
        })),
      });
      setUpdatedAt(new Date());
    } catch (loadError) {
      setDashboard(null);
      setError(safeError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => void loadDashboard(), 0);
    const clockTimer = window.setInterval(() => setClock(new Date()), 1000);
    return () => {
      window.clearTimeout(initialLoadTimer);
      window.clearInterval(clockTimer);
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (!displayOrganizationId) return;
    let refreshTimeout = 0;
    const channel = supabase
      .channel(`tv-dashboard:${displayOrganizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `organization_id=eq.${displayOrganizationId}` }, () => {
        window.clearTimeout(refreshTimeout);
        refreshTimeout = window.setTimeout(() => void loadDashboard(), 350);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `organization_id=eq.${displayOrganizationId}` }, () => {
        window.clearTimeout(refreshTimeout);
        refreshTimeout = window.setTimeout(() => void loadDashboard(), 350);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "departments", filter: `organization_id=eq.${displayOrganizationId}` }, () => {
        window.clearTimeout(refreshTimeout);
        refreshTimeout = window.setTimeout(() => void loadDashboard(), 350);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "organization_members", filter: `organization_id=eq.${displayOrganizationId}` }, () => {
        window.clearTimeout(refreshTimeout);
        refreshTimeout = window.setTimeout(() => void loadDashboard(), 350);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("live");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeStatus("polling");
        }
      });
    const fallbackTimer = window.setInterval(() => void loadDashboard(), 30_000);
    return () => {
      window.clearTimeout(refreshTimeout);
      window.clearInterval(fallbackTimer);
      void supabase.removeChannel(channel);
    };
  }, [displayOrganizationId, loadDashboard]);

  useEffect(() => {
    let cancelled = false;
    const loadNews = async () => {
      try {
        const response = await fetch("/api/saudi-news", { cache: "no-store" });
        const result = await response.json() as NewsResponse;
        if (cancelled) return;
        if (!response.ok || !result.headlines.length) {
          setNewsStatus("unavailable");
          return;
        }
        setNews(result);
        setNewsStatus("live");
      } catch (loadError) {
        if (cancelled) return;
        console.error("Unable to refresh the Saudi headlines ticker.", loadError);
        setNewsStatus("unavailable");
      }
    };
    void loadNews();
    const timer = window.setInterval(() => void loadNews(), 15 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const topLevelTasks = useMemo(() => (dashboard?.tasks ?? []).filter((task) => !task.parent_task_id), [dashboard]);
  const todayKey = dateKey(clock);
  const overview = useMemo(() => {
    const tasks = topLevelTasks;
    const counts = { completed: 0, in_progress: 0, waiting: 0, todo: 0 };
    tasks.forEach((task) => { counts[displayStatus(task.status)] += 1; });
    const overdue = tasks.filter((task) =>
      task.status !== "completed" && task.due_date !== null && task.due_date.slice(0, 10) < todayKey,
    );
    const dueToday = tasks.filter((task) =>
      task.status !== "completed" && task.due_date?.slice(0, 10) === todayKey,
    );
    const urgent = tasks.filter((task) => task.status !== "completed" && task.priority === "urgent");
    const completedProjects = dashboard?.projects.filter((project) => project.status === "completed").length ?? 0;
    const activeProjects = dashboard?.projects.filter((project) => project.status === "active").length ?? 0;
    const projectProgress = (project: DisplayProject) => {
      const projectTasks = tasks.filter((task) => task.project_id === project.id);
      return projectTasks.length ? Math.round(projectTasks.filter((task) => task.status === "completed").length / projectTasks.length * 100) : 0;
    };
    const projects = [...(dashboard?.projects ?? [])]
      .filter((project) => project.status !== "archived")
      .sort((first, second) =>
        Number(first.status === "completed") - Number(second.status === "completed") ||
        projectProgress(second) - projectProgress(first),
      );
    const departmentWorkload = (dashboard?.departments ?? []).map((department) => ({
      ...department,
      active: tasks.filter((task) => task.department_name === department.name && task.status !== "completed").length,
    })).sort((first, second) => second.active - first.active).slice(0, 5);
    const teamWorkload = (dashboard?.members ?? []).map((member) => ({
      ...member,
      active: tasks.filter((task) => task.assignee_name === member.name && task.status !== "completed").length,
    })).sort((first, second) => second.active - first.active).slice(0, 5);
    const monthly: MonthlyWork[] = [];
    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(clock.getFullYear(), clock.getMonth() - index, 1);
      const key = monthKey(date);
      const formatMonth = new Intl.DateTimeFormat(undefined, { month: "short" });
      monthly.push({
        label: formatMonth.format(date),
        created: tasks.filter((task) => monthKey(new Date(task.created_at)) === key).length,
        completed: tasks.filter((task) => task.completed_at && monthKey(new Date(task.completed_at)) === key).length,
      });
    }
    return {
      counts,
      total: tasks.length,
      completedProjects,
      activeProjects,
      overdue,
      dueToday,
      urgent,
      projects: projects.slice(0, 4),
      projectProgress,
      departmentWorkload,
      teamWorkload,
      monthly,
    };
  }, [dashboard, topLevelTasks, todayKey, clock]);

  if (!dashboard) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#111827] px-6 text-white">
        <section className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-10 text-center shadow-2xl">
          <Image src="/logo.png" alt="Rigtech Engineering" width={440} height={440} priority className="mx-auto h-36 w-36 object-contain" />
          {loading ? (
            <><div className="mt-6 text-sm font-semibold text-white/70">Connecting to the secure display…</div><div className="mx-auto mt-4 h-1.5 w-40 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/2 animate-pulse rounded-full bg-[#c29337]" /></div></>
          ) : (
            <>
              <h1 className="mt-5 text-2xl font-bold">{error.includes("Sign in") ? "Display is locked" : "Display access unavailable"}</h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/65">{error}</p>
              {error.includes("Sign in") && <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#c29337] px-5 text-sm font-bold text-[#111827]">Sign in to Rigtech</Link>}
              {!error.includes("Sign in") && <button type="button" onClick={() => void loadDashboard()} className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-5 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" /> Try again</button>}
            </>
          )}
        </section>
      </main>
    );
  }

  const completionRate = overview.total ? Math.round(overview.counts.completed / overview.total * 100) : 0;
  const attentionTasks = [...overview.overdue, ...overview.urgent.filter((task) => !overview.overdue.some((overdue) => overdue.id === task.id))]
    .sort((first, second) =>
      Number(second.priority === "urgent") - Number(first.priority === "urgent") ||
      String(first.due_date ?? "").localeCompare(String(second.due_date ?? "")),
    ).slice(0, 4);
  const departmentMaximum = Math.max(1, ...overview.departmentWorkload.map((department) => department.active));
  const tickerHeadlines: NewsHeadline[] = news?.headlines.length
    ? [...news.headlines, ...news.headlines]
    : [{ title: newsStatus === "unavailable" ? "Saudi headlines temporarily unavailable · Operations dashboard remains live" : "Connecting to Saudi Arabia headlines…", url: "#", source: "Rigtech", publishedAt: null }];

  return (
    <main className="tv-shell min-h-screen px-4 py-4 text-white sm:px-6 xl:h-screen xl:px-9 xl:py-4 2xl:px-12 2xl:py-5">
      <div className="tv-board mx-auto grid max-w-[1880px] gap-3 xl:h-full xl:min-h-0 xl:grid-rows-[auto_auto_auto_minmax(0,1.25fr)_minmax(0,0.75fr)_auto] xl:gap-3 2xl:gap-4">
        <header className="tv-header flex items-center justify-between border-b border-white/10 pb-3 xl:pb-3">
          <div className="flex min-w-0 items-center gap-4">
            <div className="tv-logo-wrap"><Image src="/logo.png" alt="Rigtech Engineering" width={440} height={440} priority className="tv-logo h-20 w-20 shrink-0 object-contain sm:h-24 sm:w-24 xl:h-28 xl:w-28" /></div>
            <div className="min-w-0 border-l border-white/15 pl-3 sm:pl-4">
              <div className="truncate text-[9px] font-bold uppercase tracking-[0.24em] text-[#e1b958] sm:text-[10px] xl:text-xs">Operations intelligence</div>
              <h1 className="mt-1 truncate text-lg font-black tracking-[-0.045em] text-white sm:text-xl xl:text-3xl">{dashboard.organizationName}</h1>
              <div className="mt-1 hidden text-[9px] font-medium uppercase tracking-[0.18em] text-[#9aa9bd] sm:block xl:text-[10px]">Offshore &amp; infrastructure command</div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <div className="text-2xl font-black tabular-nums tracking-[-0.04em] text-white sm:text-3xl xl:text-5xl">{new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(clock)}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[9px] font-medium text-[#aab8ca] sm:gap-2 sm:text-[10px] xl:text-xs">
              <CalendarDays className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(clock)}
            </div>
          </div>
        </header>

        <section aria-label="Saudi Arabia live headlines" className="tv-ticker flex min-w-0 items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 sm:px-4">
          <div className="flex shrink-0 items-center gap-2 border-r border-white/15 pr-3 sm:pr-4">
            <span className={`tv-live-dot h-2 w-2 rounded-full ${newsStatus === "live" ? "bg-[#56e0be]" : "bg-[#e1b958]"}`} />
            <Newspaper className="hidden h-4 w-4 text-[#e1b958] sm:block" />
            <span className="text-[9px] font-black uppercase tracking-[0.13em] text-[#f2ce78] sm:text-[10px]">Saudi energy wire</span>
          </div>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div className={`tv-ticker-track flex w-max items-center ${news?.headlines.length ? "tv-ticker-moving" : ""}`}>
              {tickerHeadlines.map((headline, index) => (
                <div key={`${headline.source}-${headline.title}-${index}`} className="flex max-w-[min(82vw,52rem)] items-center gap-2 pr-8 text-[10px] font-medium text-white/90 sm:text-[11px] xl:pr-12 xl:text-xs">
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#d9b15b]">{headline.source}</span>
                  {headline.url === "#" ? <span className="truncate">{headline.title}</span> : <a href={headline.url} target="_blank" rel="noreferrer" className="truncate underline-offset-2 hover:underline">{headline.title}</a>}
                  {headline.publishedAt && <span className="shrink-0 text-[9px] text-white/45">{formatNewsTime(headline.publishedAt)}</span>}
                  <span aria-hidden="true" className="text-[#c29337]">✦</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-[#8fa0b5] md:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${newsStatus === "live" ? "bg-[#56e0be]" : "bg-[#e1b958]"}`} />
            {newsStatus === "live" ? "Live headlines" : newsStatus === "unavailable" ? "Feed unavailable" : "Connecting"}
          </div>
        </section>

        <section aria-label="Operations key performance indicators" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:gap-4">
          {[
            { label: "Active projects", value: overview.activeProjects, foot: `${overview.completedProjects} delivered`, icon: BriefcaseBusiness, accent: "text-[#8e6728]", direction: "steady" },
            { label: "Open work items", value: overview.total - overview.counts.completed, foot: `${overview.counts.in_progress} in progress`, icon: Layers3, accent: "text-[#111827]", direction: "steady" },
            { label: "Needs attention", value: overview.overdue.length + overview.urgent.filter((task) => !overview.overdue.some((overdue) => overdue.id === task.id)).length, foot: `${overview.overdue.length} overdue · ${overview.urgent.length} urgent`, icon: AlertTriangle, accent: "text-[#8e6728]", direction: "down" },
            { label: "Delivery complete", value: `${completionRate}%`, foot: `${overview.counts.completed} items delivered`, icon: CheckCircle2, accent: "text-[#111827]", direction: "up" },
          ].map(({ label, value, foot, icon: Icon, accent, direction }) => (
            <article key={label} className="relative overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_5px_20px_rgba(17,24,39,0.035)] xl:rounded-3xl xl:p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b7280] xl:text-xs">{label}</div>
                <Icon className={`h-4 w-4 ${accent} xl:h-5 xl:w-5`} />
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div className="text-3xl font-black tabular-nums tracking-[-0.06em] text-[#111827] xl:text-5xl">{value}</div>
                {direction !== "steady" && (direction === "up" ? <ArrowUpRight className="mb-1 h-4 w-4 text-[#8e6728]" /> : <ArrowDownRight className="mb-1 h-4 w-4 text-[#8e6728]" />)}
              </div>
              <div className="mt-1 truncate text-[10px] font-medium text-[#6b7280] xl:text-xs">{foot}</div>
            </article>
          ))}
        </section>

        <section className="grid gap-3 lg:grid-cols-12 xl:min-h-0 xl:gap-4">
          <article className="min-h-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_5px_20px_rgba(17,24,39,0.035)] lg:col-span-4 xl:rounded-3xl xl:p-5">
            <div className="mb-4 flex items-start justify-between">
              <div><h2 className="text-sm font-bold xl:text-base">Work status</h2><p className="mt-1 text-[10px] text-[#6b7280] xl:text-xs">Organization-wide distribution</p></div>
              <Activity className="h-4 w-4 text-[#8e6728] xl:h-5 xl:w-5" />
            </div>
            <StatusDonut counts={overview.counts} total={overview.total} />
            <div className="mt-4 flex items-center justify-between rounded-xl bg-[#fbf7ef] px-3 py-2.5">
              <span className="text-[10px] font-semibold text-[#6b7280]">Due today</span>
              <span className="text-sm font-black tabular-nums text-[#111827]">{overview.dueToday.length} items</span>
            </div>
          </article>

          <article className="min-h-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_5px_20px_rgba(17,24,39,0.035)] lg:col-span-5 xl:rounded-3xl xl:p-5">
            <div className="mb-1 flex items-start justify-between">
              <div><h2 className="text-sm font-bold xl:text-base">Delivery trend</h2><p className="mt-1 text-[10px] text-[#6b7280] xl:text-xs">Tasks created and completed · last six months</p></div>
              <div className="rounded-xl bg-[#fbf7ef] p-2"><Activity className="h-4 w-4 text-[#8e6728]" /></div>
            </div>
            <WorkTrend data={overview.monthly} />
            <div className="mt-1 flex items-center justify-between border-t border-[#f3f4f6] pt-3 text-[10px] text-[#6b7280]">
              <span>Current portfolio completion</span><span className="font-bold text-[#111827]">{completionRate}%</span>
            </div>
          </article>

          <article className="min-h-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_5px_20px_rgba(17,24,39,0.035)] lg:col-span-3 xl:rounded-3xl xl:p-5">
            <div className="mb-3 flex items-start justify-between">
              <div><h2 className="text-sm font-bold xl:text-base">Attention queue</h2><p className="mt-1 text-[10px] text-[#6b7280] xl:text-xs">Urgent and overdue items</p></div>
              <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-[#fbf7ef] px-2 text-xs font-black text-[#755321]">{overview.overdue.length + overview.urgent.length}</div>
            </div>
            <div className="divide-y divide-[#f3f4f6]">
              {attentionTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2.5 py-2.5">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${task.due_date && task.due_date.slice(0, 10) < todayKey ? "bg-rose-50 text-rose-700" : "bg-[#fbf7ef] text-[#8e6728]"}`}><AlertTriangle className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-bold text-[#1f2937] xl:text-xs">{task.title}</div>
                    <div className="mt-0.5 truncate text-[9px] text-[#6b7280] xl:text-[10px]">{task.project_name ?? task.assignee_name ?? "Unassigned"} · {task.due_date ? formatDate(task.due_date) : "No due date"}</div>
                  </div>
                  <span className="shrink-0 text-[8px] font-black uppercase tracking-wide text-[#8e6728] xl:text-[9px]">{task.due_date && task.due_date.slice(0, 10) < todayKey ? "Late" : "Urgent"}</span>
                </div>
              ))}
              {!attentionTasks.length && <div className="py-7 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-[#c29337]" /><div className="mt-2 text-xs font-bold text-[#4b5563]">No urgent work to surface</div></div>}
            </div>
          </article>
        </section>

        <section className="grid gap-3 lg:grid-cols-12 xl:min-h-0 xl:gap-4">
          <article className="min-h-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_5px_20px_rgba(17,24,39,0.035)] lg:col-span-8 xl:rounded-3xl xl:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div><h2 className="text-sm font-bold xl:text-base">Project portfolio</h2><p className="mt-1 text-[10px] text-[#6b7280] xl:text-xs">Live delivery progress across active projects</p></div>
              <BriefcaseBusiness className="h-4 w-4 text-[#8e6728] xl:h-5 xl:w-5" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {overview.projects.map((project) => {
                const progress = overview.projectProgress(project);
                const projectTasks = topLevelTasks.filter((task) => task.project_id === project.id);
                return (
                  <div key={project.id} className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-3 xl:rounded-2xl">
                    <div className="flex items-start justify-between gap-2"><div className="truncate text-[11px] font-bold text-[#111827] xl:text-xs">{project.name}</div><span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-bold uppercase ${project.status === "completed" ? "bg-[#f5ecd8] text-[#755321]" : "bg-[#e5e7eb] text-[#4b5563]"}`}>{project.status}</span></div>
                    <div className="mt-3 flex items-center justify-between text-[9px] text-[#6b7280]"><span>{projectTasks.length} work items</span><span>{progress}%</span></div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e5e7eb]"><div className="h-full rounded-full bg-[#c29337]" style={{ width: `${progress}%` }} /></div>
                    <div className="mt-2 flex items-center gap-1 text-[9px] text-[#6b7280]"><Clock3 className="h-3 w-3" />{formatDate(project.target_date)}</div>
                  </div>
                );
              })}
              {!overview.projects.length && <div className="rounded-xl border border-dashed border-[#e5e7eb] p-5 text-center text-xs text-[#6b7280] sm:col-span-2 xl:col-span-4">Project portfolio will appear here.</div>}
            </div>
          </article>

          <article className="min-h-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_5px_20px_rgba(17,24,39,0.035)] lg:col-span-4 xl:rounded-3xl xl:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div><h2 className="text-sm font-bold xl:text-base">Team & department activity</h2><p className="mt-1 text-[10px] text-[#6b7280] xl:text-xs">Open tasks by people and department</p></div>
              <Users className="h-4 w-4 text-[#8e6728] xl:h-5 xl:w-5" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="space-y-2.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9ca3af]">Team workload</div>
              {overview.teamWorkload.map((member) => (
                <div key={member.user_id}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-[10px]"><span className="truncate font-semibold text-[#4b5563]">{member.name}</span><span className="shrink-0 font-bold tabular-nums text-[#111827]">{member.active} active</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#f3f4f6]"><div className={`h-full rounded-full ${member.active >= 5 ? "bg-[#8e6728]" : "bg-[#111827]"}`} style={{ width: `${Math.min(100, member.active / Math.max(1, member.max_active_tasks ?? 5) * 100)}%` }} /></div>
                </div>
              ))}
              {!overview.teamWorkload.length && <div className="text-[10px] text-[#6b7280]">Team assignments will appear here.</div>}
            </div>
            <div className="space-y-2.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9ca3af]">Department workload</div>
              {overview.departmentWorkload.map((department) => (
                <div key={department.id}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-[10px]"><span className="truncate font-semibold text-[#4b5563]">{department.name}</span><span className="font-bold tabular-nums text-[#111827]">{department.active}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#f3f4f6]"><div className="h-full rounded-full bg-[#111827]" style={{ width: `${department.active / departmentMaximum * 100}%` }} /></div>
                </div>
              ))}
              {!overview.departmentWorkload.length && <div className="py-5 text-center text-xs text-[#6b7280]">Department activity will appear here.</div>}
            </div>
            </div>
          </article>
        </section>

        <footer className="mt-auto flex items-center justify-between pt-4 text-[9px] font-medium text-[#9ca3af] xl:pt-4 xl:text-[10px]">
          <span className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${realtimeStatus === "live" ? "animate-pulse bg-[#56e0be]" : "bg-[#e1b958]"}`} />{realtimeStatus === "live" ? "LIVE · READ-ONLY DISPLAY" : realtimeStatus === "polling" ? "POLLING · READ-ONLY DISPLAY" : "CONNECTING · READ-ONLY DISPLAY"}</span>
          <span>{updatedAt ? `Updated ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(updatedAt)}` : "Connecting"}</span>
        </footer>
      </div>
    </main>
  );
}
