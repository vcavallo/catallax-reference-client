import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { useNostr } from '@nostrify/react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, ExternalLink, ArrowLeft, Calendar, Bitcoin, User, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { useAuthor } from '@/hooks/useAuthor';
import { TaskManagement } from '@/components/catallax/TaskManagement';
import { CATALLAX_KINDS, parseTaskProposal, formatSats, getStatusColor, type TaskProposal } from '@/lib/catallax';
import { useCatallaxInvalidation } from '@/hooks/useCatallax';
import { genUserName } from '@/lib/genUserName';
import { RelaySelector } from '@/components/RelaySelector';
import { CopyNpubButton } from '@/components/CopyNpubButton';
import { GoalProgressBar } from '@/components/catallax/GoalProgressBar';
import { ContributorsList } from '@/components/catallax/ContributorsList';
import { CrowdfundButton } from '@/components/catallax/CrowdfundButton';

export function TaskDetail() {
  const { nip19: nip19Param } = useParams<{ nip19: string }>();
  const navigate = useNavigate();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { invalidateAllCatallaxQueries } = useCatallaxInvalidation();
  const [waitingForPayment, setWaitingForPayment] = useState(false);

  // Decode the naddr to get task details
  const taskAddress = nip19Param ? (() => {
    try {
      const decoded = nip19.decode(nip19Param);
      if (decoded.type === 'naddr' && decoded.data.kind === CATALLAX_KINDS.TASK_PROPOSAL) {
        return decoded.data;
      }
      return null;
    } catch {
      return null;
    }
  })() : null;

  const { data: task, isLoading, error } = useQuery({
    queryKey: ['task-detail', taskAddress?.pubkey, taskAddress?.identifier],
    queryFn: async (c) => {
      if (!taskAddress) return null;

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      const events = await nostr.query([{
        kinds: [CATALLAX_KINDS.TASK_PROPOSAL],
        authors: [taskAddress.pubkey],
        '#d': [taskAddress.identifier],
        limit: 100, // Get many more versions to ensure we have the latest
      }], { signal });

      if (events.length === 0) return null;

      // Parse all events and find the latest version
      const parsedTasks = events
        .map(parseTaskProposal)
        .filter((task): task is TaskProposal => task !== null);

      if (parsedTasks.length === 0) return null;

      // For replaceable events, return the one with the latest created_at
      const latestTask = parsedTasks.reduce((latest, current) =>
        current.created_at > latest.created_at ? current : latest
      );

      console.log('TaskDetail: Found', events.length, 'versions, latest status:', latestTask.status, 'created_at:', latestTask.created_at);
      console.log('TaskDetail: All versions:', parsedTasks.map(t => ({ created_at: t.created_at, status: t.status, id: t.id.slice(0, 8) })).sort((a, b) => b.created_at - a.created_at));

      return latestTask;
    },
    enabled: !!taskAddress,
    staleTime: 0, // Always consider data stale to ensure fresh queries
    refetchOnWindowFocus: true,
    refetchInterval: 10000, // Refetch every 10 seconds to catch updates
    refetchIntervalInBackground: false, // Only when tab is active
  });

  const patronAuthor = useAuthor(task?.patronPubkey);
  const arbiterAuthor = useAuthor(task?.arbiterPubkey);
  const workerAuthor = useAuthor(task?.workerPubkey);

  // Generate dynamic meta tags for social sharing
  const generateMetaDescription = (task: TaskProposal): string => {
    const amount = formatSats(task.amount);
    const description = task.content.description;

    // Start with the amount
    let metaDescription = `${amount}`;

    // Add description, truncating if necessary to fit within reasonable limits
    // Aim for around 150-160 characters total for optimal social sharing
    const maxDescriptionLength = 150 - metaDescription.length - 3; // -3 for " - "

    if (description && maxDescriptionLength > 20) {
      const truncatedDescription = description.length > maxDescriptionLength
        ? description.substring(0, maxDescriptionLength - 3) + '...'
        : description;
      metaDescription += ` - ${truncatedDescription}`;
    }

    return metaDescription;
  };

  // Generate meta tags for social sharing
  const pageTitle = task ? `${task.content.title} - Catallax` : (taskAddress ? `Task ${taskAddress.identifier} - Catallax` : 'Task - Catallax');
  const pageDescription = task ? generateMetaDescription(task) : (taskAddress
    ? `View task details and contract work opportunity on Catallax - ${taskAddress.identifier}`
    : 'A protocol for decentralized contract work on Nostr');
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const ogTitle = task ? task.content.title : pageTitle;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: `${label} copied to clipboard`,
    });
  };

  const copyTaskLink = () => {
    const url = window.location.href;
    copyToClipboard(url, 'Task link');
  };

  const copyNoteId = () => {
    if (task) {
      copyToClipboard(task.id, 'Note ID');
    }
  };

  const copyNaddr = () => {
    if (nip19Param) {
      copyToClipboard(nip19Param, 'Task address (naddr)');
    }
  };

  if (!nip19Param || !taskAddress) {
    return (
      <>
        <Helmet>
          <title>Invalid Task - Catallax</title>
          <meta name="description" content="Invalid task address. Please check the URL and try again." />
        </Helmet>

        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <Alert className="max-w-md mx-auto">
                <AlertDescription>
                  Invalid task address. Please check the URL and try again.
                </AlertDescription>
              </Alert>
              <Button
                variant="outline"
                onClick={() => navigate('/')}
                className="mt-4"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>{pageTitle}</title>
          <meta name="description" content={pageDescription} />
          <meta property="og:title" content={ogTitle} />
          <meta property="og:description" content={pageDescription} />
          <meta property="og:type" content="article" />
          <meta property="og:url" content={pageUrl} />
          <meta name="twitter:card" content="summary" />
          <meta name="twitter:title" content={ogTitle} />
          <meta name="twitter:description" content={pageDescription} />
        </Helmet>

        <div className="container mx-auto px-4 py-8">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <div className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    );
  }

  if (error || !task) {
    return (
      <>
        <Helmet>
          <title>Task Not Found - Catallax</title>
          <meta name="description" content="Task not found. It may not exist or may not be available on this relay." />
        </Helmet>

        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <div className="max-w-sm mx-auto space-y-6">
                <Alert>
                  <AlertDescription>
                    Task not found. It may not exist or may not be available on this relay.
                  </AlertDescription>
                </Alert>
                <RelaySelector className="w-full" />
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={pageUrl} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={ogTitle} />
        <meta name="twitter:description" content={pageDescription} />
      </Helmet>

      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                invalidateAllCatallaxQueries();
                queryClient.invalidateQueries({
                  queryKey: ['task-detail', taskAddress?.pubkey, taskAddress?.identifier]
                });
                toast({
                  title: 'Refreshing...',
                  description: 'Fetching latest task data from relays',
                });
              }}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={copyTaskLink}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Copy Link
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={copyNaddr}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy naddr
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={copyNoteId}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Note ID
            </Button>
          </div>
        </div>

        {/* Task Details */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <CardTitle className="text-2xl">{task.content.title}</CardTitle>
                <CardDescription>
                  Task ID: {task.d}
                </CardDescription>
              </div>
              <Badge className={getStatusColor(task.status)}>
                {task.status.replace('_', ' ')}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Description */}
            <div>
              <h3 className="font-medium mb-2">Description</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {task.content.description}
              </p>
            </div>

            {/* Requirements */}
            <div>
              <h3 className="font-medium mb-2">Requirements</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {task.content.requirements}
              </p>
            </div>

            {/* Task Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Bitcoin className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Amount</span>
                  </div>
                  <p className="text-lg font-semibold">{formatSats(task.amount)}</p>
                </CardContent>
              </Card>

              {task.content.deadline && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Deadline</span>
                    </div>
                    <p className="text-sm">
                      {new Date(task.content.deadline * 1000).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Patron</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono">
                      {patronAuthor.data?.metadata?.name || genUserName(task.patronPubkey)}
                    </p>
                    <CopyNpubButton pubkey={task.patronPubkey} size="sm" className="h-6 w-6 p-0" />
                  </div>
                </CardContent>
              </Card>

              {task.arbiterPubkey && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Arbiter</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-mono">
                        {arbiterAuthor.data?.metadata?.name || genUserName(task.arbiterPubkey)}
                      </p>
                      <CopyNpubButton pubkey={task.arbiterPubkey} size="sm" className="h-6 w-6 p-0" />
                    </div>
                  </CardContent>
                </Card>
              )}

              {task.workerPubkey && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Worker</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-mono">
                        {workerAuthor.data?.metadata?.name || genUserName(task.workerPubkey)}
                      </p>
                      <CopyNpubButton pubkey={task.workerPubkey} size="sm" className="h-6 w-6 p-0" />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Crowdfunding Progress */}
            {task.fundingType === 'crowdfunding' && task.goalId && (
              <div>
                <h3 className="font-medium mb-2">Crowdfunding Progress</h3>
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <GoalProgressBar
                      goalId={task.goalId}
                      waitingForPayment={waitingForPayment}
                      onWaitingComplete={() => setWaitingForPayment(false)}
                    />

                    {task.status === 'proposed' && (
                      <CrowdfundButton
                        task={task}
                        realZapsEnabled={true}
                        onPaymentComplete={() => setWaitingForPayment(true)}
                      />
                    )}

                    <ContributorsList goalId={task.goalId} />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Categories */}
            {task.categories.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Categories</h3>
                <div className="flex flex-wrap gap-2">
                  {task.categories.filter(cat => cat !== 'catallax').map((category) => (
                    <Badge key={category} variant="secondary">
                      {category}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Technical Details */}
            <div className="border-t pt-4">
              <h3 className="font-medium mb-2">Technical Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium">Event ID:</span>
                  <p className="font-mono break-all">{task.id}</p>
                </div>
                <div>
                  <span className="font-medium">Task Address (naddr):</span>
                  <p className="font-mono break-all">{nip19Param}</p>
                </div>
                <div>
                  <span className="font-medium">Created:</span>
                  <p>{new Date(task.created_at * 1000).toLocaleString()}</p>
                </div>
                <div>
                  <span className="font-medium">Kind:</span>
                  <p>{CATALLAX_KINDS.TASK_PROPOSAL} (Task Proposal)</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Task Management */}
        <TaskManagement
          task={task}
          realZapsEnabled={true}
          onUpdate={() => {
            // Invalidate and refetch the task detail query
            invalidateAllCatallaxQueries();
            queryClient.invalidateQueries({
              queryKey: ['task-detail', taskAddress?.pubkey, taskAddress?.identifier]
            });
          }}
        />
        </div>
      </div>
    </>
  );
}
