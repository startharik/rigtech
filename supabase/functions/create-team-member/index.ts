import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TeamMemberRequest = {
  mode?: "employee" | "client" | "update" | "assign-role";
  member_id?: string;
  client_name?: string;
  department_id?: string | null;
  member_name?: string;
  member_email?: string;
  member_password?: string;
  role?: "admin" | "manager" | "supervisor" | "employee";
  team_id?: string | null;
  availability_status?: "available" | "limited" | "unavailable" | "leave";
  capacity_hours_per_week?: number;
  max_active_tasks?: number;
  custom_role_id?: string | null;
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  try {
    return await handleRequest(request);
  } catch (error) {
    console.error("Unexpected team member provisioning error", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected team member provisioning error." }, 500);
  }
});

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Only POST is supported." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication is required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "The function is not configured." }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = authorization.slice("Bearer ".length);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Your session is no longer valid." }, 401);

  let payload: TeamMemberRequest;
  try {
    payload = await request.json() as TeamMemberRequest;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const memberName = payload.member_name?.trim();
  const memberEmail = payload.member_email?.trim().toLowerCase();
  const memberPassword = payload.member_password;
  const memberRole = payload.role ?? "employee";
  const isClient = payload.mode === "client";
  const isUpdate = payload.mode === "update";
  const isRoleAssignment = payload.mode === "assign-role";
  const clientName = payload.client_name?.trim();
  const { data: requesterMembership, error: membershipError } = await admin
    .from("organization_members")
    .select("organization_id, role, custom_role_id")
    .eq("user_id", authData.user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError) return json({ error: membershipError.message }, 500);
  if (!requesterMembership) return json({ error: "A workspace membership is required to manage team logins." }, 403);

  const canManageRoles = requesterMembership.role === "admin" || requesterMembership.role === "manager";
  let canManageTeam = canManageRoles;
  if (!canManageTeam && requesterMembership.custom_role_id) {
    const { data: assignedRole, error: assignedRoleError } = await admin
      .from("organization_roles")
      .select("permissions")
      .eq("organization_id", requesterMembership.organization_id)
      .eq("id", requesterMembership.custom_role_id)
      .maybeSingle();
    if (assignedRoleError) return json({ error: assignedRoleError.message }, 500);
    canManageTeam = assignedRole?.permissions?.team?.manage === true;
  }
  if (!canManageTeam) return json({ error: "Your workspace role cannot manage team members." }, 403);

  if (isRoleAssignment) {
    if (!canManageRoles) return json({ error: "Only organization admins and managers can assign custom roles." }, 403);
    if (!payload.member_id) return json({ error: "Member id is required." }, 400);
    const { data: targetMembership, error: targetError } = await admin
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", requesterMembership.organization_id)
      .eq("user_id", payload.member_id)
      .maybeSingle();
    if (targetError) return json({ error: targetError.message }, 500);
    if (!targetMembership) return json({ error: "Workspace membership was not found." }, 404);
    if (payload.custom_role_id && ["admin", "manager"].includes(targetMembership.role)) {
      return json({ error: "Built-in admin and manager accounts cannot be assigned custom roles." }, 400);
    }

    if (payload.custom_role_id) {
      const { data: targetRole, error: roleError } = await admin
        .from("organization_roles")
        .select("id")
        .eq("organization_id", requesterMembership.organization_id)
        .eq("id", payload.custom_role_id)
        .maybeSingle();
      if (roleError) return json({ error: roleError.message }, 500);
      if (!targetRole) return json({ error: "The selected role is not part of this organization." }, 400);
    }

    const { error: assignmentError } = await admin
      .from("organization_members")
      .update({ custom_role_id: payload.custom_role_id || null })
      .eq("organization_id", requesterMembership.organization_id)
      .eq("user_id", payload.member_id);
    if (assignmentError) return json({ error: assignmentError.message }, 500);
    return json({ member_id: payload.member_id, custom_role_id: payload.custom_role_id || null });
  }

  if (!memberName || !memberEmail || (!isUpdate && (!memberPassword || memberPassword.length < 8)) || (isUpdate && memberPassword && memberPassword.length < 8)) {
    return json({ error: isUpdate ? "Member name and email are required. New passwords must be at least 8 characters." : "Member name, email, and an 8+ character password are required." }, 400);
  }

  if ((memberRole === "admin" || memberRole === "manager") && requesterMembership.role !== "admin") {
    return json({ error: "Only an admin can create another admin login." }, 403);
  }
  if (payload.custom_role_id && !canManageRoles) {
    return json({ error: "Only organization admins and managers can assign custom roles." }, 403);
  }
  if (payload.custom_role_id && ["admin", "manager"].includes(memberRole)) {
    return json({ error: "Built-in admin and manager accounts cannot be assigned custom roles." }, 400);
  }

  if (isUpdate) {
    if (!payload.member_id) return json({ error: "Member id is required." }, 400);
    const { data: targetMembership, error: targetError } = await admin
      .from("organization_members")
      .select("organization_id, role")
      .eq("organization_id", requesterMembership.organization_id)
      .eq("user_id", payload.member_id)
      .maybeSingle();
    if (targetError) return json({ error: targetError.message }, 500);
    if (!targetMembership || targetMembership.role === "client") return json({ error: "Employee membership was not found." }, 404);
    if (targetMembership.role === "admin" && requesterMembership.role !== "admin") return json({ error: "Only an admin can edit an admin account." }, 403);

    const authUpdate: { email: string; user_metadata: { full_name: string; name: string }; password?: string } = {
      email: memberEmail,
      user_metadata: { full_name: memberName, name: memberName },
    };
    if (memberPassword) authUpdate.password = memberPassword;
    const authUpdateResult = await admin.auth.admin.updateUserById(payload.member_id, authUpdate);
    if (authUpdateResult.error) return json({ error: authUpdateResult.error.message }, 400);
    const profileUpdate = await admin.from("profiles").update({ full_name: memberName, name: memberName, email: memberEmail }).eq("id", payload.member_id);
    if (profileUpdate.error) return json({ error: profileUpdate.error.message }, 500);
    const membershipUpdate = await admin.from("organization_members").update({
      role: memberRole,
      department_id: payload.department_id || null,
      team_id: payload.team_id || null,
      availability_status: payload.availability_status ?? "available",
      capacity_hours_per_week: payload.capacity_hours_per_week ?? 40,
      max_active_tasks: payload.max_active_tasks ?? 10,
      custom_role_id: payload.custom_role_id || null,
    }).eq("organization_id", requesterMembership.organization_id).eq("user_id", payload.member_id);
    if (membershipUpdate.error) return json({ error: membershipUpdate.error.message }, 500);
    return json({ member: { id: payload.member_id, name: memberName, email: memberEmail, role: memberRole, custom_role_id: payload.custom_role_id || null, department_id: payload.department_id || null, team_id: payload.team_id || null, availability_status: payload.availability_status ?? "available", capacity_hours_per_week: payload.capacity_hours_per_week ?? 40, max_active_tasks: payload.max_active_tasks ?? 10 } });
  }

  if (payload.custom_role_id) {
    const { data: targetRole, error: roleError } = await admin
      .from("organization_roles")
      .select("id")
      .eq("organization_id", requesterMembership.organization_id)
      .eq("id", payload.custom_role_id)
      .maybeSingle();
    if (roleError) return json({ error: roleError.message }, 500);
    if (!targetRole) return json({ error: "The selected role is not part of this organization." }, 400);
  }

  let client: { id: string; name: string; contact_email: string | null } | null = null;
  if (isClient) {
    if (!clientName) return json({ error: "Client name is required." }, 400);
    const clientResult = await admin.from("clients").insert({
      organization_id: requesterMembership.organization_id,
      name: clientName,
      contact_email: memberEmail,
    }).select("id, name, contact_email").single();
    if (clientResult.error || !clientResult.data) {
      return json({ error: clientResult.error?.message ?? "Unable to create the client." }, 400);
    }
    client = clientResult.data;
  }

  const { data: createdUser, error: userError } = await admin.auth.admin.createUser({
    email: memberEmail,
    password: memberPassword,
    email_confirm: true,
    user_metadata: { full_name: memberName, name: memberName },
  });
  if (userError || !createdUser.user) {
    if (client) await admin.from("clients").delete().eq("id", client.id);
    return json({ error: userError?.message ?? "Unable to create the team member login." }, 400);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, name")
    .eq("id", createdUser.user.id)
    .maybeSingle();
  if (profileError) {
    const cleanupUser = await admin.auth.admin.deleteUser(createdUser.user.id);
    if (client) await admin.from("clients").delete().eq("id", client.id);
    if (cleanupUser.error) console.error("Unable to clean up auth user", cleanupUser.error);
    return json({ error: profileError.message }, 500);
  }

  const { error: organizationMemberError } = await admin.from("organization_members").insert({
    organization_id: requesterMembership.organization_id,
    user_id: createdUser.user.id,
    role: isClient ? "client" : memberRole,
    custom_role_id: payload.custom_role_id || null,
    department_id: payload.department_id || null,
    team_id: payload.team_id || null,
    availability_status: payload.availability_status ?? "available",
    capacity_hours_per_week: payload.capacity_hours_per_week ?? 40,
    max_active_tasks: payload.max_active_tasks ?? 10,
  });
  if (organizationMemberError) {
    const cleanupUser = await admin.auth.admin.deleteUser(createdUser.user.id);
    if (client) await admin.from("clients").delete().eq("id", client.id);
    if (cleanupUser.error) console.error("Unable to clean up auth user", cleanupUser.error);
    return json({ error: organizationMemberError.message }, 500);
  }

  if (client) {
    const clientUserResult = await admin.from("client_users").insert({
      client_id: client.id,
      user_id: createdUser.user.id,
    });
    if (clientUserResult.error) {
      const cleanupUser = await admin.auth.admin.deleteUser(createdUser.user.id);
      await admin.from("organization_members").delete().eq("organization_id", requesterMembership.organization_id).eq("user_id", createdUser.user.id);
      await admin.from("clients").delete().eq("id", client.id);
      if (cleanupUser.error) console.error("Unable to clean up auth user", cleanupUser.error);
      return json({ error: clientUserResult.error.message }, 500);
    }
  }

  return json({
    client,
    member: {
      id: createdUser.user.id,
      name: profile?.full_name ?? profile?.name ?? memberName,
      email: memberEmail,
      role: isClient ? "client" : memberRole,
      custom_role_id: payload.custom_role_id || null,
      department_id: payload.department_id || null,
    },
  });
}
