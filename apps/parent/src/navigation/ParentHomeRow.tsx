import { Pressable, View, useWindowDimensions } from 'react-native';
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
  action,
  label,
  onPress,
  children,
  separator = false,
  button = false,
  artRight = false,
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
}) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 390 || fontScale > 1.2;
  return (
    <View
      style={{
        padding: homeTokens.spacing.card,
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
          <DesignText
            style={{ fontSize: 20, fontWeight: '700', color: homeTokens.text }}
          >
            {title}
          </DesignText>
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            {detail}
          </DesignText>
          {children}
        </View>
        {!compact && action ? <Action /> : null}
      </View>
      {compact && action ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Action />
        </View>
      ) : null}
      {!action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
      ) : null}
    </View>
  );
  function Action() {
    return (
      <View
        style={{
          gap: 12,
          alignItems: 'flex-end',
          maxWidth: compact ? '100%' : 140,
        }}
      >
        {badge ? (
          <DesignText
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: button
                ? homeTokens.success
                : amberAuroraPalette.auroraBlue,
              backgroundColor: button ? homeTokens.mint : homeTokens.blue,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: homeTokens.radius.pill,
            }}
          >
            {badge}
          </DesignText>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={{
            minHeight: 44,
            justifyContent: 'center',
            ...(button
              ? {
                  backgroundColor: amberAuroraPalette.auroraBlue,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                }
              : {}),
          }}
        >
          <DesignText
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: button
                ? homeTokens.surface
                : amberAuroraPalette.auroraBlue,
            }}
          >
            {action}
            {button ? '' : ' →'}
          </DesignText>
        </Pressable>
      </View>
    );
  }
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
