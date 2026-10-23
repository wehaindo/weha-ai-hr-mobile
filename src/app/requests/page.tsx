'use client';

// ESS Requests (BRD §4.5): consolidated history across all request types,
// filters, detail with approval timeline, and the new-request flow for
// permission / overtime / attendance correction (leave lives on /leave).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Clock, Plus, Timer, Wrench } from 'lucide-react';
import { useLeave } from '@/hooks/useLeave';
import { useRequests } from '@/hooks/useRequests';
import { toast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { RequestForm, type RequestFormType } from '@/components/ess/requests/request-form';
import { RequestList } from '@/components/ess/requests/request-list';
import { RequestDetailDialog } from '@/components/ess/requests/request-detail';
import type { EssRequestStatus } from '@/integration/ess/requests';

const STATUS_FILTERS: Array<{ label: string; status?: EssRequestStatus }> = [
  { label: 'All' },
  { label: 'Submitted', status: 'SUBMITTED' },
  { label: 'In review', status: 'IN_REVIEW' },
  { label: 'Returned', status: 'RETURNED' },
  { label: 'Approved', status: 'APPROVED' },
  { label: 'Rejected', status: 'REJECTED' },
];

const TYPE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'All types', value: '' },
  { label: 'Leave', value: 'LEAVE' },
  { label: 'Permission', value: 'PERMISSION' },
  { label: 'Overtime', value: 'OVERTIME' },
  { label: 'Attendance correction', value: 'ATTENDANCE_CORRECTION' },
];

const PICKER_ITEMS: Array<{ type: RequestFormType; label: string; icon: typeof Clock; hint: string }> = [
  { type: 'PERMISSION', label: 'Permission / absence', icon: Clock, hint: 'Sick, family, late/early, emergency' },
  { type: 'OVERTIME', label: 'Overtime', icon: Timer, hint: 'Planned hours, reconciled after attendance' },
  { type: 'ATTENDANCE_CORRECTION', label: 'Attendance correction', icon: Wrench, hint: 'Fix a missing or wrong punch' },
];

export default function RequestsPage() {
  const router = useRouter();
  const requests = useRequests();
  const leave = useLeave();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formType, setFormType] = useState<RequestFormType | null>(null);

  const ready = requests.state.status === 'ready';

  async function submitForm(
    submission: Parameters<typeof requests.submit>[1],
    files: Parameters<typeof requests.submit>[2]
  ) {
    if (!formType) return;
    await requests.submit(formType, submission, files);
    setFormType(null);
    toast.add({ title: 'Request submitted', description: 'It is now waiting for approval.', type: 'success' });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="requests-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Requests</h2>
          <p className="text-sm text-muted-foreground">Leave, permission, overtime and attendance corrections — one history.</p>
        </div>
        {ready && (
          <Button size="sm" data-testid="new-request" onClick={() => setPickerOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            New request
          </Button>
        )}
      </div>

      {requests.state.status === 'loading' || requests.state.status === 'idle' ? (
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>
      ) : requests.state.status === 'no_session' ? (
        <Card data-testid="requests-no-session">
          <CardHeader className="pb-2">
            <CardDescription>Requests</CardDescription>
            <CardTitle className="text-lg">No employee session on this device</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sign in with your WEHA account to submit and track HR requests.
          </CardContent>
        </Card>
      ) : requests.state.status === 'error' ? (
        <Card data-testid="requests-error">
          <CardHeader className="pb-2">
            <CardDescription>Requests</CardDescription>
            <CardTitle className="text-lg">Could not load requests</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{requests.state.error.message}</span>
            <Button variant="outline" size="sm" onClick={requests.reload}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" data-testid="request-filters">
            {STATUS_FILTERS.map((filter) => (
              <Button
                key={filter.label}
                variant={(requests.filters.status ?? '') === (filter.status ?? '') ? 'default' : 'outline'}
                size="sm"
                data-testid={`filter-${filter.label.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => requests.setFilters({ ...requests.filters, status: filter.status })}
              >
                {filter.label}
              </Button>
            ))}
            <select
              aria-label="Filter by type"
              data-testid="filter-type"
              className="ml-auto h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={requests.filters.type ?? ''}
              onChange={(e) => requests.setFilters({ ...requests.filters, type: (e.target.value || undefined) as never })}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <RequestList requests={requests.state.requests} onSelect={requests.openDetail} />

          <RequestDetailDialog
            detail={requests.detail}
            onClose={requests.closeDetail}
            onCancel={(id, reason) => requests.cancel(id, reason)}
            onResubmit={requests.resubmit}
            download={requests.download}
          />

          {/* New-request type picker */}
          <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
            <DialogContent data-testid="request-type-picker">
              <DialogHeader>
                <DialogTitle>New request</DialogTitle>
                <DialogDescription>Choose the kind of request to submit.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left hover:bg-muted/50"
                  data-testid="picker-leave"
                  onClick={() => {
                    setPickerOpen(false);
                    router.push('/leave');
                  }}
                >
                  <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">Leave</span>
                    <span className="block text-xs text-muted-foreground">Balances and annual/sick leave</span>
                  </span>
                  <Badge variant="secondary" className="ml-auto">
                    /leave
                  </Badge>
                </button>
                {PICKER_ITEMS.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left hover:bg-muted/50"
                    data-testid={`picker-${item.type.toLowerCase().replace(/_/g, '-')}`}
                    onClick={() => {
                      setPickerOpen(false);
                      setFormType(item.type);
                    }}
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">{item.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          {/* Type-driven request form */}
          <Dialog open={formType !== null} onOpenChange={(open) => !open && setFormType(null)}>
            <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="request-form-dialog">
              <DialogHeader>
                <DialogTitle>New request</DialogTitle>
                <DialogDescription>Validated on the server before it enters the approval flow.</DialogDescription>
              </DialogHeader>
              {formType && leave.state.status === 'ready' ? (
                <RequestForm
                  type={formType}
                  permissionTypes={leave.state.types.permissionTypes}
                  onSubmit={submitForm}
                  onCancel={() => setFormType(null)}
                />
              ) : (
                <Skeleton className="h-40 w-full" />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
