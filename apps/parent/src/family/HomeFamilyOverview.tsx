import {
  t,
  useAppLanguage,
  homeTokens,
  CollectionHeading,
  DesignText as Text,
} from '@chorex/ui';
import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import type { ParentFamilyHome } from '@chorex/firebase-client';
type ChildProfile = { uid: string; displayName: string };

export function HomeFamilyOverview({
  home,
  preview = false,
  renderChildActions,
  renderChildDetails,
}: {
  preview?: boolean;
  renderChildActions?: (child: ChildProfile) => ReactNode;
  renderChildDetails?: (child: ChildProfile) => ReactNode;
  home: ParentFamilyHome;
  authUid: string;
}) {
  useAppLanguage();

  const router = useRouter();
  return (
    <View style={{ gap: 12 }}>
      <CollectionHeading
        count={home.children.length}
        label={t('See all Family')}
        onSeeAll={preview ? () => router.navigate('/family') : undefined}
      >
        {t('Children')}
      </CollectionHeading>
      <FamilyOverviewRows
        preview={preview}
        renderChildActions={renderChildActions}
        renderChildDetails={renderChildDetails}
        members={preview ? home.children.slice(0, 2) : home.children}
      />
    </View>
  );
}

export function FamilyOverviewRows({
  renderChildActions,
  renderChildDetails,
  members,
}: {
  preview?: boolean;
  renderChildActions?: (child: ChildProfile) => ReactNode;
  renderChildDetails?: (child: ChildProfile) => ReactNode;
  members: readonly { uid: string; displayName: string }[];
}) {
  useAppLanguage();

  return (
    <View
      style={{
        gap: homeTokens.spacing.medium,
      }}
    >
      {members.length === 0 ? (
        <Text style={{ color: homeTokens.secondary }}>
          {t('No child profiles yet.')}
        </Text>
      ) : (
        members.map((child) => (
          <View
            key={child.uid}
            style={{
              padding: homeTokens.spacing.medium,
              gap: homeTokens.spacing.medium,
              borderRadius: homeTokens.radius.card,
              backgroundColor: homeTokens.surface,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                gap: homeTokens.spacing.medium,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: homeTokens.radius.pill,
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
                    fontSize: 20,
                    lineHeight: 28,
                  }}
                >
                  {child.displayName}
                </Text>
              </View>
              {renderChildActions?.(child)}
            </View>
            {renderChildDetails?.(child)}
          </View>
        ))
      )}
    </View>
  );
}
