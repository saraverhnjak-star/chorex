import { Text, View } from 'react-native';
import type { EarnedReward } from '@chorex/domain';
import { Button } from './Button';
import { FormMessage } from './FormMessage';
import { RewardSummary } from './RewardSummary';
import { useDynamicTypeStyles } from './typography';
export function RewardList({
  title,
  empty,
  loading,
  error,
  fromCache,
  rewards,
  onSelect,
  childNames = {},
}: {
  title: string;
  empty: string;
  loading: boolean;
  error: boolean;
  fromCache: boolean;
  rewards: readonly EarnedReward[];
  onSelect: (id: string) => void;
  childNames?: Readonly<Record<string, string>>;
}) {
  const styles = useDynamicTypeStyles();
  return (
    <View className="gap-4 rounded-3xl border border-border bg-surface-warm p-5">
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        style={styles.title}
        className="font-bold text-text"
      >
        {title}
      </Text>
      {loading ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          style={styles.body}
          className="text-text-muted"
        >
          Loading rewards…
        </Text>
      ) : null}
      {error ? (
        <FormMessage message="Your rewards could not be loaded. Reopen this screen to try again." />
      ) : null}
      {fromCache ? (
        <Text
          allowFontScaling={false}
          style={styles.small}
          className="text-text-muted"
        >
          Showing saved rewards. Updates may be pending.
        </Text>
      ) : null}
      {!loading && !error && rewards.length === 0 ? (
        <Text
          allowFontScaling={false}
          style={styles.body}
          className="text-text-muted"
        >
          {fromCache ? 'No rewards are saved on this device yet.' : empty}
        </Text>
      ) : null}
      {rewards.map((reward) => (
        <View key={reward.id} className="gap-2">
          <RewardSummary
            reward={reward}
            childName={childNames[reward.childUid]}
          />
          <Button
            variant="secondary"
            label={`Open reward: ${childNames[reward.childUid] ? `${childNames[reward.childUid]} · ` : ''}${reward.terms.title}`}
            onPress={() => onSelect(reward.id)}
          />
        </View>
      ))}
    </View>
  );
}
