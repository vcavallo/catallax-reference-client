import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Shield, Info, Eye } from 'lucide-react';
import { ArbiterSelectItem } from './ArbiterSelectItem';
import { ArbiterWithGrapeRank } from './ArbiterWithGrapeRank';
import { CATALLAX_GLOBAL_OPINION_PUBKEY, PRETTY_GOOD_FREEDOM_TECH_PUBKEY } from '@/hooks/useGrapeRank';
import type { ArbiterAnnouncement } from '@/lib/catallax';

interface FilteredArbiterSelectProps {
  arbiters: ArbiterAnnouncement[];
  value: string;
  onValueChange: (value: string) => void;
  onlyGrapeTrusted: boolean;
  onOnlyGrapeTrustedChange: (value: boolean) => void;
}

function FilteredArbiterSelectItem({
  arbiter,
  onlyGrapeTrusted,
  authorPubkey
}: {
  arbiter: ArbiterAnnouncement;
  onlyGrapeTrusted: boolean;
  authorPubkey?: string;
}) {
  return (
    <ArbiterWithGrapeRank arbiter={arbiter} authorPubkey={authorPubkey}>
      {({ arbiter, hasGrapeRank }) => {
        // Hide non-trusted arbiters if filter is enabled
        if (onlyGrapeTrusted && !hasGrapeRank) {
          return null;
        }

        return (
          <SelectItem key={`${arbiter.arbiterPubkey}:${arbiter.d}`} value={`${arbiter.arbiterPubkey}:${arbiter.d}`}>
            <ArbiterSelectItem arbiter={arbiter} />
          </SelectItem>
        );
      }}
    </ArbiterWithGrapeRank>
  );
}

export function FilteredArbiterSelect({
  arbiters,
  value,
  onValueChange,
  onlyGrapeTrusted,
  onOnlyGrapeTrustedChange
}: FilteredArbiterSelectProps) {
  const [pointOfView, setPointOfView] = useState<string>(CATALLAX_GLOBAL_OPINION_PUBKEY);

  return (
    <div className="space-y-3">
      {/* Point of View Selector */}
      <div className="space-y-2 p-2 bg-muted/50 rounded">
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

      {/* Toggle for filtering */}
      <div className="flex items-center space-x-2 p-2 bg-muted/50 rounded">
        <Switch
          id="grape-trusted-only"
          checked={onlyGrapeTrusted}
          onCheckedChange={onOnlyGrapeTrustedChange}
        />
        <Label htmlFor="grape-trusted-only" className="flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4" />
          Only show Grape trusted arbiters
        </Label>
        <Link
          to="/about#grape-rank"
          className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
          title="Learn about Grape Rank"
        >
          <Info className="h-4 w-4" />
        </Link>
      </div>

      {/* Arbiter Select */}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Choose an arbiter for this task" />
        </SelectTrigger>
        <SelectContent>
          {arbiters.map((arbiter) => (
            <FilteredArbiterSelectItem
              key={arbiter.id}
              arbiter={arbiter}
              onlyGrapeTrusted={onlyGrapeTrusted}
              authorPubkey={pointOfView}
            />
          ))}
        </SelectContent>
      </Select>

      {/* Status messages */}
      {arbiters.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No arbiters available. Someone needs to create an arbiter service first.
        </p>
      )}

      {onlyGrapeTrusted && (
        <p className="text-xs text-muted-foreground">
          Only showing arbiters with GrapeRank data
        </p>
      )}
    </div>
  );
}