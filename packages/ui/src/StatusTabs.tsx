import { Pressable, View } from 'react-native';
import { DesignText, homeTokens } from './Home';
import { amberAuroraPalette } from './theme';
import { TabCounter } from './TabCounter';
export function StatusTabs({
  labels,
  counts = {},
  selected,
  onSelect,
  tone = 'blue',
  testID,
}: {
  counts?: Readonly<Record<string, number>>;
  tone?: 'blue' | 'orange' | 'green';
  testID?: string;
  labels: readonly string[];
  selected: string;
  onSelect: (label: string) => void;
}) {
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', gap: homeTokens.spacing.small }}
    >
      {labels.map((label) => (
        <Pressable
          key={label}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected: selected === label }}
          onPress={() => onSelect(label)}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: homeTokens.spacing.small,
            minWidth: 0,
            minHeight: 44,
            borderRadius: homeTokens.radius.pill,
            borderWidth: 1,
            borderColor:
              selected === label
                ? tone === 'blue'
                  ? amberAuroraPalette.auroraBlue
                  : tone === 'green'
                    ? homeTokens.success
                    : homeTokens.coral
                : homeTokens.border,
            backgroundColor:
              selected === label
                ? tone === 'blue'
                  ? homeTokens.blue
                  : tone === 'green'
                    ? homeTokens.mint
                    : homeTokens.coralSurface
                : homeTokens.surface,
            justifyContent: 'center',
            paddingHorizontal: 4,
          }}
        >
          <DesignText
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={{
              textAlign: 'center',
              flexShrink: 1,
              fontSize: 14,
              fontWeight: '600',
              color: homeTokens.text,
            }}
          >
            {label}
          </DesignText>
          <TabCounter
            count={counts[label] ?? 0}
            color={
              selected === label
                ? tone === 'blue'
                  ? amberAuroraPalette.auroraBlue
                  : tone === 'green'
                    ? homeTokens.success
                    : homeTokens.coral
                : homeTokens.border
            }
          />
        </Pressable>
      ))}
    </View>
  );
}
