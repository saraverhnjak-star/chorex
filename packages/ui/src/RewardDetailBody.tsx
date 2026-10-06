import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { EarnedReward } from '@chorex/domain';
import { FormMessage } from './FormMessage';
import { RewardSummary } from './RewardSummary';
import { useDynamicTypeStyles } from './typography';
export function RewardDetailBody({
  loading,
  error,
  missing,
  fromCache,
  reward,
  childName,
  children,
}: {
  loading: boolean;
  error: boolean;
  missing: boolean;
  fromCache: boolean;
  reward?: EarnedReward;
  childName?: string;
  children?: ReactNode;
}) {
  const styles = useDynamicTypeStyles();
  if (error)
    return (
      <FormMessage message="This reward could not be loaded or is unavailable to your account." />
    );
  if (loading)
    return (
      <Text
        allowFontScaling={false}
        accessibilityLiveRegion="polite"
        style={styles.body}
        className="text-text-muted"
      >
        Loading reward…
      </Text>
    );
  if (missing)
    return (
      <Text
        allowFontScaling={false}
        style={styles.body}
        className="text-text-muted"
      >
        {fromCache
          ? 'No cached reward is available yet. Connect to the internet to load it.'
          : 'Reward not found.'}
      </Text>
    );
  return (
    <View className="gap-4">
      {fromCache ? (
        <Text
          allowFontScaling={false}
          style={styles.small}
          className="text-text-muted"
        >
          Showing saved rewards. Updates may be pending.
        </Text>
      ) : null}
      {reward ? <RewardSummary reward={reward} childName={childName} /> : null}
      {children}
    </View>
  );
}
