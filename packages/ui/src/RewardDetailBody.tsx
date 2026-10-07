import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DesignText as Text, homeTokens } from './Home';
import type { EarnedReward, UserProfile } from '@chorex/domain';
import { FormMessage } from './FormMessage';
import { RewardSummary } from './RewardSummary';
export function RewardDetailBody({
  loading,
  error,
  missing,
  fromCache,
  reward,
  childName,
  viewer = 'CHILD',
  children,
}: {
  loading: boolean;
  error: boolean;
  missing: boolean;
  fromCache: boolean;
  reward?: EarnedReward;
  childName?: string;
  viewer?: UserProfile['accountType'];
  children?: ReactNode;
}) {
  const styles = {
    body: { fontSize: 16, color: homeTokens.text },
    small: { fontSize: 14, color: homeTokens.secondary },
  };
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
        className="text-home-muted"
      >
        Loading reward…
      </Text>
    );
  if (missing)
    return (
      <Text
        allowFontScaling={false}
        style={styles.body}
        className="text-home-muted"
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
          className="text-home-muted"
        >
          Showing saved rewards. Updates may be pending.
        </Text>
      ) : null}
      {reward ? (
        <RewardSummary reward={reward} childName={childName} viewer={viewer} />
      ) : null}
      {children}
    </View>
  );
}
