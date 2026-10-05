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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
