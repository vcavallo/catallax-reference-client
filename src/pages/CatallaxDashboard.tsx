import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import {
  useArbiterAnnouncements,
  useTaskProposals,
  useTaskConclusions,
  useMyArbiterServices,
  useMyTasks,
  useTasksForWorker,
  useTasksForArbiter,
  useCatallaxInvalidation
} from '@/hooks/useCatallax';
import { LoginArea } from '@/components/auth/LoginArea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RelaySelector } from '@/components/RelaySelector';
import { ArbiterCard } from '@/components/catallax/ArbiterCard';
import { ArbiterList } from '@/components/catallax/ArbiterList';
import { TaskCard } from '@/components/catallax/TaskCard';
import { ConclusionCard } from '@/components/catallax/ConclusionCard';
import { ArbiterAnnouncementForm } from '@/components/catallax/ArbiterAnnouncementForm';
import { TaskProposalForm } from '@/components/catallax/TaskProposalForm';
import { TaskManagement } from '@/components/catallax/TaskManagement';
import { ZapModeToggle } from '@/components/catallax/ZapModeToggle';
import { Plus, Shield, Briefcase, CheckCircle, User, Search, AlertTriangle, Settings, Zap, Info } from 'lucide-react';
import { CATALLAX_KINDS, type TaskProposal } from '@/lib/catallax';

export default function CatallaxDashboard() {

  const { user } = useCurrentUser();
  const { mutate: createEvent } = useNostrPublish();
  const { toast } = useToast();
  const { invalidateAllCatallaxQueries } = useCatallaxInvalidation();
  const [activeTab, setActiveTab] = useState('discover');
  const [showCreateArbiter, setShowCreateArbiter] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskProposal | null>(null);

  // Data queries
  const { data: arbiters = [], isLoading: arbitersLoading } = useArbiterAnnouncements();
  const { data: allTasks = [], isLoading: tasksLoading } = useTaskProposals();
  const { data: conclusions = [], isLoading: conclusionsLoading } = useTaskConclusions();

  // User-specific queries
  const { data: myServices = [] } = useMyArbiterServices(user?.pubkey);
  const { data: myTasks = [] } = useMyTasks(user?.pubkey);
  const { data: workerTasks = [] } = useTasksForWorker(user?.pubkey);
  const { data: arbiterTasks = [] } = useTasksForArbiter(user?.pubkey);

  // Filter states
  const [showFundedTasks, setShowFundedTasks] = useState(false);
  const [realZapsEnabled, setRealZapsEnabled] = useLocalStorage('catallax-real-zaps-enabled', false);

  // Filter tasks by status
  const availableTasks = showFundedTasks
    ? allTasks.filter(task => task.status === 'funded' && !task.workerPubkey)
    : allTasks.filter(task => task.status === 'proposed');
  const activeTasks = allTasks.filter(task => ['in_progress', 'submitted'].includes(task.status));

  const handleTaskManage = (task: TaskProposal) => {
    setSelectedTask(task);
    setActiveTab('manage');
  };

  const handleTaskFund = (task: TaskProposal, zapReceiptId: string) => {
    // Seamlessly update task status to "funded" after Lightning payment completes
    const content = task.content;
    const tags: string[][] = [
      ['d', task.d],
      ['p', task.patronPubkey],
      ['amount', task.amount],
      ['t', 'catallax'],
      ['status', 'funded'],
      ['e', zapReceiptId, '', 'zap'], // Reference to the zap receipt
    ];

    if (task.arbiterPubkey) {
      tags.push(['p', task.arbiterPubkey]);
    }

    if (task.arbiterService) {
      tags.push(['a', task.arbiterService]);
    }

    if (task.detailsUrl) {
      tags.push(['r', task.detailsUrl]);
    }

    // Add task categories
    task.categories.forEach(category => {
      if (category !== 'catallax') {
        tags.push(['t', category]);
      }
    });

    // Automatically publish updated task proposal with funded status
    createEvent({
      kind: CATALLAX_KINDS.TASK_PROPOSAL,
      content: JSON.stringify(content),
      tags,
    }, {
      onSuccess: () => {
        toast({
          title: 'Task Funded Successfully!',
          description: `"${task.content.title}" is now funded and ready for worker assignment.`,
        });

        // Invalidate all catallax queries to refresh the UI
        invalidateAllCatallaxQueries();
      },
    });
  };

  if (selectedTask && activeTab === 'manage') {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => {
              setSelectedTask(null);
              setActiveTab('dashboard');
            }}
          >
            ← Back to Dashboard
          </Button>
        </div>
        <TaskManagement
          task={selectedTask}
          realZapsEnabled={realZapsEnabled}
          onUpdate={() => {
            setSelectedTask(null);
            setActiveTab('dashboard');
            invalidateAllCatallaxQueries();
          }}
        />
      </div>
    );
  }

  if (showCreateArbiter) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-6">
          <Button variant="outline" onClick={() => setShowCreateArbiter(false)}>
            ← Back to Dashboard
          </Button>
        </div>
        <ArbiterAnnouncementForm onSuccess={() => setShowCreateArbiter(false)} />
      </div>
    );
  }

  if (showCreateTask) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-6">
          <Button variant="outline" onClick={() => setShowCreateTask(false)}>
            ← Back to Dashboard
          </Button>
        </div>
        <TaskProposalForm onSuccess={() => setShowCreateTask(false)} />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Catallax - Decentralized Contract Work</title>
        <meta name="description" content="A decentralized platform for contract work with escrow arbitration on Nostr" />
      </Helmet>

      <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">Catallax</h1>
            <p className="text-muted-foreground">Decentralized contract work with escrow arbitration</p>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/about">
                <Info className="h-4 w-4 mr-2" />
                About
              </Link>
            </Button>
            <RelaySelector />
            <LoginArea className="max-w-60" />
          </div>
        </div>

        {/* Demo Warning */}
        {!realZapsEnabled && (
          <Alert className="mb-6 border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800 dark:text-orange-200">
              <strong>⚠️ DEMO MODE:</strong> Lightning payments are currently simulated.
              Go to Settings to enable real Lightning payments with WebLN.
            </AlertDescription>
          </Alert>
        )}

        {realZapsEnabled && (
          <Alert className="mb-6 border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
            <Zap className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              <strong>⚡ REAL LIGHTNING MODE:</strong> Payments will send actual Bitcoin.
              Make sure you have a WebLN wallet extension installed.
            </AlertDescription>
          </Alert>
        )}

        {user && (
          <div className="flex gap-2">
            <Button onClick={() => setShowCreateArbiter(true)} variant="outline">
              <Shield className="h-4 w-4 mr-2" />
              Create Arbiter Service
            </Button>
            <Button onClick={() => setShowCreateTask(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Task
            </Button>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="discover">
            <Search className="h-4 w-4 mr-2" />
            Discover
          </TabsTrigger>
          <TabsTrigger value="dashboard">
            <User className="h-4 w-4 mr-2" />
            My Dashboard
          </TabsTrigger>
          <TabsTrigger value="active">
            <Briefcase className="h-4 w-4 mr-2" />
            Active Tasks
          </TabsTrigger>
          <TabsTrigger value="history">
            <CheckCircle className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Customize what tasks you want to see</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Switch
                  id="funded-filter"
                  checked={showFundedTasks}
                  onCheckedChange={setShowFundedTasks}
                />
                <Label htmlFor="funded-filter">
                  Show funded tasks (looking for workers)
                </Label>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {showFundedTasks
                  ? "Showing funded tasks that need workers assigned"
                  : "Showing unfunded tasks that need patrons to fund them"
                }
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Available Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  {showFundedTasks ? "Tasks Looking for Workers" : "Tasks Looking for Funding"}
                  <Badge variant="secondary">{availableTasks.length}</Badge>
                </CardTitle>
                <CardDescription>
                  {showFundedTasks
                    ? "Funded tasks ready for worker assignment"
                    : "Proposed tasks waiting for patron funding"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tasksLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-32 w-full" />
                    ))}
                  </div>
                ) : availableTasks.length > 0 ? (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {availableTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        showApplyButton={showFundedTasks && user?.pubkey !== task.patronPubkey}
                        showFundButton={!showFundedTasks && !!user && !!task.arbiterPubkey}
                        realZapsEnabled={realZapsEnabled}
                        onApply={(task) => {
                          alert(`To apply for "${task.content.title}", contact the patron out-of-band. Task ID: ${task.d}`);
                        }}
                        onFund={handleTaskFund}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No available tasks found</p>
                    <RelaySelector className="mt-4" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Available Arbiters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Available Arbiters
                  <Badge variant="secondary">{arbiters.length}</Badge>
                </CardTitle>
                <CardDescription>
                  Arbiters offering escrow services
                </CardDescription>
              </CardHeader>
              <CardContent>
                {arbitersLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-32 w-full" />
                    ))}
                  </div>
                ) : arbiters.length > 0 ? (
                  <ArbiterList arbiters={arbiters} />
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No arbiters found</p>
                    <RelaySelector className="mt-4" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-6">
          {!user ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">Please log in to view your dashboard</p>
                <LoginArea className="max-w-60 mx-auto" />
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* My Services */}
              <Card>
                <CardHeader>
                  <CardTitle>My Arbiter Services</CardTitle>
                  <CardDescription>Services you're offering</CardDescription>
                </CardHeader>
                <CardContent>
                  {myServices.length > 0 ? (
                    <div className="space-y-4">
                      {myServices.map((service) => (
                        <ArbiterCard key={service.id} arbiter={service} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">No arbiter services created</p>
                      <Button onClick={() => setShowCreateArbiter(true)} variant="outline">
                        Create Service
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* My Tasks */}
              <Card>
                <CardHeader>
                  <CardTitle>My Tasks</CardTitle>
                  <CardDescription>Tasks you've created</CardDescription>
                </CardHeader>
                <CardContent>
                  {myTasks.length > 0 ? (
                    <div className="space-y-4">
                      {myTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          showManageButton
                          showFundButton
                          realZapsEnabled={realZapsEnabled}
                          onManage={handleTaskManage}
                          onFund={handleTaskFund}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">No tasks created</p>
                      <Button onClick={() => setShowCreateTask(true)} variant="outline">
                        Create Task
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tasks I'm Working On */}
              {workerTasks.length > 0 && (
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Tasks I'm Working On</CardTitle>
                    <CardDescription>Tasks assigned to you</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {workerTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          showManageButton
                          onManage={handleTaskManage}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tasks I'm Arbitrating */}
              {arbiterTasks.length > 0 && (
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Tasks I'm Arbitrating</CardTitle>
                    <CardDescription>Tasks using your arbiter services</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {arbiterTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          showManageButton
                          onManage={handleTaskManage}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="active" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Tasks</CardTitle>
              <CardDescription>Tasks currently in progress or submitted for review</CardDescription>
            </CardHeader>
            <CardContent>
              {tasksLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-48 w-full" />
                  ))}
                </div>
              ) : activeTasks.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No active tasks found</p>
                  <RelaySelector className="mt-4" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Task Conclusions</CardTitle>
              <CardDescription>Completed task resolutions and outcomes</CardDescription>
            </CardHeader>
            <CardContent>
              {conclusionsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-48 w-full" />
                  ))}
                </div>
              ) : conclusions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {conclusions.map((conclusion) => (
                    <ConclusionCard key={conclusion.id} conclusion={conclusion} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No task conclusions found</p>
                  <RelaySelector className="mt-4" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <ZapModeToggle
            realZapsEnabled={realZapsEnabled}
            onToggle={setRealZapsEnabled}
          />
        </TabsContent>
      </Tabs>

      <div className="mt-12 text-center text-sm text-muted-foreground">
        <p>
          Vibed with{' '}
          <a
            href="https://soapbox.pub/mkstack"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            MKStack
          </a>
        </p>
      </div>
    </div>
    </>
  );
}