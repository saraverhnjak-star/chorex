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
  tone = 'coralSurface',
  artRight = false,
  dense = false,
  iconSize = 80,
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
  tone?: 'blue' | 'coralSurface' | 'mint';
  artRight?: boolean;
  dense?: boolean;
  iconSize?: number;
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
        <RewardIcon terms={reward} size={iconSize} />
        <View style={{ flex: 1, minWidth: 0, gap: homeTokens.spacing.small }}>
          {badge ? (
            <DesignText
              style={{
                fontSize: 13,
                fontWeight: '700',
                color:
                  tone === 'mint'
                    ? homeTokens.success
                    : tone === 'blue'
                      ? amberAuroraPalette.auroraBlue
                      : homeTokens.coralText,
              }}
            >
              {badge}
            </DesignText>
          ) : null}
          <View>
            <DesignText
              style={{
                fontSize: 20,
                fontWeight: '700',
                color: homeTokens.text,
              }}
            >
              {title}
            </DesignText>
            <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
              {detail}
            </DesignText>
          </View>
          {children}
        </View>
      </View>
    </Pressable>
  );
}

export function ParentHomeCard({
  children,
  tone = 'surface',
}: {
  children: ReactNode;
  tone?: 'surface' | 'blue' | 'coralSurface' | 'mint';
}) {
  return (
    <View
      style={{
        borderRadius: homeTokens.radius.card,
        backgroundColor: homeTokens[tone],
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}
