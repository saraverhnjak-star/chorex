import { t, useAppLanguage ,
  FocusHeading,
  announceAction,
  Button,
  FormMessage,
  WaitingState,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Contract, ContractTask } from '@chorex/domain';
import { submitContractForReview } from '@chorex/firebase-client';
import { getSubmissionErrorMessage } from './messages';

export function SubmitForReviewAction({
  contract,
  tasks,
  feedbackAvailable = false,
}: {
  contract: Contract;
  tasks: readonly ContractTask[];
  feedbackAvailable?: boolean;
}) {
  useAppLanguage();

  const type = useDynamicTypeStyles();
  const styles = {
    body: { ...type.body, lineHeight: Number(type.body.fontSize) * 1.35 },
    small: { ...type.small, lineHeight: Number(type.small.fontSize) * 1.35 },
  };
  const key = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const active = useRef(true);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [resubmitted, setResubmitted] = useState(false);
  const [error, setError] = useState<string>();
  const allComplete =
    tasks.length > 0 &&
    tasks.every((task) => task.completedCount === task.targetCount);
  const resubmitting = contract.status === 'CHANGES_REQUESTED';
  const canSubmit = resubmitting ? feedbackAvailable : allComplete;
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
      (contract.status !== 'ACTIVE' && !resubmitting) ||
      !canSubmit
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
        announceAction(
          resubmitting ? t('Sent back for review') : t('Sent for review'),
        );
        setResubmitted(resubmitting);
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
  if (
    contract.status !== 'ACTIVE' &&
    contract.status !== 'READY_FOR_REVIEW' &&
    !resubmitting
  )
    return null;
  if (resubmitting && !feedbackAvailable && !confirmed) return null;
  return (
    <View className="gap-2">
      {confirmed ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-home-text"
          style={styles.body}
        >
          {resubmitted ? t('Sent back for review') : t('Sent for review')}
        </Text>
      ) : null}
      {contract.status === 'READY_FOR_REVIEW' ? (
        <WaitingState>
          {t('Your Parent now needs to review this agreement.')}
        </WaitingState>
      ) : confirmed ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-home-muted"
          style={styles.small}
        >
          {t('Waiting for updated Contract status…')}
        </Text>
      ) : (
        <>
          <FormMessage message={error} />
          {!canSubmit ? (
            <Text
              allowFontScaling={false}
              className="text-home-muted"
              style={styles.body}
            >
              {t('Complete all tasks before submitting for review.')}
            </Text>
          ) : confirming ? (
            <>
              <FocusHeading
                allowFontScaling={false}
                accessibilityRole="header"
                className="font-semibold text-home-text"
                style={styles.body}
              >
                {resubmitting
                  ? t('Send this Contract back for review?')
                  : t('Send this Contract for review?')}
              </FocusHeading>
              <Text
                allowFontScaling={false}
                className="text-home-text"
                style={styles.body}
              >
                {resubmitting
                  ? t(
                      'Confirm that you have addressed your Parent’s feedback. Your completed task progress stays unchanged.',
                    )
                  : t(
                      'Your Parent will review the completed agreement and may approve or request changes.',
                    )}
              </Text>
              <Button
                label={
                  resubmitting
                    ? t('Confirm resubmission')
                    : t('Confirm submission')
                }
                variant="blue"
                lightText
                loading={pending}
                onPress={() => void submit()}
              />
              <Button
                label={t('Keep checking')}
                variant="outline"
                disabled={pending}
                onPress={() => setConfirming(false)}
              />
            </>
          ) : (
            <Button
              variant="blue"
              lightText
              label={
                resubmitting ? t('Resubmit for review') : t('Submit for review')
              }
              onPress={() => setConfirming(true)}
            />
          )}
        </>
      )}
    </View>
  );
}
