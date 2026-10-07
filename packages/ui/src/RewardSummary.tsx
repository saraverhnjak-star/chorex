import { Text, View } from 'react-native';
import type { EarnedReward } from '@chorex/domain';
import { useDynamicTypeStyles } from './typography';
export function RewardSummary({
  reward,
  childName,
}: {
  reward: EarnedReward;
  childName?: string;
}) {
  const styles = useDynamicTypeStyles();
  return (
    <View className="gap-2">
      {childName ? (
        <Text
          allowFontScaling={false}
          style={styles.body}
          className="text-text"
        >
          Reward for {childName}
        </Text>
      ) : null}
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        style={styles.title}
        className="font-bold text-text"
      >
        {reward.terms.title}
      </Text>
      {reward.terms.description ? (
        <Text
          allowFontScaling={false}
          style={styles.body}
          className="text-text"
        >
          {reward.terms.description}
        </Text>
      ) : null}
      <Text allowFontScaling={false} style={styles.body} className="text-text">
        Type: {reward.terms.type}
      </Text>
      <Text
        allowFontScaling={false}
        accessibilityLiveRegion="polite"
        style={styles.body}
        className="text-text"
      >
        {reward.status === 'FULFILLED'
          ? 'Fulfilled — receipt confirmed'
          : reward.status === 'AWAITING_CHILD_CONFIRMATION'
            ? 'Parent reported delivery — waiting for child confirmation'
            : 'Earned — waiting for Parent'}
      </Text>
      <Text
        allowFontScaling={false}
        style={styles.small}
        className="text-text-muted"
      >
        Earned: {new Date(reward.earnedAt).toLocaleString()}
      </Text>
      {reward.status !== 'PENDING_FULFILLMENT' ? (
        <Text
          allowFontScaling={false}
          style={styles.small}
          className="text-text-muted"
        >
          Delivered: {new Date(reward.deliveredAt).toLocaleString()}
        </Text>
      ) : null}
      {reward.status === 'FULFILLED' ? (
        <Text
          allowFontScaling={false}
          style={styles.small}
          className="text-text-muted"
        >
          Fulfilled: {new Date(reward.fulfilledAt).toLocaleString()}
        </Text>
      ) : null}
    </View>
  );
}
