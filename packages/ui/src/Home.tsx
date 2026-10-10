import { createContext, useContext, type ReactNode } from 'react';
import {
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  type TextProps,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { homeTokens } from './theme';
import type { RewardTerms } from '@chorex/domain';
import { RewardIcon } from './RewardIcon';
export { homeTokens } from './theme';
export function DesignText({
  style,
  ref,
  ...props
}: TextProps & { ref?: React.Ref<NativeText> }) {
  const { fontScale } = useWindowDimensions();
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontSize === undefined)
    return <NativeText {...props} ref={ref} style={style} />;
  const size = flat.fontSize;
  return (
    <NativeText
      {...props}
      ref={ref}
      allowFontScaling={false}
      style={[
        style,
        {
          fontSize: size * fontScale,
          lineHeight: (flat.lineHeight ?? size * 1.35) * fontScale,
        },
      ]}
    />
  );
}
const Text = DesignText;
type Icon = React.ComponentProps<typeof Ionicons>['name'];
const HomeContext = createContext({
  active: false,
  navigate: (_id: string) => {},
});
export function DesignThemeProvider({ children }: { children: ReactNode }) {
  const context = useContext(HomeContext);
  return (
    <HomeContext.Provider value={{ ...context, active: true }}>
      {children}
    </HomeContext.Provider>
  );
}
export function useHomeTheme() {
  return useContext(HomeContext).active;
}
export type NavigationItem = { id: string; label: string; icon: Icon };
export function NavigationFrame({
  children,
  items,
  active,
  onNavigate,
}: {
  children: ReactNode;
  items: readonly NavigationItem[];
  active: string;
  onNavigate: (id: string) => void;
}) {
  const { fontScale } = useWindowDimensions();
  // Keep five concise destinations readable at narrow widths; full accessible labels remain available.
  const labelSize = 11 * Math.min(fontScale, 1.3);
  const insets = useSafeAreaInsets();
  return (
    <HomeContext.Provider value={{ active: true, navigate: onNavigate }}>
      <View style={s.frame}>
        <View style={{ flex: 1 }}>{children}</View>
        <View style={[s.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active === item.id }}
              onPress={() => onNavigate(item.id)}
              className="active:opacity-60"
              style={s.navItem}
            >
              <Ionicons
                accessible={false}
                name={item.icon}
                size={24}
                color={
                  active === item.id ? homeTokens.coral : homeTokens.secondary
                }
              />
              <NativeText
                allowFontScaling={false}
                style={[
                  s.caption,
                  {
                    textAlign: 'center',
                    fontWeight: active === item.id ? '700' : '400',
                    textDecorationLine:
                      active === item.id ? 'underline' : 'none',
                    fontSize: labelSize,
                    lineHeight: labelSize * 1.35,
                    color:
                      active === item.id
                        ? homeTokens.coralText
                        : homeTokens.secondary,
                  },
                ]}
              >
                {item.label}
              </NativeText>
            </Pressable>
          ))}
        </View>
      </View>
    </HomeContext.Provider>
  );
}
export function HomeScreenFrame({
  children,
  keyboard = false,
}: {
  children: ReactNode;
  child?: boolean;
  keyboard?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <DesignThemeProvider>
      <KeyboardAvoidingView
        enabled={keyboard}
        behavior={keyboard && Platform.OS === 'ios' ? 'padding' : undefined}
        style={[s.frame, { paddingTop: insets.top }]}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, { paddingTop: 12 }]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </DesignThemeProvider>
  );
}
export function HomeSection({ children }: { children: ReactNode }) {
  return <View style={s.section}>{children}</View>;
}
export function CollectionHeading({
  children,
  onSeeAll,
  label = 'See all',
  count,
}: {
  children: ReactNode;
  onSeeAll?: () => void;
  label?: string;
  count?: number;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <View style={{ flexGrow: 1, flexShrink: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <SectionHeading>{children}</SectionHeading>
          {count !== undefined ? <CountBadge count={count} /> : null}
        </View>
      </View>
      {onSeeAll ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onSeeAll}
          hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
          style={{ minHeight: 24, justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 14, color: homeTokens.coralText }}>
            See all →
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
export function HomeHeader({
  name,
  child = false,
}: {
  name: string;
  child?: boolean;
}) {
  const { navigate } = useContext(HomeContext);
  return (
    <View style={s.header}>
      <View style={{ flex: 1 }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Notification settings"
        onPress={() => navigate('more')}
        className="active:opacity-60"
        style={s.iconButton}
      >
        <Ionicons
          accessible={false}
          name="notifications-outline"
          size={26}
          color={homeTokens.secondary}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={child ? 'Settings' : 'Family profile'}
        onPress={() => navigate(child ? 'more' : 'family')}
        style={s.avatar}
      >
        <NativeText allowFontScaling={false} style={s.initial}>
          {name.trim().slice(0, 1).toUpperCase() || 'C'}
        </NativeText>
      </Pressable>
    </View>
  );
}
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={s.heading}>
      {children}
    </Text>
  );
}
export function QuickActions() {
  const { width, fontScale } = useWindowDimensions();
  const wideText = fontScale > 1.15 || width < 360;
  const { navigate } = useContext(HomeContext);
  const actions: { label: string; id: string; icon: Icon; color: string }[] = [
    {
      label: 'Create Offer',
      id: 'create',
      icon: 'add-circle-outline',
      color: homeTokens.coralSurface,
    },
    {
      label: 'Review Submissions',
      id: 'review',
      icon: 'document-text-outline',
      color: homeTokens.blue,
    },
    {
      label: 'Manage Rewards',
      id: 'rewards',
      icon: 'gift-outline',
      color: homeTokens.mint,
    },
    {
      label: 'Family Overview',
      id: 'family',
      icon: 'people-outline',
      color: homeTokens.lavender,
    },
  ];
  return (
    <View style={s.section}>
      <SectionHeading>Quick actions</SectionHeading>
      <View style={s.tiles}>
        {actions.map((action) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            key={action.id}
            onPress={() => navigate(action.id)}
            className="active:opacity-60"
            style={[
              s.tile,
              {
                backgroundColor: action.color,
                ...(wideText ? { flex: 0, flexGrow: 1, width: '45%' } : {}),
              },
            ]}
          >
            <Ionicons
              accessible={false}
              name={action.icon}
              size={28}
              color={
                action.id === 'create'
                  ? homeTokens.coral
                  : action.id === 'rewards'
                    ? homeTokens.success
                    : homeTokens.secondary
              }
            />
            <Text style={[s.tileText, { fontSize: 13, fontWeight: '400' }]}>
              {action.id === 'review'
                ? 'Review\nWork'
                : action.label.replace(' ', '\n')}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Text
      accessibilityLabel={`${count} items`}
      style={{
        overflow: 'hidden',
        borderRadius: homeTokens.radius.pill,
        backgroundColor: homeTokens.coralSurface,
        color: homeTokens.coralText,
        fontSize: 13,
        fontWeight: '600',
        paddingHorizontal: 8,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      {count > 99 ? '99+' : count}
    </Text>
  );
}
export function SummaryMetric({
  label,
  value,
  icon,
  tone = 'mint',
}: {
  label: string;
  value: string;
  icon: Icon;
  tone?: 'mint' | 'blue' | 'lavender';
}) {
  return (
    <View
      style={[
        s.tile,
        { backgroundColor: homeTokens[tone], gap: 4, padding: 10 },
      ]}
    >
      <Ionicons
        accessible={false}
        name={icon}
        size={26}
        color={homeTokens.secondary}
      />
      <Text style={s.metric}>{value}</Text>
      <Text style={[s.caption, { textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}
export function HomeEmptyState({
  children,
  icon = 'checkmark-circle-outline',
}: {
  children: ReactNode;
  icon?: Icon;
}) {
  return (
    <View style={[s.row, { gap: 10 }]}>
      <Ionicons
        accessible={false}
        name={icon}
        size={24}
        color={homeTokens.secondary}
      />
      <Text style={{ fontSize: 14, color: homeTokens.secondary, flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}
export function HomeListRow({
  title,
  detail,
  label,
  onPress,
  progress,
  grouped = false,
  separator = false,
  icon = 'checkbox-outline',
  reward,
}: {
  title: string;
  detail: string;
  label: string;
  onPress: () => void;
  icon?: Icon;
  reward?: Pick<RewardTerms, 'iconKey' | 'type'>;
  progress?: { completed: number; required: number };
  grouped?: boolean;
  separator?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessible
      accessibilityLabel={`${label}. ${detail}${progress ? `. ${progress.completed} of ${progress.required} completions recorded` : ''}`}
      onPress={onPress}
      className="active:opacity-60"
      style={[
        s.row,
        grouped
          ? {
              borderWidth: 0,
              borderRadius: 0,
              borderTopWidth: separator ? 1 : 0,
            }
          : undefined,
      ]}
    >
      {reward ? (
        <RewardIcon terms={reward} size={36} />
      ) : (
        <View style={[s.avatar, { width: 36, height: 36 }]}>
          <Ionicons
            accessible={false}
            name={icon}
            size={24}
            color={homeTokens.success}
          />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.caption}>{detail}</Text>
        {progress ? (
          <View
            style={{
              gap: 8,
              marginTop: 6,
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <View
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                height: 6,
                flex: 1,
                minWidth: 60,
                borderRadius: 999,
                backgroundColor: homeTokens.border,
              }}
            >
              <View
                style={{
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: homeTokens.success,
                  width: `${progress.required ? Math.min(100, (progress.completed / progress.required) * 100) : 0}%`,
                }}
              />
            </View>
            <Text style={s.caption}>
              {progress.completed} / {progress.required}
            </Text>
          </View>
        ) : null}
      </View>
      <Ionicons
        accessible={false}
        name="chevron-forward"
        size={20}
        color={homeTokens.secondary}
      />
    </Pressable>
  );
}
const s = StyleSheet.create({
  frame: { flex: 1, backgroundColor: homeTokens.app },
  content: { padding: 18, paddingTop: 16, paddingBottom: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  section: { gap: 10 },
  heading: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: homeTokens.text,
  },
  body: { fontSize: 15, color: homeTokens.secondary, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 17, color: homeTokens.secondary },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: homeTokens.coralSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 23, color: homeTokens.coral, fontWeight: '600' },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiles: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tile: {
    flex: 1,
    minWidth: 64,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 92,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  tileText: {
    fontSize: 13,
    fontWeight: '600',
    color: homeTokens.text,
    textAlign: 'center',
  },
  metric: { fontSize: 21, fontWeight: '700', color: homeTokens.text },
  nav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: homeTokens.border,
    backgroundColor: homeTokens.surface,
    paddingTop: 6,
    paddingBottom: 24,
  },
  navItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: 2,
    alignItems: 'center',
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: homeTokens.border,
    backgroundColor: homeTokens.surface,
  },
  rowTitle: {
    lineHeight: 20,
    fontSize: 15,
    fontWeight: '600',
    color: homeTokens.text,
  },
});
