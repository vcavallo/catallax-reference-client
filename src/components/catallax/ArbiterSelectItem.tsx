import { useGrapeRank } from '@/hooks/useGrapeRank';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Users } from 'lucide-react';
import { formatFee, type ArbiterAnnouncement } from '@/lib/catallax';

interface ArbiterSelectItemProps {
  arbiter: ArbiterAnnouncement;
}

export function ArbiterSelectItem({ arbiter }: ArbiterSelectItemProps) {
  const grapeRank = useGrapeRank(arbiter.arbiterPubkey);

  return (
    <div className="flex flex-col space-y-1">
      <div className="flex justify-between items-center">
        <span className="font-medium">{arbiter.content.name}</span>
        <span className="text-sm text-muted-foreground">
          Fee: {formatFee(arbiter.feeType, arbiter.feeAmount)}
        </span>
      </div>

      <div className="flex justify-between items-center text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            <span>Rank:</span>
            {grapeRank.isLoading ? (
              <Skeleton className="h-3 w-6" />
            ) : grapeRank.data?.rank !== null && grapeRank.data?.rank !== undefined ? (
              <span>#{grapeRank.data.rank}</span>
            ) : (
              <span>N/A</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span>Followers:</span>
            {grapeRank.isLoading ? (
              <Skeleton className="h-3 w-8" />
            ) : grapeRank.data?.verifiedFollowerCount !== null && grapeRank.data?.verifiedFollowerCount !== undefined ? (
              <span>{grapeRank.data.verifiedFollowerCount.toLocaleString()}</span>
            ) : (
              <span>N/A</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}