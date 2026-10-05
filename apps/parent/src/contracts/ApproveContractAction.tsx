import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Contract } from '@chorex/domain';
import {
  approveContract,
  isContractClientError,
} from '@chorex/firebase-client';
import { Button, FormMessage, useDynamicTypeStyles } from '@chorex/ui';

function errorMessage(error: unknown): string {
  if (isContractClientError(error)) {
    switch (error.code) {
      case 'AUTH_REQUIRED':
        return 'Sign in again before approving this Contract.';
      case 'FORBIDDEN':
      case 'FAMILY_MEMBERSHIP_REQUIRED':
      case 'WRONG_ACTOR_ROLE':
        return 'Your account cannot approve this Contract.';
      case 'INVALID_STATE':
        return 'This Contract is no longer waiting for approval.';
      case 'CONTRACT_NOT_FOUND':
        return 'This Contract is no longer available.';
      case 'IDEMPOTENCY_CONFLICT':
        return 'This approval could not be confirmed. Reopen the Contract before trying again.';
      case 'NETWORK_UNAVAILABLE':
        return 'Connect to the internet and try again to confirm the same approval.';
    }
  }
  return 'We could not confirm approval. Try again to confirm the same action.';
}
export function ApproveContractAction({
  contract,
  authUid,
}: {
  contract: Contract;
  authUid: string | undefined;
}) {
  const styles = useDynamicTypeStyles();
  const key = useRef<string | undefined>(undefined),
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
  const approve = async () => {
    if (
      inFlight.current ||
      confirmed ||
      contract.status !== 'READY_FOR_REVIEW' ||
      contract.parentUid !== authUid
    )
      return;
    inFlight.current = true;
    key.current ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    setPending(true);
    setError(undefined);
    try {
      await approveContract({
        contractId: contract.id,
        idempotencyKey: key.current,
      });
      if (active.current) {
        setConfirmed(true);
        setConfirming(false);
      }
    } catch (failure) {
      if (active.current) setError(errorMessage(failure));
    } finally {
      inFlight.current = false;
      if (active.current) setPending(false);
    }
  };
  if (
    contract.parentUid !== authUid ||
    !['READY_FOR_REVIEW', 'APPROVED'].includes(contract.status)
  )
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
          Approved — reward earned
        </Text>
      ) : null}
      {contract.status === 'APPROVED' ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-text-muted"
          style={styles.body}
        >
          You approved this agreement. The reward is earned and still needs to
          be fulfilled.
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
          {confirming ? (
            <>
              <Text
                allowFontScaling={false}
                accessibilityRole="header"
                className="font-semibold text-text"
                style={styles.body}
              >
                Approve this completed agreement?
              </Text>
              <Text
                allowFontScaling={false}
                className="text-text"
                style={styles.body}
              >
                Approval accepts the completed agreement and earns the promised
                reward for your Child. You will still need to fulfill the
                reward.
              </Text>
              <Button
                label="Confirm approval"
                loading={pending}
                onPress={() => void approve()}
              />
              <Button
                label="Keep reviewing"
                disabled={pending}
                onPress={() => setConfirming(false)}
              />
            </>
          ) : (
            <Button label="Approve" onPress={() => setConfirming(true)} />
          )}
        </>
      )}
    </View>
  );
}
