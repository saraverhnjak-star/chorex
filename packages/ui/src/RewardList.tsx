import { Text, View } from 'react-native';
import type { EarnedReward } from '@chorex/domain';
import { FormMessage } from './FormMessage';
import { HomeListRow, SectionHeading } from './Home';
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
    <View className="gap-4 rounded-3xl border border-border bg-home-surface p-5">
      <SectionHeading>{title}</SectionHeading>
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
        <HomeListRow
          icon="gift-outline"
          key={reward.id}
          title={reward.terms.title}
          detail={`${childNames[reward.childUid] ? `${childNames[reward.childUid]} · ` : ''}${reward.status === 'FULFILLED' ? 'Fulfilled — receipt confirmed' : reward.status === 'AWAITING_CHILD_CONFIRMATION' ? 'Parent reported delivery — waiting for child confirmation' : 'Earned — waiting for Parent delivery'}`}
          label={`Open reward: ${childNames[reward.childUid] ? `${childNames[reward.childUid]} · ` : ''}${reward.terms.title}`}
          onPress={() => onSelect(reward.id)}
        />
      ))}
    </View>
  );
}
