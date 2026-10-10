import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import type { RewardTerms } from '@chorex/domain';
import { DesignText, homeTokens } from './Home';
import { amberAuroraPalette } from './theme';
import { RewardIcon } from './RewardIcon';

export function HomeFeatureCard({
  title,
  detail,
  reward,
  badge,
  tone = 'surface',
  children,
}: {
  title: string;
  detail: string;
  reward: Pick<RewardTerms, 'type' | 'iconKey'>;
  badge?: string;
  tone?: 'surface' | 'mint' | 'coralSurface';
  children?: ReactNode;
}) {
  return (
    <View style={[s.card, { backgroundColor: homeTokens[tone] }]}>
      <View
        style={[
          s.header,
          tone === 'coralSurface'
            ? { flexDirection: 'row-reverse' }
            : undefined,
        ]}
      >
        <View style={[s.art, tone === 'coralSurface' ? s.offerArt : undefined]}>
          <RewardIcon
            terms={reward}
            size={tone === 'coralSurface' ? 108 : 88}
          />
          {tone === 'coralSurface' ? (
            <View
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={s.rays}
            >
              <View style={[s.ray, s.rayTop]} />
              <View style={[s.ray, s.rayMiddle]} />
              <View style={[s.ray, s.rayBottom]} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          {badge ? (
            <DesignText
              style={[
                s.badge,
                {
                  color:
                    tone === 'coralSurface'
                      ? homeTokens.coralText
                      : homeTokens.success,
                },
              ]}
            >
              {badge}
            </DesignText>
          ) : null}
          <DesignText style={s.title}>{title}</DesignText>
          <DesignText style={s.detail}>{detail}</DesignText>
        </View>
      </View>
      {children}
    </View>
  );
}
export function HomeCardAction({
  label,
  onPress,
  tone = 'blue',
  accessibilityLabel = label,
  fill = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'blue' | 'coral' | 'green' | 'outline';
  fill?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="active:opacity-60"
      style={[
        s.action,
        fill ? { flex: 1, minWidth: 0 } : undefined,
        {
          backgroundColor:
            tone === 'outline'
              ? homeTokens.surface
              : tone === 'blue'
                ? amberAuroraPalette.auroraBlue
                : tone === 'green'
                  ? homeTokens.success
                  : homeTokens.coral,
          borderColor: homeTokens.border,
          borderWidth: tone === 'outline' ? 1 : 0,
        },
      ]}
    >
      <DesignText
        style={{
          fontSize: 16,
          fontWeight: '700',
          color: tone === 'outline' ? homeTokens.text : homeTokens.surface,
          textAlign: 'center',
        }}
      >
        {label}
      </DesignText>
    </Pressable>
  );
}
const s = StyleSheet.create({
  card: {
    borderRadius: homeTokens.radius.card,
    padding: homeTokens.spacing.card,
    gap: homeTokens.spacing.medium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: homeTokens.spacing.medium,
  },
  art: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerArt: { width: 112, height: 112 },
  rays: { position: 'absolute', top: -6, right: -4, width: 32, height: 40 },
  ray: {
    position: 'absolute',
    width: 4,
    height: 12,
    borderRadius: 2,
    backgroundColor: homeTokens.coral,
  },
  rayTop: { top: 0, left: 3, transform: [{ rotate: '15deg' }] },
  rayMiddle: { top: 10, left: 20, transform: [{ rotate: '45deg' }] },
  rayBottom: { top: 29, left: 24, transform: [{ rotate: '95deg' }] },
  title: { fontSize: 23, fontWeight: '700', color: homeTokens.text },
  detail: { fontSize: 15, color: homeTokens.secondary },
  badge: { fontSize: 12, fontWeight: '700', alignSelf: 'flex-start' },
  action: {
    borderRadius: 14,
    padding: homeTokens.spacing.medium,
    minHeight: 44,
    justifyContent: 'center',
  },
});
