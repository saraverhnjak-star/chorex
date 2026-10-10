import { ApproveContractAction } from './ApproveContractAction';
import { Text, View } from 'react-native';
import {
  useContractDetail,
  useCurrentContractReview,
  useContractReviews,
} from '@chorex/firebase-client';
import {
  ContractSummary,
  TermsHeading,
  FormMessage,
  homeTokens,
  ReviewFeedback,
  ReviewHistory,
  TaskProgress,
  useDynamicTypeStyles,
} from '@chorex/ui';

export function ContractDetail({
  contractId,
  authUid,
  childNames = {},
}: {
  contractId: string;
  authUid: string | undefined;
  childNames?: Readonly<Record<string, string>>;
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
  const childName = childNames[contract.childUid];
  return (
    <View className="gap-4" style={{ flexGrow: 1 }}>
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
        viewer="PARENT"
        participantName={childName}
        isParticipant={contract.parentUid === authUid}
      />

      {contract.status === 'CHANGES_REQUESTED' ? (
        <View
          className="gap-3"
          style={{ marginTop: homeTokens.spacing.section }}
        >
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
        </View>
      ) : null}
      {tasks.length === 0 ? (
        <Text
          allowFontScaling={false}
          className="text-home-muted"
          style={styles.body}
        >
          No tasks are available.
        </Text>
      ) : (
        <View
          style={{
            marginTop: homeTokens.spacing.section,
            gap: homeTokens.spacing.section,
          }}
        >
          {tasks.map((task) => (
            <View key={task.id} className="gap-2">
              <TaskProgress
                compact
                title={task.title}
                description={task.description}
                completedCount={task.completedCount}
                targetCount={task.targetCount}
              />
            </View>
          ))}
        </View>
      )}
      {history.status !== 'ready' || history.reviews.length > 0 ? (
        <ReviewHistory
          collapsible
          key={`${contract.id}:${authUid}`}
          loading={history.status === 'loading'}
          error={history.status === 'error'}
          reviews={history.status === 'ready' ? history.reviews : []}
          fromCache={history.status === 'ready' && history.fromCache}
        />
      ) : null}
      <View
        style={{ marginTop: 'auto', paddingTop: homeTokens.spacing.section }}
      >
        <ApproveContractAction
          key={`${contract.id}:${authUid}`}
          contract={contract}
          authUid={authUid}
        />
      </View>
    </View>
  );
}
