import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { EarnedReward } from '@chorex/domain';
import { fulfillReward, RewardClientError } from '@chorex/firebase-client';
import { Button, FormMessage, useDynamicTypeStyles } from '@chorex/ui';
function message(error: unknown): string {
  if (error instanceof RewardClientError) {
    if (error.code === 'NETWORK_UNAVAILABLE')
      return 'Unable to confirm fulfillment. Check your connection and try again. The reward has not been changed locally.';
    if (
      [
        'FORBIDDEN',
        'WRONG_ACTOR_ROLE',
        'FAMILY_MEMBERSHIP_REQUIRED',
        'AUTH_REQUIRED',
      ].includes(error.code)
    )
      return 'Your account cannot fulfill this reward.';
    if (error.code === 'REWARD_ALREADY_FULFILLED')
      return 'This reward has already been fulfilled. Wait for the latest update.';
    if (error.code === 'INVALID_STATE' || error.code === 'REWARD_NOT_FOUND')
      return 'This reward cannot be fulfilled. Reopen it for the latest state.';
  }
  return 'We could not confirm fulfillment. Try again to confirm the same action.';
}
export function FulfillRewardAction({ reward }: { reward: EarnedReward }) {
  const styles = useDynamicTypeStyles(),
    key = useRef<string | undefined>(undefined),
    inFlight = useRef(false),
    active = useRef(true);
  const [confirming, setConfirming] = useState(false),
    [pending, setPending] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState<string>();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const fulfill = async () => {
    if (
      inFlight.current ||
      confirmed ||
      reward.status !== 'PENDING_FULFILLMENT'
    )
      return;
    inFlight.current = true;
    key.current ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    setPending(true);
    setError(undefined);
    try {
      await fulfillReward({ rewardId: reward.id, idempotencyKey: key.current });
      if (active.current) {
        setConfirmed(true);
        setConfirming(false);
      }
    } catch (failure) {
      if (active.current) setError(message(failure));
    } finally {
      inFlight.current = false;
      if (active.current) setPending(false);
    }
  };
  return (
    <View className="gap-2">
      {confirmed ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          style={styles.body}
          className="text-text"
        >
          Reward fulfilled
        </Text>
      ) : null}
      {confirmed && reward.status === 'PENDING_FULFILLMENT' ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          style={styles.small}
          className="text-text-muted"
        >
          Waiting for updated reward status…
        </Text>
      ) : null}
      {!confirmed && reward.status === 'PENDING_FULFILLMENT' ? (
        <>
          <FormMessage message={error} />
          {confirming ? (
            <>
              <Text
                allowFontScaling={false}
                accessibilityRole="header"
                style={styles.body}
                className="font-semibold text-text"
              >
                Record this reward as delivered?
              </Text>
              <Text
                allowFontScaling={false}
                style={styles.body}
                className="text-text"
              >
                Confirm that you have delivered the promised reward. Contract
                approval stays unchanged.
              </Text>
              <Button
                label="Confirm fulfillment"
                loading={pending}
                onPress={() => void fulfill()}
              />
              <Button
                label="Keep checking"
                disabled={pending}
                onPress={() => setConfirming(false)}
              />
            </>
          ) : (
            <Button
              label="Mark as fulfilled"
              onPress={() => setConfirming(true)}
            />
          )}
        </>
      ) : null}
    </View>
  );
}
