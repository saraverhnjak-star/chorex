import { Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import type { RewardTerms } from '@chorex/domain';
import {
  DesignText,
  RewardIcon,
  homeTokens,
  amberAuroraPalette,
} from '@chorex/ui';

export function ParentHomeRow({
  title,
  detail,
  reward,
  badge,
  label,
  onPress,
  children,
  separator = false,
  button = false,
  artRight = false,
  dense = false,
}: {
  title: string;
  detail: string;
  reward: Pick<RewardTerms, 'type' | 'iconKey'>;
  badge?: string;
  action?: string;
  label: string;
  onPress: () => void;
  children?: ReactNode;
  separator?: boolean;
  button?: boolean;
  artRight?: boolean;
  dense?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      onPress={onPress}
      style={{
        padding: dense ? homeTokens.spacing.medium : homeTokens.spacing.card,
        gap: 12,
        borderTopWidth: separator ? 1 : 0,
        borderColor: homeTokens.border,
      }}
    >
      <View
        style={{
          flexDirection: artRight ? 'row-reverse' : 'row',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <RewardIcon terms={reward} size={64} />
        <View style={{ flex: 1, gap: 6 }}>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: homeTokens.spacing.small,
            }}
          >
            <DesignText
              style={{
                flexGrow: 1,
                flexBasis: 100,
                flexShrink: 1,
                fontSize: 20,
                fontWeight: '700',
                color: homeTokens.text,
              }}
            >
              {title}
            </DesignText>
            {badge ? (
              <DesignText
                style={{
                  marginLeft: 'auto',
                  maxWidth: '100%',
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: '700',
                  color: button
                    ? homeTokens.success
                    : amberAuroraPalette.auroraBlue,
                  backgroundColor: button ? homeTokens.mint : homeTokens.blue,
                  paddingHorizontal: homeTokens.spacing.medium,
                  paddingVertical: homeTokens.spacing.small,
                  borderRadius: homeTokens.radius.pill,
                }}
              >
                {badge}
              </DesignText>
            ) : null}
          </View>
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            {detail}
          </DesignText>
          {children}
        </View>
      </View>
    </Pressable>
  );
}

export function ParentHomeCard({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        borderRadius: homeTokens.radius.card,
        borderWidth: 1,
        borderColor: homeTokens.border,
        backgroundColor: homeTokens.surface,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}
