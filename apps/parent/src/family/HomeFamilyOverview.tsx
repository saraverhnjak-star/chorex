import { useRouter } from 'expo-router';
import { View } from 'react-native';
import type { ParentFamilyHome } from '@chorex/firebase-client';
import {
  useActiveContracts,
  useReadyForReviewContracts,
} from '@chorex/firebase-client';
import { homeTokens, CollectionHeading, DesignText as Text } from '@chorex/ui';
export function HomeFamilyOverview({
  home,
  authUid,
  preview = false,
}: {
  preview?: boolean;
  home: ParentFamilyHome;
  authUid: string;
}) {
  const router = useRouter();
  const active = useActiveContracts(home.family.id, authUid);
  const review = useReadyForReviewContracts(home.family.id, authUid);
  return (
    <View style={{ gap: 12 }}>
      <CollectionHeading
        label="See all Family"
        onSeeAll={preview ? () => router.navigate('/family') : undefined}
      >
        Family overview
      </CollectionHeading>
      <FamilyOverviewRows
        members={preview ? home.children.slice(0, 2) : home.children}
        active={
          active.status === 'ready'
            ? active.contracts.map((c) => c.childUid)
            : undefined
        }
        review={
          review.status === 'ready'
            ? review.contracts.map((c) => c.childUid)
            : undefined
        }
        activeCached={active.status === 'ready' && active.fromCache}
        reviewCached={review.status === 'ready' && review.fromCache}
      />
    </View>
  );
}

export function FamilyOverviewRows({
  members,
  active,
  review,
  activeCached = false,
  reviewCached = false,
}: {
  members: readonly { uid: string; displayName: string }[];
  active?: readonly string[];
  review?: readonly string[];
  activeCached?: boolean;
  reviewCached?: boolean;
}) {
  return (
    <View
      style={{
        padding: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: homeTokens.border,
        backgroundColor: homeTokens.surface,
        gap: 8,
      }}
    >
      {members.length === 0 ? (
        <Text style={{ color: homeTokens.secondary }}>
          No child profiles yet.
        </Text>
      ) : (
        members.map((child) => (
          <View
            key={child.uid}
            style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 22,
                backgroundColor: homeTokens.lavender,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: homeTokens.text, fontSize: 20 }}>
                {child.displayName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  fontWeight: '600',
                  color: homeTokens.text,
                  fontSize: 15,
                  lineHeight: 20,
                }}
              >
                {child.displayName}
              </Text>
              <Text
                style={{
                  color: homeTokens.secondary,
                  fontSize: 12,
                  lineHeight: 16,
                }}
              >
                {active !== undefined
                  ? `${active.filter((uid) => uid === child.uid).length} active${activeCached ? ' (saved)' : ''}`
                  : 'Active count unavailable'}{' '}
                ·{' '}
                {review !== undefined
                  ? `${review.filter((uid) => uid === child.uid).length} need review${reviewCached ? ' (saved)' : ''}`
                  : 'Review count unavailable'}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
