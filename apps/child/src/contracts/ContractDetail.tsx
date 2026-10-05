import { SubmitForReviewAction } from './SubmitForReviewAction';
import { TaskCompletionAction } from './TaskCompletionAction';
import { Text, View } from 'react-native';
import {
  useContractDetail,
  useCurrentContractReview,
} from '@chorex/firebase-client';
import {
  FormMessage,
  ReviewFeedback,
  TaskProgress,
  useDynamicTypeStyles,
} from '@chorex/ui';

export function ContractDetail({
  contractId,
  authUid,
  childName,
}: {
  contractId: string;
  authUid: string | undefined;
  childName?: string;
}) {
  const state = useContractDetail(contractId, authUid);
  const styles = useDynamicTypeStyles();
  const feedback = useCurrentContractReview(
    state.status === 'ready' && state.contract.status === 'CHANGES_REQUESTED'
      ? state.contract
      : undefined,
    authUid,
  );
  if (state.status === 'loading')
    return (
      <Text
        allowFontScaling={false}
        accessibilityLiveRegion="polite"
        className="text-text-muted"
        style={styles.body}
      >
        Loading Contract…
      </Text>
    );
  if (state.status === 'error')
    return (
      <FormMessage
        message={
          state.error.code === 'NETWORK_UNAVAILABLE'
            ? 'Unable to load this Contract. Connect to the internet and reopen it.'
            : 'This Contract could not be loaded or is unavailable to your account.'
        }
      />
    );
  if (state.status === 'missing')
    return (
      <Text
        allowFontScaling={false}
        accessibilityLiveRegion="polite"
        className="text-text-muted"
        style={styles.body}
      >
        {state.fromCache
          ? 'No cached Contract is available yet. Connect to the internet to load it.'
          : 'Contract not found.'}
      </Text>
    );
  const { contract, tasks, fromCache } = state;
  return (
    <View className="gap-4">
      {contract.status === 'CHANGES_REQUESTED' ? (
        <ReviewFeedback
          loading={feedback.status === 'loading'}
          error={feedback.status === 'error'}
          note={feedback.status === 'ready' ? feedback.review?.note : undefined}
          fromCache={feedback.status === 'ready' && feedback.fromCache}
        />
      ) : null}
      {contract.status === 'CHANGES_REQUESTED' ? (
        <Text
          allowFontScaling={false}
          className="text-text-muted"
          style={styles.body}
        >
          Address your Parent’s feedback in real life, then send this agreement
          back for review. Your completed task progress stays unchanged.
        </Text>
      ) : null}
      {contract.status === 'APPROVED' ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-text"
          style={styles.body}
        >
          Your Parent approved this agreement. Your reward is earned and waiting
          to be fulfilled.
        </Text>
      ) : null}
      {childName ? (
        <Text
          allowFontScaling={false}
          className="font-semibold text-text"
          style={styles.body}
        >
          Agreement with {childName}
        </Text>
      ) : null}
      <Text
        allowFontScaling={false}
        accessibilityLabel={`Contract status: ${contract.status.replaceAll('_', ' ')}`}
        className="text-text"
        style={styles.body}
      >
        Status: {contract.status.replaceAll('_', ' ')}
      </Text>
      {fromCache ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-text-muted"
          style={styles.small}
        >
          Showing saved data. Updates may be pending.
        </Text>
      ) : null}
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        className="font-bold text-text"
        style={styles.body}
      >
        Tasks
      </Text>
      {tasks.length === 0 ? (
        <Text
          allowFontScaling={false}
          className="text-text-muted"
          style={styles.body}
        >
          No tasks are available.
        </Text>
      ) : (
        tasks.map((task) => (
          <View key={task.id} className="gap-2">
            <TaskProgress
              title={task.title}
              description={task.description}
              completedCount={task.completedCount}
              targetCount={task.targetCount}
            />
            {contract.status === 'ACTIVE' &&
            contract.childUid === authUid &&
            task.assigneeUid === authUid &&
            task.completedCount < task.targetCount ? (
              <TaskCompletionAction task={task} />
            ) : null}
          </View>
        ))
      )}
      {contract.childUid === authUid ? (
        <SubmitForReviewAction
          key={`${contract.id}:${authUid}:${contract.reviewCycle + (contract.status === 'CHANGES_REQUESTED' ? 1 : 0)}`}
          contract={contract}
          tasks={tasks}
          feedbackAvailable={
            feedback.status === 'ready' && !!feedback.review?.note
          }
        />
      ) : null}
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        className="font-bold text-text"
        style={styles.body}
      >
        Promised reward
      </Text>
      <Text
        allowFontScaling={false}
        accessibilityLabel={`Promised reward: ${contract.rewardTerms.title}, ${contract.rewardTerms.type}`}
        className="text-text"
        style={styles.body}
      >
        {contract.rewardTerms.title} · {contract.rewardTerms.type}
      </Text>
      {contract.rewardTerms.description ? (
        <Text
          allowFontScaling={false}
          className="text-text-muted"
          style={styles.body}
        >
          {contract.rewardTerms.description}
        </Text>
      ) : null}
      <Text
        allowFontScaling={false}
        accessibilityLabel={`Deadline: ${new Date(contract.deadlineAt).toLocaleString()}`}
        className="text-text"
        style={styles.body}
      >
        Deadline: {new Date(contract.deadlineAt).toLocaleString()}
      </Text>
    </View>
  );
}
