import { useAuthor } from '@/hooks/useAuthor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyNpubButton } from '@/components/CopyNpubButton';
import { useToast } from '@/hooks/useToast';

import { CheckCircle, XCircle, AlertCircle, MinusCircle, User, Copy } from 'lucide-react';
import { genUserName } from '@/lib/genUserName';
import { getResolutionColor, type TaskConclusion } from '@/lib/catallax';
import { format } from 'date-fns';

interface ConclusionCardProps {
  conclusion: TaskConclusion;
}

const resolutionIcons = {
  successful: CheckCircle,
  rejected: XCircle,
  cancelled: AlertCircle,
  abandoned: MinusCircle,
};

const resolutionColors = {
  successful: 'text-green-600',
  rejected: 'text-red-600',
  cancelled: 'text-orange-600',
  abandoned: 'text-gray-600',
};

export function ConclusionCard({ conclusion }: ConclusionCardProps) {
  const { toast } = useToast();
  const arbiterAuthor = useAuthor(conclusion.arbiterPubkey || '');
  const patronAuthor = useAuthor(conclusion.patronPubkey || '');
  const workerAuthor = useAuthor(conclusion.workerPubkey || '');

  const arbiterMetadata = arbiterAuthor.data?.metadata;
  const patronMetadata = patronAuthor.data?.metadata;
  const workerMetadata = workerAuthor.data?.metadata;

  const arbiterName = arbiterMetadata?.name ?? genUserName(conclusion.arbiterPubkey || '');
  const patronName = patronMetadata?.name ?? genUserName(conclusion.patronPubkey || '');
  const workerName = workerMetadata?.name ?? genUserName(conclusion.workerPubkey || '');

  const ResolutionIcon = resolutionIcons[conclusion.resolution];

  const copyEventId = () => {
    navigator.clipboard.writeText(conclusion.id);
    toast({
      title: 'Copied!',
      description: 'Conclusion event ID copied to clipboard',
    });
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <ResolutionIcon className={`h-6 w-6 ${resolutionColors[conclusion.resolution]}`} />
            <div>
              <CardTitle className="text-lg">Task Concluded</CardTitle>
              <CardDescription>
                {format(new Date(conclusion.created_at * 1000), 'PPp')}
              </CardDescription>
            </div>
          </div>
          <Badge className={getResolutionColor(conclusion.resolution)}>
            {conclusion.resolution}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <h4 className="font-medium mb-2">Resolution Details</h4>
          <p className="text-sm text-muted-foreground">
            {conclusion.content.resolution_details}
          </p>
        </div>

        <div className="space-y-2 text-sm">
          {conclusion.patronPubkey && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Patron:</span>
              <span>{patronName}</span>
              <CopyNpubButton pubkey={conclusion.patronPubkey} size="sm" className="h-5 w-5 p-0" />
            </div>
          )}

          {conclusion.arbiterPubkey && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Arbiter:</span>
              <span>{arbiterName}</span>
              <CopyNpubButton pubkey={conclusion.arbiterPubkey} size="sm" className="h-5 w-5 p-0" />
            </div>
          )}

          {conclusion.workerPubkey && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Worker:</span>
              <span>{workerName}</span>
              <CopyNpubButton pubkey={conclusion.workerPubkey} size="sm" className="h-5 w-5 p-0" />
            </div>
          )}
        </div>

        {conclusion.payoutZapReceiptId && (
          <div className="bg-muted p-3 rounded text-sm">
            <span className="font-medium">Payout Receipt:</span>
            <p className="font-mono text-xs mt-1 break-all">
              {conclusion.payoutZapReceiptId}
            </p>
          </div>
        )}

        {conclusion.taskReference && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Task Reference:</span>
            <p className="font-mono break-all">{conclusion.taskReference}</p>
          </div>
        )}

        <div className="border-t pt-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Conclusion Event ID:</span>
              <p className="font-mono text-xs mt-1 break-all">{conclusion.id}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={copyEventId}
              className="ml-2 h-7 w-7 p-0"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}