'use client';

// Cloud Sync — a single tab composing the three cloud orderline destinations
// (Google Sheets, Supabase, Grist), following ai-pos's orderline-sync-tab
// pattern. Each destination is a self-contained section.

import { Separator } from '@/components/ui/separator';
import { GoogleSection } from '@/components/cloud-sync/google-section';
import { SupabaseSection } from '@/components/cloud-sync/supabase-section';
import { GristSection } from '@/components/cloud-sync/grist-section';

export default function CloudSyncSettingsPage() {
  return (
    <div className="space-y-8" data-testid="cloud-sync-settings">
      <section>
        <h3 className="mb-4 text-lg font-semibold">Google Sheets</h3>
        <GoogleSection />
      </section>

      <Separator />

      <section>
        <h3 className="mb-4 text-lg font-semibold">Supabase</h3>
        <SupabaseSection />
      </section>

      <Separator />

      <section>
        <h3 className="mb-4 text-lg font-semibold">Grist</h3>
        <GristSection />
      </section>
    </div>
  );
}
