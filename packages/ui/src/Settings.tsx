import type { ReactNode } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DesignText, homeTokens } from './Home';
import { amberAuroraColors } from './theme';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: homeTokens.spacing.small }}>
      <DesignText
        accessibilityRole="header"
        style={{ color: homeTokens.secondary, fontSize: 13, fontWeight: '700' }}
      >
        {title}
      </DesignText>
      <View
        style={{
          backgroundColor: homeTokens.surface,
          borderColor: homeTokens.border,
          borderWidth: 1,
          borderRadius: homeTokens.radius.card,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}
export function SettingsRow({
  title,
  subtitle,
  icon,
  tone = 'blue',
  control,
  children,
  onPress,
  disabled,
  destructive,
  last = false,
  showChevron = true,
}: {
  title: string;
  subtitle?: string;
  icon: Icon;
  tone?: 'blue' | 'mint' | 'coralSurface' | 'lavender';
  control?: ReactNode;
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  last?: boolean;
  showChevron?: boolean;
}) {
  const { fontScale, width } = useWindowDimensions();
  const stackControl = fontScale > 1.3 || width < 360;
  const content = (
    <View
      style={{
        padding: homeTokens.spacing.card,
        gap: homeTokens.spacing.medium,
        borderBottomWidth: last ? 0 : 1,
        borderColor: homeTokens.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: subtitle ? 'flex-start' : 'center',
          gap: homeTokens.spacing.medium,
          minHeight: 48,
        }}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: homeTokens[tone],
          }}
        >
          <Ionicons
            name={icon}
            size={22}
            color={
              destructive ? amberAuroraColors.danger : homeTokens.secondary
            }
          />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <DesignText
            style={{
              fontSize: 16,
              fontWeight: '600',
              color: destructive ? amberAuroraColors.danger : homeTokens.text,
            }}
          >
            {title}
          </DesignText>
          {subtitle ? (
            <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
              {subtitle}
            </DesignText>
          ) : null}
        </View>
        {stackControl ? null : control}
        {onPress && showChevron ? (
          <Ionicons
            accessible={false}
            name="chevron-forward"
            size={20}
            color={homeTokens.secondary}
          />
        ) : null}
      </View>
      {stackControl && control ? (
        <View
          style={{
            minHeight: 48,
            justifyContent: 'center',
            alignItems: 'flex-end',
          }}
        >
          {control}
        </View>
      ) : null}
      {children}
    </View>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessible
      accessibilityLabel={[title, subtitle].filter(Boolean).join('. ')}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
    >
      {content}
    </Pressable>
  ) : (
    content
  );
}
