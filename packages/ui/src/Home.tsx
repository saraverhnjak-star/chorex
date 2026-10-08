import { createContext, useContext, type ReactNode } from 'react';
import {
  Pressable,
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
export { homeTokens } from './theme';
export function DesignText({ style, ...props }: TextProps) {
  const { fontScale } = useWindowDimensions();
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontSize === undefined)
    return <NativeText {...props} allowFontScaling={false} style={style} />;
  const size = flat.fontSize;
  return (
    <NativeText
      {...props}
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
  const labelSize = 12 * Math.min(fontScale, 1.3);
  const insets = useSafeAreaInsets();
  return (
    <HomeContext.Provider value={{ active: true, navigate: onNavigate }}>
      <View style={s.frame}>
        <View style={{ flex: 1 }}>{children}</View>
        <View style={[s.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
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
                    fontSize: labelSize,
                    lineHeight: labelSize * 1.35,
                    color:
                      active === item.id
                        ? homeTokens.coral
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
}: {
  children: ReactNode;
  child?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <DesignThemeProvider>
      <View style={[s.frame, { paddingTop: insets.top }]}>
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, { paddingTop: 12 }]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
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
}: {
  children: ReactNode;
  onSeeAll?: () => void;
  label?: string;
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
        <SectionHeading>{children}</SectionHeading>
      </View>
      {onSeeAll ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onSeeAll}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 14, color: homeTokens.coral }}>
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
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={s.wordmark}>
          Chore<Text style={{ color: homeTokens.coral }}>X</Text>
        </Text>
        <Text style={s.caption}>
          {child ? 'Big tasks. Real rewards.' : 'Family agreements made easy.'}
        </Text>
      </View>
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
        accessibilityLabel="Family profile"
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
export function HomeGreeting({
  name,
  child = false,
}: {
  name: string;
  child?: boolean;
}) {
  return (
    <View style={s.section}>
      <Text accessibilityRole="header" style={s.greeting}>
        {child ? 'Hi' : 'Hello'}, {name}!
      </Text>
      <Text style={s.body}>
        {child
          ? 'One step at a time. Let’s keep going.'
          : 'Here’s what’s happening with your family today.'}
      </Text>
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
  const wideText = fontScale > 1.3 || width < 360;
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
                ...(wideText ? { flexBasis: '45%' } : {}),
              },
            ]}
          >
            <Ionicons
              accessible={false}
              name={action.icon}
              size={28}
              color={homeTokens.coral}
            />
            <Text style={s.tileText}>
              {action.id === 'review' ? 'Review' : action.label}
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
        color: homeTokens.coral,
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
    <View style={[s.tile, { backgroundColor: homeTokens[tone] }]}>
      <Ionicons
        accessible={false}
        name={icon}
        size={26}
        color={homeTokens.secondary}
      />
      <Text style={s.metric}>{value}</Text>
      <Text style={s.caption}>{label}</Text>
    </View>
  );
}
export function HomeListRow({
  title,
  detail,
  label,
  onPress,
  progress,
  icon = 'checkbox-outline',
}: {
  title: string;
  detail: string;
  label: string;
  onPress: () => void;
  icon?: Icon;
  progress?: { completed: number; required: number };
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="active:opacity-60"
      style={s.row}
    >
      <View style={s.avatar}>
        <Ionicons
          accessible={false}
          name={icon}
          size={24}
          color={homeTokens.success}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.caption}>{detail}</Text>
        {progress ? (
          <View style={{ gap: 6, marginTop: 8 }}>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: progress.required,
                now: progress.completed,
              }}
              style={{
                height: 6,
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
              {progress.completed} / {progress.required} completions
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
  content: { padding: 20, paddingTop: 16, paddingBottom: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  wordmark: { fontSize: 30, fontWeight: '800', color: homeTokens.text },
  section: { gap: 12 },
  greeting: { fontSize: 28, fontWeight: '700', color: homeTokens.text },
  heading: { fontSize: 21, fontWeight: '700', color: homeTokens.text },
  body: { fontSize: 16, color: homeTokens.secondary, lineHeight: 23 },
  caption: { fontSize: 12, color: homeTokens.secondary },
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
    padding: 12,
    alignItems: 'center',
    gap: 8,
  },
  tileText: { fontSize: 12, color: homeTokens.text, textAlign: 'center' },
  metric: { fontSize: 21, fontWeight: '700', color: homeTokens.text },
  nav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: homeTokens.border,
    backgroundColor: homeTokens.surface,
    paddingTop: 8,
    paddingBottom: 24,
  },
  navItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: 2,
    alignItems: 'center',
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: homeTokens.border,
    backgroundColor: homeTokens.surface,
  },
  rowTitle: { fontSize: 16, fontWeight: '600', color: homeTokens.text },
});
