import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { DesignText as Text, homeTokens } from './Home';
import type { EarnedReward } from '@chorex/domain';
import { Button } from './Button';
import { FormMessage } from './FormMessage';
export function RewardTransitionAction({
  reward,
  submit,
  expectedStatus,
  actionLabel,
  confirmLabel,
  question,
  description,
  success,
}: {
  reward: EarnedReward;
  submit: (input: {
    rewardId: string;
    idempotencyKey: string;
  }) => Promise<unknown>;
  expectedStatus: 'PENDING_FULFILLMENT' | 'AWAITING_CHILD_CONFIRMATION';
  actionLabel: string;
  confirmLabel: string;
  question: string;
  description: string;
  success: string;
}) {
  const styles = {
      body: { fontSize: 16, color: homeTokens.text },
      small: { fontSize: 14, color: homeTokens.secondary },
    },
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
    if (inFlight.current || confirmed || reward.status !== expectedStatus)
      return;
    inFlight.current = true;
    key.current ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    setPending(true);
    setError(undefined);
    try {
      await submit({ rewardId: reward.id, idempotencyKey: key.current });
      if (active.current) {
        setConfirmed(true);
        setConfirming(false);
      }
    } catch {
      if (active.current)
        setError(
          'We could not confirm this action. Check your connection and try again to confirm the same action.',
        );
    } finally {
      inFlight.current = false;
      if (active.current) setPending(false);
    }
  };
  const showReceipt =
    confirmed &&
    (reward.status === expectedStatus ||
      (expectedStatus === 'PENDING_FULFILLMENT'
        ? reward.status === 'AWAITING_CHILD_CONFIRMATION'
        : reward.status === 'FULFILLED'));
  return (
    <View className="gap-2">
      {showReceipt ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          style={styles.body}
          className="text-home-text"
        >
          {success}
        </Text>
      ) : null}
      {confirmed && reward.status === expectedStatus ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          style={styles.small}
          className="text-home-muted"
        >
          Waiting for updated reward status…
        </Text>
      ) : null}
      {!confirmed && reward.status === expectedStatus ? (
        <>
          <FormMessage message={error} />
          {confirming ? (
            <>
              <Text
                allowFontScaling={false}
                accessibilityRole="header"
                style={styles.body}
                className="font-semibold text-home-text"
              >
                {question}
              </Text>
              <Text
                allowFontScaling={false}
                style={styles.body}
                className="text-home-text"
              >
                {description}
              </Text>
              <Button
                label={confirmLabel}
                loading={pending}
                onPress={() => void fulfill()}
              />
              <Button
                label="Keep checking"
                variant="outline"
                disabled={pending}
                onPress={() => setConfirming(false)}
              />
            </>
          ) : (
            <Button label={actionLabel} onPress={() => setConfirming(true)} />
          )}
        </>
      ) : null}
    </View>
  );
}
