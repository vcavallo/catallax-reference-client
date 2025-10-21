import { useAuthor } from '@/hooks/useAuthor';
import { useGrapeRank } from '@/hooks/useGrapeRank';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Shield, Users, TrendingUp } from 'lucide-react';
import { genUserName } from '@/lib/genUserName';
import { formatFee, type ArbiterAnnouncement } from '@/lib/catallax';
import { CopyNpubButton } from '@/components/CopyNpubButton';

interface ArbiterCardProps {
  arbiter: ArbiterAnnouncement;
  onSelect?: (arbiter: ArbiterAnnouncement) => void;
  showSelectButton?: boolean;
}

export function ArbiterCard({ arbiter, onSelect, showSelectButton }: ArbiterCardProps) {
  const author = useAuthor(arbiter.arbiterPubkey);
  const grapeRank = useGrapeRank(arbiter.arbiterPubkey);
  const metadata = author.data?.metadata;

  const displayName = metadata?.name ?? genUserName(arbiter.arbiterPubkey);
  const profileImage = metadata?.picture;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profileImage} alt={displayName} />
              <AvatarFallback>
                <Shield className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{arbiter.content.name}</CardTitle>
              <CardDescription className="flex items-center gap-1">
                by {displayName}
                <CopyNpubButton pubkey={arbiter.arbiterPubkey} size="sm" className="h-5 w-5 p-0" />
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="ml-2">
            {formatFee(arbiter.feeType, arbiter.feeAmount)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {arbiter.content.about && (
          <p className="text-sm text-muted-foreground">{arbiter.content.about}</p>
        )}

        {arbiter.categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {arbiter.categories.map((category) => (
              <Badge key={category} variant="secondary" className="text-xs">
                {category}
              </Badge>
            ))}
          </div>
        )}

        {/* GrapeRank Information */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Grape Rank:
            </span>
            {grapeRank.isLoading ? (
              <Skeleton className="h-4 w-8" />
            ) : grapeRank.data?.rank !== null && grapeRank.data?.rank !== undefined ? (
              <span className="font-medium">#{grapeRank.data.rank}</span>
            ) : (
              <span className="text-muted-foreground text-xs">N/A</span>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              GrapeVerified Followers:
            </span>
            {grapeRank.isLoading ? (
              <Skeleton className="h-4 w-12" />
            ) : grapeRank.data?.verifiedFollowerCount !== null && grapeRank.data?.verifiedFollowerCount !== undefined ? (
              <span className="font-medium">{grapeRank.data.verifiedFollowerCount.toLocaleString()}</span>
            ) : (
              <span className="text-muted-foreground text-xs">N/A</span>
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          {arbiter.minAmount && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Min Amount:</span>
              <span>{parseInt(arbiter.minAmount).toLocaleString()} sats</span>
            </div>
          )}
          {arbiter.maxAmount && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Amount:</span>
              <span>{parseInt(arbiter.maxAmount).toLocaleString()} sats</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          {arbiter.detailsUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={arbiter.detailsUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                Details
              </a>
            </Button>
          )}

          {arbiter.content.policy_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={arbiter.content.policy_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                Policy
              </a>
            </Button>
          )}

          {showSelectButton && onSelect && (
            <Button size="sm" onClick={() => onSelect(arbiter)} className="ml-auto">
              Select
            </Button>
          )}
        </div>

        {arbiter.content.policy_text && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              View Policy
            </summary>
            <div className="mt-2 p-3 bg-muted rounded text-xs whitespace-pre-wrap">
              {arbiter.content.policy_text}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}