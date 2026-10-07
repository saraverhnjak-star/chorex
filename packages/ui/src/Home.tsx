import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
  jump: (_id: string) => {},
  register: (_id: string, _node: View | null) => {},
});
export function useHomeTheme() {
  return useContext(HomeContext).active;
}
export function HomeScreenFrame({
  children,
  child = false,
}: {
  children: ReactNode;
  child?: boolean;
}) {
  const scroll = useRef<ScrollView>(null);
  const nodes = useRef<Record<string, View | null>>({});
  const content = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState('home');
  const jump = (id: string) => {
    setSelected(id);
    if (id === 'home') scroll.current?.scrollTo({ y: 0, animated: true });
    else if (content.current)
      nodes.current[id]?.measureLayout(
        content.current,
        (_x, y) => scroll.current?.scrollTo({ y, animated: true }),
        () => {},
      );
  };
  const items: { id: string; label: string; icon: Icon }[] = [
    { id: 'home', label: 'Home', icon: 'home-outline' },
    { id: 'offers', label: 'Offers', icon: 'document-text-outline' },
    {
      id: 'contracts',
      label: child ? 'My chores' : 'Contracts',
      icon: 'checkbox-outline',
    },
    { id: 'rewards', label: 'Rewards', icon: 'gift-outline' },
    { id: 'more', label: 'More', icon: 'ellipsis-horizontal' },
  ];
  return (
    <HomeContext.Provider
      value={{
        active: true,
        jump,
        register: (id, node) => {
          nodes.current[id] = node;
        },
      }}
    >
      <View style={[s.frame, { paddingTop: insets.top }]}>
        <ScrollView
          ref={scroll}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, { paddingTop: 12 }]}
          showsVerticalScrollIndicator={false}
        >
          <View ref={content} collapsable={false}>
            {children}
          </View>
        </ScrollView>
        <View style={[s.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: selected === item.id }}
              onPress={() => jump(item.id)}
              className="active:opacity-60"
              style={s.navItem}
            >
              <Ionicons
                accessible={false}
                name={item.icon}
                size={24}
                color={
                  selected === item.id ? homeTokens.coral : homeTokens.secondary
                }
              />
              <Text
                style={[
                  s.caption,
                  {
                    color:
                      selected === item.id
                        ? homeTokens.coral
                        : homeTokens.secondary,
                  },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </HomeContext.Provider>
  );
}
export function HomeSection({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { register } = useContext(HomeContext);
  return (
    <View
      ref={(node) => register(id, node)}
      collapsable={false}
      style={s.section}
    >
      {children}
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
  const { jump } = useContext(HomeContext);
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
        onPress={() => jump('more')}
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
        onPress={() => jump(child ? 'more' : 'family')}
        style={s.avatar}
      >
        <Text style={s.initial}>
          {name.trim().slice(0, 1).toUpperCase() || 'C'}
        </Text>
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
  const { jump } = useContext(HomeContext);
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
            onPress={() => jump(action.id)}
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
  navItem: { flex: 1, minHeight: 48, alignItems: 'center', gap: 4 },
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
