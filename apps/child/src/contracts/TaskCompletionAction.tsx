import {
  t,
  useAppLanguage,
  Button,
  FormMessage,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { ContractTask } from '@chorex/domain';
import { recordTaskCompletion } from '@chorex/firebase-client';
import { getTaskCompletionErrorMessage } from './messages';

export function TaskCompletionAction({ task }: { task: ContractTask }) {
  useAppLanguage();

  const type = useDynamicTypeStyles();
  const styles = {
    body: { ...type.body, lineHeight: Number(type.body.fontSize) * 1.35 },
    small: { ...type.small, lineHeight: Number(type.small.fontSize) * 1.35 },
  };
  const key = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const active = useRef(true);
  const [pending, setPending] = useState(false);
  const [acceptedCount, setAcceptedCount] = useState<number>();
  const [error, setError] = useState<string>();
  const waitingForRead =
    acceptedCount !== undefined && task.completedCount < acceptedCount;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const complete = async () => {
    if (
      inFlight.current ||
      waitingForRead ||
      task.completedCount >= task.targetCount
    )
      return;
    inFlight.current = true;
    key.current ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    setPending(true);
    setError(undefined);
    try {
      const result = await recordTaskCompletion({
        contractId: task.contractId,
        taskId: task.id,
        idempotencyKey: key.current,
      });
      if (!active.current) return;
      setAcceptedCount(result.task.completedCount);
      key.current = undefined;
    } catch (failure) {
      // Keep the key after ambiguous network failure: retry confirms this occurrence.
      if (active.current) setError(getTaskCompletionErrorMessage(failure));
    } finally {
      inFlight.current = false;
      if (active.current) setPending(false);
    }
  };
  return (
    <View className="gap-2 mt-3">
      <FormMessage message={error} />
      {waitingForRead ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-home-muted"
          style={styles.small}
        >
          {t('Completion recorded. Waiting for updated progress…')}
        </Text>
      ) : null}
      <Button
        label={task.targetCount === 1 ? t('Mark done') : t('Mark one done')}
        accessibilityLabel={t(
          '{0}. {1} of {2} completions recorded. Mark another completion',
          { '0': task.title, '1': task.completedCount, '2': task.targetCount },
        )}
        variant="blue"
        lightText
        loading={pending}
        disabled={waitingForRead}
        onPress={() => void complete()}
      />
    </View>
  );
}
