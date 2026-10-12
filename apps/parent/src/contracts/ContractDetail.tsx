import {
  t,
  useAppLanguage,
  ContractSummary,
  FormMessage,
  homeTokens,
  amberAuroraColors,
  ReviewFeedback,
  ReviewHistory,
  DesignText,
  DesignIcon,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { ApproveContractAction } from './ApproveContractAction';
import { Text, View } from 'react-native';
import {
  useContractDetail,
  useCurrentContractReview,
  useContractReviews,
} from '@chorex/firebase-client';

export function ContractDetail({
  contractId,
  authUid,
  childNames = {},
  requestChangesOnly = false,
}: {
  contractId: string;
  authUid: string | undefined;
  childNames?: Readonly<Record<string, string>>;
  requestChangesOnly?: boolean;
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
  const childName = childNames[contract.childUid];
  if (requestChangesOnly)
    return contract.status === 'READY_FOR_REVIEW' ? (
      <ApproveContractAction
        key={`${contract.id}:${authUid}`}
        contract={contract}
        authUid={authUid}
        requestChangesOnly
      />
    ) : (
      <FormMessage
        message={t('This Contract is no longer waiting for review.')}
      />
    );
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
        viewer="PARENT"
        participantName={childName}
        isParticipant={contract.parentUid === authUid}
      />

      {contract.status === 'CHANGES_REQUESTED' ? (
        <View
          className="gap-3"
          style={{ marginTop: homeTokens.spacing.section }}
        >
          <ReviewFeedback
            compact
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
          {t('No tasks are available.')}
        </Text>
      ) : (
        <View
          style={{
            marginTop: homeTokens.spacing.small,
            gap: homeTokens.spacing.small,
          }}
        >
          {tasks.flatMap((task) =>
            Array.from({ length: task.targetCount }, (_, index) => (
              <View
                key={`${task.id}:${index}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: homeTokens.spacing.medium,
                  paddingVertical: homeTokens.spacing.small,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor:
                      index < task.completedCount
                        ? homeTokens.mint
                        : homeTokens.surface,
                    borderWidth: index < task.completedCount ? 0 : 1,
                    borderColor: homeTokens.secondary,
                  }}
                >
                  {index < task.completedCount ? (
                    <DesignIcon
                      accessible={false}
                      name="checkmark-outline"
                      size={26}
                      color={homeTokens.success}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1, gap: homeTokens.spacing.small }}>
                  <DesignText
                    style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: homeTokens.text,
                    }}
                  >
                    {task.title}
                  </DesignText>
                  {task.description ? (
                    <DesignText
                      style={{ fontSize: 14, color: homeTokens.secondary }}
                    >
                      {task.description}
                    </DesignText>
                  ) : null}
                </View>
              </View>
            )),
          )}
        </View>
      )}
      {history.status !== 'ready' || history.reviews.length > 0 ? (
        <ReviewHistory
          hideIcons
          backgroundColor={`${amberAuroraColors.danger}15`}
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
