import { useMemo } from 'react';
import { ArrowUp, ArrowDown, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { TaskProposal, TaskStatus } from '@/lib/catallax';

export type TaskSortField = 'date' | 'value';
export type SortDirection = 'asc' | 'desc';

export interface TaskFilterState {
  status: TaskStatus | 'all';
  sortField: TaskSortField;
  sortDirection: SortDirection;
  selectedTags: string[];
  onlyFollowing: boolean;
}

interface TaskFiltersProps {
  tasks: TaskProposal[];
  filters: TaskFilterState;
  onFiltersChange: (filters: TaskFilterState) => void;
  userFollows?: string[];
  isLoggedIn: boolean;
}

const STATUS_OPTIONS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'proposed', label: 'Proposed' },
  { value: 'funded', label: 'Funded' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'concluded', label: 'Concluded' },
];

export function TaskFilters({ tasks, filters, onFiltersChange, userFollows, isLoggedIn }: TaskFiltersProps) {
  // Extract all unique tags from tasks (excluding 'catallax')
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    tasks.forEach(task => {
      task.categories.forEach(tag => {
        if (tag !== 'catallax') {
          tagSet.add(tag);
        }
      });
    });
    return Array.from(tagSet).sort();
  }, [tasks]);

  const toggleSortDirection = () => {
    onFiltersChange({
      ...filters,
      sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc',
    });
  };

  const toggleTag = (tag: string) => {
    const newTags = filters.selectedTags.includes(tag)
      ? filters.selectedTags.filter(t => t !== tag)
      : [...filters.selectedTags, tag];
    onFiltersChange({ ...filters, selectedTags: newTags });
  };

  const SortIcon = filters.sortDirection === 'asc' ? ArrowUp : ArrowDown;

  return (
    <div className="space-y-4">
      {/* Row 1: Status, Sort, Direction */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status filter */}
        <Select
          value={filters.status}
          onValueChange={(value) => onFiltersChange({ ...filters, status: value as TaskStatus | 'all' })}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort field */}
        <Select
          value={filters.sortField}
          onValueChange={(value) => onFiltersChange({ ...filters, sortField: value as TaskSortField })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Date Created</SelectItem>
            <SelectItem value="value">Value (sats)</SelectItem>
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
          {filters.sortDirection === 'asc' ? 'Oldest' : 'Newest'}
          {filters.sortField === 'value' && (filters.sortDirection === 'asc' ? ' / Lowest' : ' / Highest')}
        </Button>

        {/* Only following toggle */}
        {isLoggedIn && (
          <div className="flex items-center gap-2 ml-auto">
            <Switch
              id="only-following"
              checked={filters.onlyFollowing}
              onCheckedChange={(checked) => onFiltersChange({ ...filters, onlyFollowing: checked })}
              disabled={!userFollows || userFollows.length === 0}
            />
            <Label htmlFor="only-following" className="flex items-center gap-1 text-sm cursor-pointer">
              <Users className="h-4 w-4" />
              Only following
            </Label>
          </div>
        )}
      </div>

      {/* Row 2: Tags */}
      {availableTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground mr-2">Tags:</span>
          {availableTags.map(tag => (
            <Badge
              key={tag}
              variant={filters.selectedTags.includes(tag) ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/80"
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </Badge>
          ))}
          {filters.selectedTags.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onFiltersChange({ ...filters, selectedTags: [] })}
            >
              Clear
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Apply filters and sorting to a list of tasks
 */
export function applyTaskFilters(
  tasks: TaskProposal[],
  filters: TaskFilterState,
  userFollows?: string[]
): TaskProposal[] {
  let filtered = [...tasks];

  // Filter by status
  if (filters.status !== 'all') {
    filtered = filtered.filter(task => task.status === filters.status);
  }

  // Filter by tags
  if (filters.selectedTags.length > 0) {
    filtered = filtered.filter(task =>
      filters.selectedTags.some(tag => task.categories.includes(tag))
    );
  }

  // Filter by following
  if (filters.onlyFollowing && userFollows && userFollows.length > 0) {
    filtered = filtered.filter(task => userFollows.includes(task.patronPubkey));
  }

  // Sort
  filtered.sort((a, b) => {
    let comparison = 0;

    if (filters.sortField === 'date') {
      comparison = a.created_at - b.created_at;
    } else if (filters.sortField === 'value') {
      comparison = parseInt(a.amount) - parseInt(b.amount);
    }

    return filters.sortDirection === 'asc' ? comparison : -comparison;
  });

  return filtered;
}
