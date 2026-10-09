import {
  FocusHeading,
  announceAction,
  Button,
  FormMessage,
  TextField,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  requestContractChangesInputSchema,
  reviewFeedbackSchema,
} from '@chorex/domain';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Contract } from '@chorex/domain';
import {
  approveContract,
  requestContractChanges,
  isContractClientError,
} from '@chorex/firebase-client';

function errorMessage(error: unknown, requestingChanges = false): string {
  if (requestingChanges) {
    if (isContractClientError(error)) {
      switch (error.code) {
        case 'AUTH_REQUIRED':
          return 'Sign in again before requesting changes.';
        case 'FORBIDDEN':
        case 'FAMILY_MEMBERSHIP_REQUIRED':
        case 'WRONG_ACTOR_ROLE':
          return 'Your account cannot request changes on this Contract.';
        case 'INVALID_STATE':
          return 'This Contract is no longer waiting for review.';
        case 'INVALID_INPUT':
          return 'Enter valid feedback before requesting changes.';
        case 'CONTRACT_NOT_FOUND':
          return 'This Contract is no longer available.';
        case 'IDEMPOTENCY_CONFLICT':
          return 'This request could not be confirmed. Reopen the Contract before trying again.';
        case 'NETWORK_UNAVAILABLE':
          return 'Connect to the internet and try again to confirm the same request.';
      }
    }
    return 'We could not confirm the request. Try again to confirm the same action.';
  }
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
  const type = useDynamicTypeStyles();
  const styles = {
    body: { ...type.body, lineHeight: Number(type.body.fontSize) * 1.35 },
    small: { ...type.small, lineHeight: Number(type.small.fontSize) * 1.35 },
  };
  const key = useRef<string | undefined>(undefined),
    inFlight = useRef(false),
    active = useRef(true);
  const [confirming, setConfirming] = useState<'APPROVE' | 'REQUEST_CHANGES'>(),
    [pending, setPending] = useState(false),
    [confirmed, setConfirmed] = useState<'APPROVE' | 'REQUEST_CHANGES'>(),
    [error, setError] = useState<string>();
  const changesKey = useRef<string | undefined>(undefined);
  const changesPayload = useRef<
    { note: string; idempotencyKey: string } | undefined
  >(undefined);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<{ note: string }>({
    resolver: zodResolver(
      requestContractChangesInputSchema.pick({ note: true }),
    ),
    defaultValues: { note: '' },
  });
  const note = useWatch({ control, name: 'note' });
  const validNote = reviewFeedbackSchema.safeParse(note).success;
  const newKey = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const requestChanges = async (value: { note: string }) => {
    if (
      inFlight.current ||
      confirmed ||
      contract.status !== 'READY_FOR_REVIEW' ||
      contract.parentUid !== authUid
    )
      return;
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    // Changing feedback is a new action; an unchanged normalized retry retains its key.
    if (changesPayload.current?.note !== value.note) {
      changesKey.current = newKey();
      changesPayload.current = {
        note: value.note,
        idempotencyKey: changesKey.current,
      };
    }
    try {
      await requestContractChanges({
        contractId: contract.id,
        ...changesPayload.current!,
      });
      if (active.current) {
        setConfirmed('REQUEST_CHANGES');
        announceAction('Changes requested. Feedback sent.');
        setConfirming(undefined);
      }
    } catch (failure) {
      if (active.current) setError(errorMessage(failure, true));
    } finally {
      inFlight.current = false;
      if (active.current) setPending(false);
    }
  };
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
        setConfirmed('APPROVE');
        announceAction('Approved. Reward earned.');
        setConfirming(undefined);
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
    !['READY_FOR_REVIEW', 'APPROVED', 'CHANGES_REQUESTED'].includes(
      contract.status,
    )
  )
    return null;
  return (
    <View className="gap-2">
      {confirmed ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-home-text"
          style={styles.body}
        >
          {confirmed === 'APPROVE'
            ? 'Approved — reward earned'
            : 'Changes requested'}
        </Text>
      ) : null}
      {contract.status === 'CHANGES_REQUESTED' ? null : contract.status ===
        'APPROVED' ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-home-muted"
          style={styles.body}
        >
          You approved this agreement. The reward is earned. Check Rewards for
          delivery and receipt details.
        </Text>
      ) : confirmed ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-home-muted"
          style={styles.small}
        >
          Waiting for updated Contract status…
        </Text>
      ) : (
        <>
          <FormMessage message={error} />
          {confirming === 'REQUEST_CHANGES' ? (
            <>
              <FocusHeading
                allowFontScaling={false}
                accessibilityRole="header"
                className="font-semibold text-home-text"
                style={styles.body}
              >
                Request changes to this agreement?
              </FocusHeading>
              <Text
                allowFontScaling={false}
                className="text-home-muted"
                style={styles.body}
              >
                Explain what needs attention. Your feedback will be saved and
                shared with your Child. This does not earn the reward.
              </Text>
              <Controller
                control={control}
                name="note"
                render={({ field }) => (
                  <TextField
                    label="Feedback"
                    multiline
                    editable={!pending}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={errors.note?.message}
                  />
                )}
              />
              <Button
                label="Send feedback"
                loading={pending}
                disabled={!validNote || pending}
                onPress={() => void handleSubmit(requestChanges)()}
              />
              <Button
                label="Keep reviewing"
                variant="outline"
                disabled={pending}
                onPress={() => setConfirming(undefined)}
              />
            </>
          ) : confirming ? (
            <>
              <FocusHeading
                allowFontScaling={false}
                accessibilityRole="header"
                className="font-semibold text-home-text"
                style={styles.body}
              >
                Approve this completed agreement?
              </FocusHeading>
              <Text
                allowFontScaling={false}
                className="text-home-text"
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
                variant="outline"
                disabled={pending}
                onPress={() => setConfirming(undefined)}
              />
            </>
          ) : (
            <View className="gap-2">
              <Button
                label="Approve"
                onPress={() => setConfirming('APPROVE')}
              />
              <Button
                label="Request changes"
                variant="outline"
                onPress={() => {
                  setError(undefined);
                  setConfirming('REQUEST_CHANGES');
                }}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}
