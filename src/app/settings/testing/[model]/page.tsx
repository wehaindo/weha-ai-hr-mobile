// Server page for a single testing model. Exports generateStaticParams (required
// for `output: export`) so the four known models are prerendered, and renders the
// client CRUD component (which reads the model id from the route).

import ModelCrud from '@/components/testing/model-crud';
import { listTestModels } from '@/testing/registry';

export function generateStaticParams() {
  return listTestModels().map((m) => ({ model: m.id }));
}

export default function TestModelPage() {
  return <ModelCrud />;
}
