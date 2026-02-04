import { ArrowUp, ArrowDown, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { ArbiterAnnouncement } from '@/lib/catallax';

export type ArbiterSortField = 'date' | 'fee_percent' | 'fee_flat' | 'experience';
export type SortDirection = 'asc' | 'desc';

export interface ArbiterFilterState {
  sortField: ArbiterSortField;
  sortDirection: SortDirection;
  onlyFollowing: boolean;
}

interface ArbiterFiltersProps {
  filters: ArbiterFilterState;
  onFiltersChange: (filters: ArbiterFilterState) => void;
  userFollows?: string[];
  isLoggedIn: boolean;
}

export function ArbiterFilters({ filters, onFiltersChange, userFollows, isLoggedIn }: ArbiterFiltersProps) {
  const toggleSortDirection = () => {
    onFiltersChange({
      ...filters,
      sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc',
    });
  };

  const SortIcon = filters.sortDirection === 'asc' ? ArrowUp : ArrowDown;

  const getSortLabel = () => {
    switch (filters.sortField) {
      case 'date':
        return filters.sortDirection === 'asc' ? 'Oldest' : 'Newest';
      case 'fee_percent':
        return filters.sortDirection === 'asc' ? 'Lowest %' : 'Highest %';
      case 'fee_flat':
        return filters.sortDirection === 'asc' ? 'Lowest fee' : 'Highest fee';
      case 'experience':
        return filters.sortDirection === 'asc' ? 'Least exp.' : 'Most exp.';
      default:
        return '';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Sort field */}
      <Select
        value={filters.sortField}
        onValueChange={(value) => onFiltersChange({ ...filters, sortField: value as ArbiterSortField })}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date">Date Created</SelectItem>
          <SelectItem value="fee_percent">Fee (Percentage)</SelectItem>
          <SelectItem value="fee_flat">Fee (Flat Amount)</SelectItem>
          <SelectItem value="experience">Experience</SelectItem>
        </SelectContent>
      </Select>

      {/* Sort direction toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={toggleSortDirection}
        className="gap-1"
      >
        <SortIcon className="h-4 w-4" />
        {getSortLabel()}
      </Button>

      {/* Only following toggle */}
      {isLoggedIn && (
        <div className="flex items-center gap-2 ml-auto">
          <Label htmlFor="arbiter-only-following" className="text-sm cursor-pointer text-muted-foreground">
            Global
          </Label>
          <Switch
            id="arbiter-only-following"
            checked={filters.onlyFollowing}
            onCheckedChange={(checked) => onFiltersChange({ ...filters, onlyFollowing: checked })}
            disabled={!userFollows || userFollows.length === 0}
          />
          <Label htmlFor="arbiter-only-following" className="flex items-center gap-1 text-sm cursor-pointer">
            <Users className="h-4 w-4" />
            Only Following
          </Label>
        </div>
      )}
    </div>
  );
}

/**
 * Apply filters and sorting to a list of arbiters
 */
export function applyArbiterFilters(
  arbiters: ArbiterAnnouncement[],
  filters: ArbiterFilterState,
  userFollows?: string[],
  experienceMap?: Map<string, number>,
  currentUserPubkey?: string
): ArbiterAnnouncement[] {
  let filtered = [...arbiters];

  // Filter by following (always include own services)
  if (filters.onlyFollowing && userFollows && userFollows.length > 0) {
    filtered = filtered.filter(arbiter =>
      userFollows.includes(arbiter.arbiterPubkey) || arbiter.arbiterPubkey === currentUserPubkey
    );
  }

  // Sort
  filtered.sort((a, b) => {
    let comparison = 0;

    switch (filters.sortField) {
      case 'date':
        comparison = a.created_at - b.created_at;
        break;
      case 'fee_percent': {
        // Sort percentage fees, put flat fees at the end
        const aIsPercent = a.feeType === 'percentage';
        const bIsPercent = b.feeType === 'percentage';
        if (aIsPercent && bIsPercent) {
          comparison = parseFloat(a.feeAmount) - parseFloat(b.feeAmount);
        } else if (aIsPercent) {
          comparison = -1; // a comes first
        } else if (bIsPercent) {
          comparison = 1; // b comes first
        } else {
          comparison = 0;
        }
        break;
      }
      case 'fee_flat': {
        // Sort flat fees, put percentage fees at the end
        const aIsFlat = a.feeType === 'flat';
        const bIsFlat = b.feeType === 'flat';
        if (aIsFlat && bIsFlat) {
          comparison = parseInt(a.feeAmount) - parseInt(b.feeAmount);
        } else if (aIsFlat) {
          comparison = -1; // a comes first
        } else if (bIsFlat) {
          comparison = 1; // b comes first
        } else {
          comparison = 0;
        }
        break;
      }
      case 'experience': {
        const aExp = experienceMap?.get(a.arbiterPubkey) || 0;
        const bExp = experienceMap?.get(b.arbiterPubkey) || 0;
        comparison = aExp - bExp;
        break;
      }
    }

    return filters.sortDirection === 'asc' ? comparison : -comparison;
  });

  return filtered;
}
