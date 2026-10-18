'use client';

import dynamic from 'next/dynamic';

// The receipt/label designer pulls in Fabric.js, which needs the browser canvas.
// Load it client-side only so the static export prerender doesn't try to SSR it.
const TemplateManager = dynamic(() => import('@/components/print/TemplateManager'), { ssr: false });

export default function PrintTemplatesSettingsPage() {
  return (
    <div data-testid="print-templates-settings">
      <TemplateManager />
    </div>
  );
}
