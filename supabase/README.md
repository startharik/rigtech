# Rigtech Supabase setup

## Apply migrations with the Supabase CLI

The project is linked to the `rigtech` Supabase project. From the repository
root, use:

```powershell
supabase link --project-ref ljgewfboutjaulynuban
supabase db push --linked --yes
```

The migrations have been pushed to the linked project. Check the state with:

```powershell
supabase migration list --linked
```

The migration creates the organization, membership, profile, department, team,
client, task, comment, attachment, activity, and notification tables.

Deploy the employee provisioning function after pulling this project:

```powershell
supabase functions deploy create-team-member --project-ref ljgewfboutjaulynuban
```

The function uses Supabase's server-side service-role environment variable and
never exposes it to the browser.

## Organization bootstrap

The publishable client intentionally cannot create an organization or bypass
RLS. Create the first organization and membership from a trusted migration,
server-side admin script, or the Supabase dashboard using the `service_role`
key. Never expose the `service_role` key in `.env.local`, browser code, or a
mobile bundle.

Example trusted bootstrap SQL after the first user signs up:

```sql
insert into public.organizations (name, slug)
values ('RIGTECH ENGINEERING', 'rigtech-engineering')
returning id;

insert into public.organization_members (organization_id, user_id, role)
values ('ORGANIZATION_UUID', 'AUTH_USER_UUID', 'admin');
```

## Client behavior

- Signed-in users load tasks through the RLS-protected `task_tree` view.
- Signed-in users create tasks through the RLS-protected `tasks` table.
- Anonymous users cannot access the workspace. They must sign in or create an
  account first.
- A new authenticated user without an organization is guided through secure
  organization onboarding.
- Nested work is represented by `tasks.parent_task_id`; a subtask is the same
  entity as a top-level task.
- Organization admins and managers can create an employee login with an email,
  initial password, role, and department. The function creates a confirmed Auth
  user, profile, and organization membership. Employees sign in through the
  normal Rigtech sign-in screen and see tasks allowed by the organization RLS
  policies.
- Employees can be edited from the Employees table. Admins and managers can
  update the employee name, login email, role, department, and optionally reset
  the password through the server-side function.
- Task comments, nested subtasks, and attachments are stored in Supabase.
  Attachments use the private `task-attachments` Storage bucket and are linked
  to either a parent task or subtask through `public.attachments`.
- Projects are organization-scoped records. Tasks may reference a project
  through `tasks.project_id`, or remain standalone. The task page supports
  list and Kanban layouts, and completion is calculated from nested subtasks
  (or from task status when no subtasks exist).
- Organization admins and managers can also create a client portal login with
  an email and initial password. The client is linked to the account through
  `client_users`; client accounts can only read tasks marked `client_visible`
  for their linked client.
