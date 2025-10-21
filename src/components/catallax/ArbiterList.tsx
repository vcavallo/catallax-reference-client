import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArbiterCard } from './ArbiterCard';
import { ArbiterWithGrapeRank } from './ArbiterWithGrapeRank';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, EyeOff, Info, Eye } from 'lucide-react';
import { useGrapeRank, CATALLAX_GLOBAL_OPINION_PUBKEY, PRETTY_GOOD_FREEDOM_TECH_PUBKEY } from '@/hooks/useGrapeRank';
import type { ArbiterAnnouncement } from '@/lib/catallax';

interface ArbiterListProps {
  arbiters: ArbiterAnnouncement[];
  onSelect?: (arbiter: ArbiterAnnouncement) => void;
  showSelectButton?: boolean;
}

// Individual arbiter item with GrapeRank data
function ArbiterItemWithRank({
  arbiter,
  onSelect,
  showSelectButton,
  hideUnknownArbiters,
  authorPubkey
}: {
  arbiter: ArbiterAnnouncement;
  onSelect?: (arbiter: ArbiterAnnouncement) => void;
  showSelectButton?: boolean;
  hideUnknownArbiters: boolean;
  authorPubkey?: string;
}) {
  return (
    <ArbiterWithGrapeRank arbiter={arbiter} authorPubkey={authorPubkey}>
      {({ arbiter, hasGrapeRank }) => {
        // Hide unknown arbiters if filter is enabled
        if (hideUnknownArbiters && !hasGrapeRank) {
          return null;
        }

        return (
          <ArbiterCard
            arbiter={arbiter}
            onSelect={onSelect}
            showSelectButton={showSelectButton}
          />
        );
      }}
    </ArbiterWithGrapeRank>
  );
}

// Component that renders an arbiter with sort priority
function SortableArbiterItem({
  arbiter,
  onSelect,
  showSelectButton,
  hideUnknownArbiters,
  onSortData,
  authorPubkey
}: {
  arbiter: ArbiterAnnouncement;
  onSelect?: (arbiter: ArbiterAnnouncement) => void;
  showSelectButton?: boolean;
  hideUnknownArbiters: boolean;
  onSortData: (arbiter: ArbiterAnnouncement, rank: number | null) => void;
  authorPubkey?: string;
}) {
  const grapeRank = useGrapeRank(arbiter.arbiterPubkey, authorPubkey);

  // Report sort data to parent
  React.useEffect(() => {
    onSortData(arbiter, grapeRank.data?.rank ?? null);
  }, [arbiter, grapeRank.data?.rank, onSortData]);

  return (
    <ArbiterWithGrapeRank arbiter={arbiter} authorPubkey={authorPubkey}>
      {({ arbiter, hasGrapeRank }) => {
        // Hide unknown arbiters if filter is enabled
        if (hideUnknownArbiters && !hasGrapeRank) {
          return null;
        }

        return (
          <ArbiterCard
            arbiter={arbiter}
            onSelect={onSelect}
            showSelectButton={showSelectButton}
          />
        );
      }}
    </ArbiterWithGrapeRank>
  );
}

// Component that handles sorting by GrapeRank
function SortedArbiterList({
  arbiters,
  onSelect,
  showSelectButton,
  hideUnknownArbiters,
  authorPubkey
}: {
  arbiters: ArbiterAnnouncement[];
  onSelect?: (arbiter: ArbiterAnnouncement) => void;
  showSelectButton?: boolean;
  hideUnknownArbiters: boolean;
  authorPubkey?: string;
}) {
  const [sortData, setSortData] = useState<Map<string, number | null>>(new Map());

  const handleSortData = React.useCallback((arbiter: ArbiterAnnouncement, rank: number | null) => {
    setSortData(prev => new Map(prev.set(arbiter.id, rank)));
  }, []);

  // Sort arbiters by rank
  const sortedArbiters = useMemo(() => {
    return [...arbiters].sort((a, b) => {
      const aRank = sortData.get(a.id);
      const bRank = sortData.get(b.id);

      // If both have ranks, sort by rank (lower is better)
      if (aRank !== null && aRank !== undefined && bRank !== null && bRank !== undefined) {
        return aRank - bRank;
      }
      // Ranked arbiters come before unranked
      if (aRank !== null && aRank !== undefined && (bRank === null || bRank === undefined)) {
        return -1;
      }
      if ((aRank === null || aRank === undefined) && bRank !== null && bRank !== undefined) {
        return 1;
      }
      // Both unranked, maintain original order
      return 0;
    });
  }, [arbiters, sortData]);

  return (
    <>
      {sortedArbiters.map((arbiter) => (
        <SortableArbiterItem
          key={arbiter.id}
          arbiter={arbiter}
          onSelect={onSelect}
          showSelectButton={showSelectButton}
          hideUnknownArbiters={hideUnknownArbiters}
          onSortData={handleSortData}
          authorPubkey={authorPubkey}
        />
      ))}
    </>
  );
}

export function ArbiterList({ arbiters, onSelect, showSelectButton }: ArbiterListProps) {
  const [hideUnknownArbiters, setHideUnknownArbiters] = useState(false);
  const [sortByGrapeRank, setSortByGrapeRank] = useState(false);
  const [pointOfView, setPointOfView] = useState<string>(CATALLAX_GLOBAL_OPINION_PUBKEY);

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="flex flex-col gap-3 p-3 bg-muted/50 rounded-lg">
        {/* Point of View Selector */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Eye className="h-4 w-4" />
            Point of View
          </Label>
          <Select value={pointOfView} onValueChange={setPointOfView}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CATALLAX_GLOBAL_OPINION_PUBKEY}>
                Catallax Demo Client
              </SelectItem>
              <SelectItem value={PRETTY_GOOD_FREEDOM_TECH_PUBKEY}>
                Pretty Good Freedom Tech
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="hide-unknown"
            checked={hideUnknownArbiters}
            onCheckedChange={setHideUnknownArbiters}
          />
          <Label htmlFor="hide-unknown" className="flex items-center gap-2 text-sm">
            <EyeOff className="h-4 w-4" />
            Hide unknown arbiters
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="sort-grape-rank"
            checked={sortByGrapeRank}
            onCheckedChange={setSortByGrapeRank}
          />
          <Label htmlFor="sort-grape-rank" className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4" />
            Sort by Grape Rank
          </Label>
          <Link
            to="/about#grape-rank"
            className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Learn about Grape Rank"
          >
            <Info className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <Separator />

      {/* Arbiter List */}
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {sortByGrapeRank ? (
          <SortedArbiterList
            arbiters={arbiters}
            onSelect={onSelect}
            showSelectButton={showSelectButton}
            hideUnknownArbiters={hideUnknownArbiters}
            authorPubkey={pointOfView}
          />
        ) : (
          arbiters.map((arbiter) => (
            <ArbiterItemWithRank
              key={arbiter.id}
              arbiter={arbiter}
              onSelect={onSelect}
              showSelectButton={showSelectButton}
              hideUnknownArbiters={hideUnknownArbiters}
              authorPubkey={pointOfView}
            />
          ))
        )}
      </div>

      {hideUnknownArbiters && (
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            Note: Arbiters without GrapeRank data are hidden
          </p>
        </div>
      )}
    </div>
  );
}