This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Stock management

The workspace includes an organization-wide stock catalogue, incoming delivery receipts, and project/area stock issues. Stock balances update atomically when a movement is recorded; issues that exceed available stock are rejected. Internal workspace members can view stock records; admins, managers, and supervisors can manage them.

Apply the pending SQL migrations in `supabase/migrations` to the Supabase project before using the stock module. New stock inventories start empty; add catalogue items and record receipts to establish balances.

## Document management

Internal workspace members can upload files up to 50 MB each, organize files in nested folders, and optionally link them to a project. Documents are stored in a private Supabase Storage bucket and downloaded using short-lived signed URLs. Admins, managers, and supervisors can delete workspace documents.

Apply the document-management migration in `supabase/migrations` before using the document library.

## Roles and module access

Migration `20261005160000_module_roles_and_access.sql` adds organization-specific roles with separate View and Manage permissions for each module. Admin accounts retain full access; custom roles are enforced by both the application and Supabase row-level security policies. Apply the migration before deploying the updated web app, then deploy the updated `create-team-member` Edge Function:

```powershell
supabase db push
supabase functions deploy create-team-member
```

Only organization admins and managers can create custom roles or assign them to employee and client accounts. Verify the migration against the target Supabase project before applying it.

If sticky notes report that Supabase could not be reached, check the browser's network connection and the configured Supabase project URL. A failed network request preserves the note draft for retry; it cannot be saved until the browser can reach Supabase.

## Android app

The Android app is a small Capacitor shell that loads the public Rigtech site at `https://rigtech-two.vercel.app`, so web deployments appear without reinstalling the app. An internet connection is required. If the site address changes, update `server.url` in `capacitor.config.ts`.

With Java 17 and the Android SDK installed, build the installable debug APK on Windows. If `ANDROID_HOME` is not already set, point it to your SDK location:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm install
npm run android:apk
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. For Android Studio, use `npm run android:open`. The debug APK is for testing and is not release-signed.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
