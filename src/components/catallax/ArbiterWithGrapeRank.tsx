import { useGrapeRank } from '@/hooks/useGrapeRank';
import type { ArbiterAnnouncement } from '@/lib/catallax';

interface ArbiterWithGrapeRankProps {
  arbiter: ArbiterAnnouncement;
  authorPubkey?: string;
  children: (data: {
    arbiter: ArbiterAnnouncement;
    grapeRankData: { rank: number | null; verifiedFollowerCount: number | null } | undefined;
    isLoading: boolean;
    hasGrapeRank: boolean;
  }) => React.ReactNode;
}

export function ArbiterWithGrapeRank({ arbiter, authorPubkey, children }: ArbiterWithGrapeRankProps) {
  const grapeRank = useGrapeRank(arbiter.arbiterPubkey, authorPubkey);

  const hasGrapeRank = !grapeRank.isLoading &&
                       grapeRank.data?.rank !== null &&
                       grapeRank.data?.rank !== undefined;

  return (
    <>
      {children({
        arbiter,
        grapeRankData: grapeRank.data,
        isLoading: grapeRank.isLoading,
        hasGrapeRank,
      })}
    </>
  );
}