import Link from 'next/link';
import { and, asc, eq } from 'drizzle-orm';
import { db, categories, users, providers } from '@/db';
import { requireUser } from '@/lib/auth';
import { PageHeader } from '@/components/admin/bits';
import { CampaignForm } from '@/components/admin/campaign-form';

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage() {
  await requireUser();

  const [cats, authors, text, image] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name)),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name)),
    db
      .select({ id: providers.id, label: providers.label })
      .from(providers)
      .where(and(eq(providers.kind, 'text'), eq(providers.enabled, true))),
    db
      .select({ id: providers.id, label: providers.label })
      .from(providers)
      .where(and(eq(providers.kind, 'image'), eq(providers.enabled, true))),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New campaign"
        description="Set the topic and cadence once; the scheduler handles the rest."
      >
        <Link href="/admin/campaigns" className="btn btn-ghost">
          Cancel
        </Link>
      </PageHeader>

      <CampaignForm categories={cats} authors={authors} textProviders={text} imageProviders={image} />
    </div>
  );
}
