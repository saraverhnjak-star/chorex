import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Contract, ContractTask } from '@chorex/domain';
import { submitContractForReview } from '@chorex/firebase-client';
import { Button, FormMessage, useDynamicTypeStyles } from '@chorex/ui';
import { getSubmissionErrorMessage } from './messages';

export function SubmitForReviewAction({
  contract,
  tasks,
}: {
  contract: Contract;
  tasks: readonly ContractTask[];
}) {
  const styles = useDynamicTypeStyles();
  const key = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const active = useRef(true);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string>();
  const allComplete =
    tasks.length > 0 &&
    tasks.every((task) => task.completedCount === task.targetCount);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const submit = async () => {
    if (
      inFlight.current ||
      confirmed ||
      contract.status !== 'ACTIVE' ||
      !allComplete
    )
      return;
    inFlight.current = true;
    key.current ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    setPending(true);
    setError(undefined);
    try {
      await submitContractForReview({
        contractId: contract.id,
        idempotencyKey: key.current,
      });
      if (active.current) {
        setConfirmed(true);
        setConfirming(false);
      }
    } catch (failure) {
      // A failed response can hide a committed transition. Retry with the same key.
      if (active.current) setError(getSubmissionErrorMessage(failure));
    } finally {
      inFlight.current = false;
      if (active.current) setPending(false);
    }
  };
  if (contract.status !== 'ACTIVE' && contract.status !== 'READY_FOR_REVIEW')
    return null;
  return (
    <View className="gap-2">
      {confirmed ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-text"
          style={styles.body}
        >
          Sent for review
        </Text>
      ) : null}
      {contract.status === 'READY_FOR_REVIEW' ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-text-muted"
          style={styles.body}
        >
          Your Parent now needs to review this agreement.
        </Text>
      ) : confirmed ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-text-muted"
          style={styles.small}
        >
          Waiting for updated Contract status…
        </Text>
      ) : (
        <>
          <FormMessage message={error} />
          {!allComplete ? (
            <Text
              allowFontScaling={false}
              className="text-text-muted"
              style={styles.body}
            >
              Complete all tasks before submitting for review.
            </Text>
          ) : confirming ? (
            <>
              <Text
                allowFontScaling={false}
                accessibilityRole="header"
                className="font-semibold text-text"
                style={styles.body}
              >
                Send this Contract for review?
              </Text>
              <Text
                allowFontScaling={false}
                className="text-text"
                style={styles.body}
              >
                Your Parent will review the completed agreement before approving
                it.
              </Text>
              <Button
                label="Confirm submission"
                loading={pending}
                onPress={() => void submit()}
              />
              <Button
                label="Keep checking"
                disabled={pending}
                onPress={() => setConfirming(false)}
              />
            </>
          ) : (
            <Button
              label="Submit for review"
              onPress={() => setConfirming(true)}
            />
          )}
        </>
      )}
    </View>
  );
}
