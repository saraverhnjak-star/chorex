import {
  t,
  useAppLanguage,
  ContractSummary,
  FormMessage,
  homeTokens,
  amberAuroraColors,
  ReviewFeedback,
  ReviewHistory,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { SubmitForReviewAction } from './SubmitForReviewAction';
import { TaskCompletionAction } from './TaskCompletionAction';
import { Text, View } from 'react-native';
import {
  useContractDetail,
  useCurrentContractReview,
  useContractReviews,
} from '@chorex/firebase-client';

export function ContractDetail({
  contractId,
  authUid,
  childName,
}: {
  contractId: string;
  authUid: string | undefined;
  childName?: string;
}) {
  useAppLanguage();

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
  if (state.status === 'loading') return null;
  if (state.status === 'error')
    return (
      <FormMessage
        message={
          state.error.code === 'NETWORK_UNAVAILABLE'
            ? t(
                'Unable to load this Contract. Connect to the internet and reopen it.',
              )
            : t(
                'This Contract could not be loaded or is unavailable to your account.',
              )
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
          ? t(
              'No cached Contract is available yet. Connect to the internet to load it.',
            )
          : t('Contract not found.')}
      </Text>
    );
  const { contract, tasks, fromCache } = state;
  return (
    <View className="gap-4" style={{ flexGrow: 1 }}>
      {fromCache ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-home-muted"
          style={styles.small}
        >
          {t('Showing saved data. Updates may be pending.')}
        </Text>
      ) : null}
      <ContractSummary
        cardHeader
        contract={contract}
        tasks={tasks}
        viewer="CHILD"
        participantName={childName}
        isParticipant={contract.childUid === authUid}
      />

      {contract.status === 'CHANGES_REQUESTED' ? (
        <View
          className="gap-3"
          style={{ marginTop: homeTokens.spacing.section }}
        >
          <ReviewFeedback
            rejected
            compact
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
            {t(
              'Address your Parent’s feedback in real life, then send this agreement back for review. Your completed task progress stays unchanged.',
            )}
          </Text>
        </View>
      ) : null}
      {tasks.length === 0 ? (
        <Text
          allowFontScaling={false}
          className="text-home-muted"
          style={styles.body}
        >
          {t('No tasks are available.')}
        </Text>
      ) : (
        <View
          style={{
            marginTop: homeTokens.spacing.small,
            gap: homeTokens.spacing.small,
          }}
        >
          {tasks.map((task) => (
            <TaskCompletionAction
              key={task.id}
              task={task}
              occurrences
              readOnly={
                contract.status !== 'ACTIVE' ||
                contract.childUid !== authUid ||
                task.assigneeUid !== authUid
              }
            />
          ))}
        </View>
      )}
      {history.status !== 'ready' || history.reviews.length > 0 ? (
        <ReviewHistory
          backgroundColor={`${amberAuroraColors.danger}15`}
          hideIcons
          key={`${contract.id}:${authUid}`}
          loading={history.status === 'loading'}
          error={history.status === 'error'}
          reviews={history.status === 'ready' ? history.reviews : []}
          fromCache={history.status === 'ready' && history.fromCache}
        />
      ) : null}
      {contract.childUid === authUid ? (
        <View
          style={
            contract.status === 'READY_FOR_REVIEW'
              ? { flexGrow: 1, paddingTop: homeTokens.spacing.section }
              : { marginTop: 'auto', paddingTop: homeTokens.spacing.section }
          }
        >
          <SubmitForReviewAction
            key={`${contract.id}:${authUid}:${contract.reviewCycle + (contract.status === 'CHANGES_REQUESTED' ? 1 : 0)}`}
            contract={contract}
            tasks={tasks}
            feedbackAvailable={
              feedback.status === 'ready' && !!feedback.review?.note
            }
          />
        </View>
      ) : null}
    </View>
  );
}
