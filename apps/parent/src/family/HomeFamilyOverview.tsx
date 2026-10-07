import { Text, View } from 'react-native';
import type { ParentFamilyHome } from '@chorex/firebase-client';
import {
  useActiveContracts,
  useReadyForReviewContracts,
} from '@chorex/firebase-client';
import { homeTokens, SectionHeading } from '@chorex/ui';
export function HomeFamilyOverview({
  home,
  authUid,
}: {
  home: ParentFamilyHome;
  authUid: string;
}) {
  const active = useActiveContracts(home.family.id, authUid);
  const review = useReadyForReviewContracts(home.family.id, authUid);
  return (
    <View style={{ gap: 12 }}>
      <SectionHeading>Family overview</SectionHeading>
      <View
        style={{
          padding: 16,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: homeTokens.border,
          backgroundColor: homeTokens.surface,
          gap: 16,
        }}
      >
        {home.children.length === 0 ? (
          <Text style={{ color: homeTokens.secondary }}>
            No child profiles yet.
          </Text>
        ) : (
          home.children.map((child) => (
            <View
              key={child.uid}
              style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
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
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    fontWeight: '600',
                    color: homeTokens.text,
                    fontSize: 16,
                  }}
                >
                  {child.displayName}
                </Text>
                <Text style={{ color: homeTokens.secondary, fontSize: 13 }}>
                  {active.status === 'ready'
                    ? `${active.contracts.filter((c) => c.childUid === child.uid).length} active${active.fromCache ? ' (saved)' : ''}`
                    : 'Active count unavailable'}{' '}
                  ·{' '}
                  {review.status === 'ready'
                    ? `${review.contracts.filter((c) => c.childUid === child.uid).length} need review${review.fromCache ? ' (saved)' : ''}`
                    : 'Review count unavailable'}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}
