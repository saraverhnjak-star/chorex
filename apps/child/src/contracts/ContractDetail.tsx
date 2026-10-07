import { SubmitForReviewAction } from './SubmitForReviewAction';
import { TaskCompletionAction } from './TaskCompletionAction';
import { Text, View } from 'react-native';
import {
  useContractDetail,
  useCurrentContractReview,
  useContractReviews,
} from '@chorex/firebase-client';
import {
  ContractSummary,
  SurfaceCard,
  TermsHeading,
  FormMessage,
  ReviewFeedback,
  ReviewHistory,
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
  const type = useDynamicTypeStyles();
  const styles = {
    body: { ...type.body, lineHeight: Number(type.body.fontSize) * 1.35 },
    small: { ...type.small, lineHeight: Number(type.small.fontSize) * 1.35 },
  };
  const feedback = useCurrentContractReview(
    state.status === 'ready' && state.contract.status === 'CHANGES_REQUESTED'
      ? state.contract
      : undefined,
    authUid,
  );
  const history = useContractReviews(
    state.status === 'ready' ? state.contract : undefined,
    authUid,
  );
  if (state.status === 'loading')
    return (
      <Text
        allowFontScaling={false}
        accessibilityLiveRegion="polite"
        className="text-home-muted"
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
        className="text-home-muted"
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
      {fromCache ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-home-muted"
          style={styles.small}
        >
          Showing saved data. Updates may be pending.
        </Text>
      ) : null}
      <ContractSummary
        contract={contract}
        tasks={tasks}
        viewer="CHILD"
        participantName={childName}
        isParticipant={contract.childUid === authUid}
      />

      {contract.status === 'CHANGES_REQUESTED' ? (
        <SurfaceCard>
          <TermsHeading icon="chatbox-ellipses-outline">
            Current request
          </TermsHeading>
          <ReviewFeedback
            loading={feedback.status === 'loading'}
            error={feedback.status === 'error'}
            note={
              feedback.status === 'ready' ? feedback.review?.note : undefined
            }
            fromCache={feedback.status === 'ready' && feedback.fromCache}
          />
          <Text
            allowFontScaling={false}
            className="text-home-muted"
            style={styles.body}
          >
            Address your Parent’s feedback in real life, then send this
            agreement back for review. Your completed task progress stays
            unchanged.
          </Text>
        </SurfaceCard>
      ) : null}
      <TermsHeading icon="checkbox-outline">Tasks</TermsHeading>
      {tasks.length === 0 ? (
        <Text
          allowFontScaling={false}
          className="text-home-muted"
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
      <SurfaceCard>
        <TermsHeading icon="gift-outline">Promised reward</TermsHeading>
        <Text
          allowFontScaling={false}
          accessibilityLabel={`Promised reward: ${contract.rewardTerms.title}, ${contract.rewardTerms.type}`}
          className="text-home-text"
          style={styles.body}
        >
          {contract.rewardTerms.title} · {contract.rewardTerms.type}
        </Text>
        {contract.rewardTerms.description ? (
          <Text
            allowFontScaling={false}
            className="text-home-muted"
            style={styles.body}
          >
            {contract.rewardTerms.description}
          </Text>
        ) : null}
      </SurfaceCard>
      <ReviewHistory
        loading={history.status === 'loading'}
        error={history.status === 'error'}
        reviews={history.status === 'ready' ? history.reviews : []}
        fromCache={history.status === 'ready' && history.fromCache}
      />
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
    </View>
  );
}
