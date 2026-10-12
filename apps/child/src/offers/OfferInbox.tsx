import {
  t,
  useAppLanguage,
  DesignText,
  FocusHeading,
  announceAction,
  RewardPicker,
  ProposalTerms,
  OfferOutcome,
  WaitingState,
  CountBadge,
  SectionHeading,
  HomeFeatureCard,
  HomeCardAction,
  Button,
  FormMessage,
  TextField,
  homeTokens,
  amberAuroraPalette,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { StatusTabs } from '../navigation/StatusTabs';
import { useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  acceptOffer,
  counterOffer,
  rejectOffer,
  subscribeToCurrentChildOfferInbox,
  subscribeToChildOfferHistory,
} from '@chorex/firebase-client';
import {
  rewardTermsForSelection,
  type ChildOfferHistoryItem,
  type RewardType,
  type Offer,
  type RewardSelection,
  type RewardIconKey,
} from '@chorex/domain';
import {
  getAcceptOfferErrorMessage,
  getCounterOfferErrorMessage,
  getOfferInboxErrorMessage,
  getRejectOfferErrorMessage,
} from './messages';

function offerLabel(status: Offer['status']): string {
  switch (status) {
    case 'DRAFT':
      return t('Draft');
    case 'AWAITING_CHILD':
      return t('Your turn');
    case 'AWAITING_PARENT':
      return t("Parent's turn");
    case 'ACCEPTED':
      return t('Accepted');
    case 'REJECTED':
      return t('Rejected');
    case 'CANCELLED':
      return t('Cancelled');
    case 'EXPIRED':
      return t('Expired');
  }
}

type OfferInboxState =
  | { subscriptionKey: string; status: 'loading' }
  | {
      subscriptionKey: string;
      status: 'ready';
      items: readonly ChildOfferHistoryItem[];
    }
  | { subscriptionKey: string; status: 'error'; message: string };

function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

type MutationState =
  { offerId: string; action: 'accept' | 'reject' | 'counter' } | undefined;

interface CounterOfferFormState {
  rewardSelection: RewardSelection;
  offerId: string;
  rewardTitle: string;
  rewardType: RewardType;
  rewardIconKey: RewardIconKey;
  rewardDescription: string;
  note: string;
}

export function OfferInbox({
  authUid,
  familyId,
  preview = false,
  initialCounterOfferId,
  offerId,
  showBackLink = true,
  onHasOffersChange,
  onLoadingChange,
}: {
  showBackLink?: boolean;
  onHasOffersChange?: (hasOffers: boolean) => void;
  onLoadingChange?: (loading: boolean) => void;
  offerId?: string;
  preview?: boolean;
  initialCounterOfferId?: string;
  authUid: string;
  familyId: string;
}) {
  useAppLanguage();

  const router = useRouter();
  const dynamicType = useDynamicTypeStyles();
  const [selectedStatus, setSelectedStatus] = useState('Your turn');
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);
  const subscriptionKey = `${authUid}:${familyId}:${offerId ?? 'list'}:${subscriptionAttempt}`;
  const [state, setState] = useState<OfferInboxState>({
    subscriptionKey,
    status: 'loading',
  });
  const [mutation, setMutation] = useState<MutationState>();
  const [actionError, setActionError] = useState<string>();
  const [resultMessage, setResultMessage] = useState<string>();
  const [rejectionConfirmationOfferId, setRejectionConfirmationOfferId] =
    useState<string>();
  const [counterOfferForm, setCounterOfferForm] =
    useState<CounterOfferFormState>();
  const [counterOfferTitleError, setCounterOfferTitleError] =
    useState<string>();
  const mutatingRef = useRef(false);
  const acceptIdempotencyKeys = useRef(new Map<string, string>());
  const rejectIdempotencyKeys = useRef(new Map<string, string>());
  const counterOfferIdempotencyKeys = useRef(new Map<string, string>());

  const openedCounterOffer = useRef<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = (
        preview
          ? subscribeToCurrentChildOfferInbox
          : subscribeToChildOfferHistory
      )(
        familyId,
        (items) => {
          if (active) {
            setState({
              subscriptionKey,
              status: 'ready',
              items: offerId
                ? items.filter(({ offer }) => offer.id === offerId)
                : items,
            });
            const requestKey = `${subscriptionKey}:${initialCounterOfferId}`;
            const item =
              offerId && initialCounterOfferId === offerId
                ? items.find(({ offer }) => offer.id === initialCounterOfferId)
                : undefined;
            if (item && openedCounterOffer.current !== requestKey) {
              openedCounterOffer.current = requestKey;
              setCounterOfferForm({
                offerId: item.offer.id,
                rewardTitle: item.revision.reward.title,
                rewardSelection:
                  item.revision.reward.type === 'CUSTOM'
                    ? 'custom'
                    : item.revision.reward.iconKey,
                rewardType: item.revision.reward.type,
                rewardIconKey: item.revision.reward.iconKey,
                rewardDescription: item.revision.reward.description ?? '',
                note: '',
              });
            }
          }
        },
        (error) =>
          active &&
          setState({
            subscriptionKey,
            status: 'error',
            message: getOfferInboxErrorMessage(error),
          }),
        offerId,
      );
    } catch (error) {
      const message = getOfferInboxErrorMessage(error);
      queueMicrotask(() => {
        if (active) {
          setState({ subscriptionKey, status: 'error', message });
        }
      });
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [familyId, subscriptionKey, initialCounterOfferId, offerId, preview]);

  const displayedState: OfferInboxState =
    state.subscriptionKey === subscriptionKey
      ? state
      : { subscriptionKey, status: 'loading' };

  const hasOffers =
    displayedState.status === 'ready' && displayedState.items.length > 0;
  useLayoutEffect(() => {
    onHasOffersChange?.(hasOffers);
  }, [hasOffers, onHasOffersChange]);

  useLayoutEffect(() => {
    onLoadingChange?.(displayedState.status === 'loading');
  }, [displayedState.status, onLoadingChange]);

  const retrySubscription = () => {
    setActionError(undefined);
    setRejectionConfirmationOfferId(undefined);
    setCounterOfferForm(undefined);
    setSubscriptionAttempt((attempt) => attempt + 1);
  };

  const acceptCurrentOffer = async (item: ChildOfferHistoryItem) => {
    if (mutatingRef.current || item.offer.status !== 'AWAITING_CHILD') return;
    mutatingRef.current = true;
    const key =
      acceptIdempotencyKeys.current.get(item.offer.id) ??
      `accept-${newIdempotencyKey()}`;
    acceptIdempotencyKeys.current.set(item.offer.id, key);
    setMutation({ offerId: item.offer.id, action: 'accept' });
    setActionError(undefined);
    setResultMessage(undefined);
    try {
      await acceptOffer({
        offerId: item.offer.id,
        currentRevisionId: item.offer.currentRevisionId,
        idempotencyKey: key,
      });
      acceptIdempotencyKeys.current.delete(item.offer.id);
      setResultMessage('Contract is active.');
      announceAction(t('Agreement reached. Contract is active.'));
      setState((current) =>
        current.subscriptionKey === subscriptionKey &&
        current.status === 'ready'
          ? {
              subscriptionKey,
              status: 'ready',
              items: current.items.filter(
                ({ offer }) => offer.id !== item.offer.id,
              ),
            }
          : current,
      );
    } catch (error) {
      setActionError(getAcceptOfferErrorMessage(error));
    } finally {
      mutatingRef.current = false;
      setMutation(undefined);
    }
  };

  const rejectCurrentOffer = async (item: ChildOfferHistoryItem) => {
    if (mutatingRef.current || item.offer.status !== 'AWAITING_CHILD') return;
    mutatingRef.current = true;
    const key =
      rejectIdempotencyKeys.current.get(item.offer.id) ??
      `reject-${newIdempotencyKey()}`;
    rejectIdempotencyKeys.current.set(item.offer.id, key);
    setMutation({ offerId: item.offer.id, action: 'reject' });
    setActionError(undefined);
    setResultMessage(undefined);
    try {
      await rejectOffer({
        offerId: item.offer.id,
        currentRevisionId: item.offer.currentRevisionId,
        idempotencyKey: key,
      });
      rejectIdempotencyKeys.current.delete(item.offer.id);
      setRejectionConfirmationOfferId(undefined);
      setResultMessage('Offer rejected.');
      announceAction(t('Offer declined.'));
      setState((current) =>
        current.subscriptionKey === subscriptionKey &&
        current.status === 'ready'
          ? {
              subscriptionKey,
              status: 'ready',
              items: current.items.filter(
                ({ offer }) => offer.id !== item.offer.id,
              ),
            }
          : current,
      );
    } catch (error) {
      setActionError(getRejectOfferErrorMessage(error));
    } finally {
      mutatingRef.current = false;
      setMutation(undefined);
    }
  };

  const submitCounterOffer = async (item: ChildOfferHistoryItem) => {
    if (
      mutatingRef.current ||
      !counterOfferForm ||
      counterOfferForm.offerId !== item.offer.id
    ) {
      return;
    }
    const rewardTitle = counterOfferForm.rewardTitle.trim();
    if (!rewardTitle) {
      setCounterOfferTitleError(t('Enter a reward title.'));
      return;
    }

    mutatingRef.current = true;
    const key =
      counterOfferIdempotencyKeys.current.get(item.offer.id) ??
      `counter-${newIdempotencyKey()}`;
    counterOfferIdempotencyKeys.current.set(item.offer.id, key);
    setMutation({ offerId: item.offer.id, action: 'counter' });
    setActionError(undefined);
    setResultMessage(undefined);
    setCounterOfferTitleError(undefined);
    try {
      await counterOffer({
        offerId: item.offer.id,
        currentRevisionId: item.offer.currentRevisionId,
        reward: {
          title: rewardTitle,
          type: counterOfferForm.rewardType,
          iconKey: counterOfferForm.rewardIconKey,
          ...(counterOfferForm.rewardDescription.trim()
            ? { description: counterOfferForm.rewardDescription.trim() }
            : {}),
        },
        ...(counterOfferForm.note.trim()
          ? { note: counterOfferForm.note.trim() }
          : {}),
        idempotencyKey: key,
      });
      counterOfferIdempotencyKeys.current.delete(item.offer.id);
      setCounterOfferForm(undefined);
      setResultMessage('Waiting for parent');
      announceAction(t('Counteroffer sent. Waiting for Parent.'));
      setState((current) =>
        current.subscriptionKey === subscriptionKey &&
        current.status === 'ready'
          ? {
              subscriptionKey,
              status: 'ready',
              items: current.items.filter(
                ({ offer }) => offer.id !== item.offer.id,
              ),
            }
          : current,
      );
    } catch (error) {
      setActionError(getCounterOfferErrorMessage(error));
    } finally {
      mutatingRef.current = false;
      setMutation(undefined);
    }
  };

  const openCounterOfferForm = (item: ChildOfferHistoryItem) => {
    router.push({
      pathname: '/offers/counter',
      params: { offerId: item.offer.id },
    });
  };

  if (preview) {
    if (displayedState.status !== 'ready' || displayedState.items.length === 0)
      return null;
    const { offer, revision } = displayedState.items[0]!;
    return (
      <HomeFeatureCard
        tone="coralSurface"
        badge={
          offer.status === 'AWAITING_CHILD'
            ? preview
              ? t('NEW OFFER')
              : t('Your turn')
            : offer.status === 'AWAITING_PARENT'
              ? t("Parent's turn")
              : offerLabel(offer.status)
        }
        title={revision.reward.title}
        detail={t('Number of tasks: {0}', {
          '0': revision.tasks.reduce(
            (total, task) => total + task.targetCount,
            0,
          ),
        })}
        reward={revision.reward}
      >
        <View
          style={{
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: homeTokens.spacing.small,
          }}
        >
          <HomeCardAction
            label={t('View offer')}
            tone="coral"
            onPress={() =>
              router.navigate({
                pathname: '/offers/[offerId]',
                params: { offerId: offer.id },
              })
            }
          />
          <HomeCardAction
            label={t('Suggest a change')}
            tone="outline"
            onPress={() =>
              router.navigate({
                pathname: '/offers/counter',
                params: { offerId: offer.id },
              })
            }
          />
        </View>
      </HomeFeatureCard>
    );
  }

  if (resultMessage === 'Waiting for parent' && offerId)
    return <WaitingState>{t(resultMessage)}</WaitingState>;

  if (resultMessage === 'Contract is active.' && offerId)
    return (
      <OfferOutcome title={t('Agreement reached')} success centered>
        {t(resultMessage)}
      </OfferOutcome>
    );

  const visibleItems =
    displayedState.status === 'ready'
      ? displayedState.items.filter(
          ({ offer }) =>
            preview ||
            offerId ||
            (selectedStatus === 'Your turn'
              ? offer.status === 'AWAITING_CHILD'
              : offer.status === 'AWAITING_PARENT'),
        )
      : [];
  if (displayedState.status === 'loading') return null;
  return (
    <View className="gap-4" style={!preview ? { flexGrow: 1 } : undefined}>
      {offerId && showBackLink ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('Back to Offers')}
          onPress={() => router.navigate('/offers')}
          style={{
            alignSelf: 'flex-start',
            minHeight: 44,
            justifyContent: 'center',
          }}
          className="active:opacity-60"
        >
          <DesignText
            style={{ fontSize: 14, color: amberAuroraPalette.navigationActive }}
          >
            ← {t('Back')}
          </DesignText>
        </Pressable>
      ) : null}
      {!offerId &&
      !preview &&
      displayedState.status === 'ready' &&
      displayedState.items.some(({ offer }) =>
        ['AWAITING_CHILD', 'AWAITING_PARENT'].includes(offer.status),
      ) ? (
        <StatusTabs
          labels={['Your turn', "Parent's turn"]}
          tone="orange"
          counts={{
            'Your turn': displayedState.items.filter(
              ({ offer }) => offer.status === 'AWAITING_CHILD',
            ).length,
            "Parent's turn": displayedState.items.filter(
              ({ offer }) => offer.status === 'AWAITING_PARENT',
            ).length,
          }}
          selected={selectedStatus}
          onSelect={setSelectedStatus}
        />
      ) : null}
      {preview &&
      !offerId &&
      !(
        displayedState.status === 'ready' && displayedState.items.length === 0
      ) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <SectionHeading>{t('Offers')}</SectionHeading>
          </View>
          {displayedState.status === 'ready' ? (
            <CountBadge count={displayedState.items.length} />
          ) : null}
        </View>
      ) : null}

      {resultMessage ? (
        <OfferOutcome
          title={
            resultMessage === 'Contract is active.'
              ? t('Agreement reached')
              : resultMessage === 'Offer rejected.'
                ? t('Declined')
                : t('Waiting for parent')
          }
          success={resultMessage === 'Contract is active.'}
        >
          {resultMessage === 'Waiting for parent'
            ? undefined
            : t(resultMessage)}
        </OfferOutcome>
      ) : null}

      <FormMessage message={actionError} />

      {displayedState.status === 'error' ? (
        <View className="gap-3">
          <FormMessage message={displayedState.message} />
          <Button label={t('Try offers again')} onPress={retrySubscription} />
        </View>
      ) : null}

      {displayedState.status === 'ready' &&
      visibleItems.length === 0 &&
      !resultMessage ? (
        <OfferOutcome
          title={
            offerId
              ? t('Offer unavailable')
              : selectedStatus === "Parent's turn"
                ? t('No pending offers')
                : t('No new offers')
          }
          centered={!offerId}
          illustration={!offerId ? 'no-offers' : undefined}
        >
          {offerId
            ? t('This offer is no longer waiting for your response.')
            : selectedStatus === "Parent's turn"
              ? t('No proposals are waiting for your parent.')
              : t('No offers are waiting for you.')}
        </OfferOutcome>
      ) : null}

      {displayedState.status === 'ready' && visibleItems.length > 0 ? (
        <View className="gap-4" style={!preview ? { flexGrow: 1 } : undefined}>
          {visibleItems.map(({ offer, revision }) =>
            !offerId ? (
              <HomeFeatureCard
                key={offer.id}
                tone="coralSurface"
                badge={
                  offer.status === 'AWAITING_CHILD'
                    ? preview
                      ? t('NEW OFFER')
                      : t('Your turn')
                    : offer.status === 'AWAITING_PARENT'
                      ? t("Parent's turn")
                      : offerLabel(offer.status)
                }
                title={revision.reward.title}
                detail={t('Number of tasks: {0}', {
                  '0': revision.tasks.reduce(
                    (total, task) => total + task.targetCount,
                    0,
                  ),
                })}
                reward={revision.reward}
              >
                <HomeCardAction
                  label={t('View offer')}
                  accessibilityLabel={t('Open offer: {0}', {
                    '0': revision.reward.title,
                  })}
                  tone="coral"
                  onPress={() =>
                    router.navigate({
                      pathname: '/offers/[offerId]',
                      params: { offerId: offer.id },
                    })
                  }
                />
              </HomeFeatureCard>
            ) : (
              <View className="gap-4" style={{ flexGrow: 1 }} key={offer.id}>
                {!initialCounterOfferId ? (
                  <ProposalTerms
                    cardHeader
                    layout="rewardFirst"
                    revision={revision}
                    status={
                      offer.status === 'AWAITING_CHILD'
                        ? t('Your turn')
                        : offer.status === 'AWAITING_PARENT'
                          ? t("Parent's turn")
                          : offerLabel(offer.status)
                    }
                    author={
                      revision.proposedByRole === 'CHILD'
                        ? t('Proposed by you')
                        : t('Proposed by your Parent')
                    }
                    support={
                      offer.status === 'AWAITING_CHILD'
                        ? t(
                            'Accept to create your agreement, counter the reward, or decline.',
                          )
                        : offer.status === 'AWAITING_PARENT'
                          ? t('Your proposal is waiting for your parent.')
                          : t('This offer is closed.')
                    }
                  />
                ) : null}
                {rejectionConfirmationOfferId === offer.id ? (
                  <View className="gap-3 rounded-2xl border border-home-border bg-home-surface p-4">
                    <FocusHeading
                      allowFontScaling={false}
                      accessibilityLiveRegion="polite"
                      className="font-semibold text-home-text"
                      style={dynamicType.body}
                    >
                      {t('Reject this offer?')}
                    </FocusHeading>
                    <Text
                      allowFontScaling={false}
                      className="text-home-muted"
                      style={dynamicType.body}
                    >
                      {t(
                        'This will close the offer without creating a contract.',
                      )}
                    </Text>
                    <Button
                      label={t('Confirm rejection')}
                      variant="danger"
                      loading={
                        mutation?.offerId === offer.id &&
                        mutation.action === 'reject'
                      }
                      disabled={
                        mutation !== undefined && mutation.offerId !== offer.id
                      }
                      onPress={() =>
                        void rejectCurrentOffer({ offer, revision })
                      }
                    />
                    <Button
                      label={t('Keep offer')}
                      disabled={mutation !== undefined}
                      onPress={() => setRejectionConfirmationOfferId(undefined)}
                      variant="outline"
                    />
                  </View>
                ) : offer.status !==
                  'AWAITING_CHILD' ? null : counterOfferForm?.offerId ===
                  offer.id ? (
                  <View
                    className="gap-3"
                    style={{ marginTop: homeTokens.spacing.section }}
                  >
                    <RewardPicker
                      prominent
                      currentReward={{
                        title: counterOfferForm.rewardTitle,
                        iconKey: counterOfferForm.rewardIconKey,
                      }}
                      value={counterOfferForm.rewardSelection}
                      disabled={mutation !== undefined}
                      onChange={(selection) => {
                        if (selection === counterOfferForm.rewardSelection)
                          return;
                        const reward = rewardTermsForSelection(selection);
                        setCounterOfferTitleError(undefined);
                        setCounterOfferForm((current) =>
                          current
                            ? {
                                ...current,
                                rewardTitle: t(reward.title),
                                rewardSelection: selection,
                                rewardType: reward.type,
                                rewardIconKey: reward.iconKey,
                              }
                            : current,
                        );
                      }}
                    />
                    {counterOfferForm.rewardType === 'CUSTOM' ? (
                      <>
                        <TextField
                          editable={mutation === undefined}
                          error={counterOfferTitleError}
                          label={t('Selected reward')}
                          onChangeText={(rewardTitle) => {
                            setCounterOfferTitleError(undefined);
                            setCounterOfferForm((current) =>
                              current ? { ...current, rewardTitle } : current,
                            );
                          }}
                          value={counterOfferForm.rewardTitle}
                        />
                      </>
                    ) : null}
                    <TextField
                      required={false}
                      editable={mutation === undefined}
                      label={t('Counteroffer reward description (optional)')}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      onChangeText={(rewardDescription) =>
                        setCounterOfferForm((current) =>
                          current ? { ...current, rewardDescription } : current,
                        )
                      }
                      value={counterOfferForm.rewardDescription}
                    />
                    <TextField
                      required={false}
                      editable={mutation === undefined}
                      label={t('Counteroffer note (optional)')}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      onChangeText={(note) =>
                        setCounterOfferForm((current) =>
                          current ? { ...current, note } : current,
                        )
                      }
                      value={counterOfferForm.note}
                    />
                    <Button
                      label={t('Send')}
                      lightText
                      loading={
                        mutation?.offerId === offer.id &&
                        mutation.action === 'counter'
                      }
                      disabled={
                        mutation !== undefined && mutation.offerId !== offer.id
                      }
                      onPress={() =>
                        void submitCounterOffer({ offer, revision })
                      }
                    />
                    <Button
                      label={t('Cancel')}
                      disabled={mutation !== undefined}
                      onPress={() => {
                        if (initialCounterOfferId) {
                          if (router.canGoBack()) router.back();
                          else router.replace('/offers');
                          return;
                        }
                        setCounterOfferForm(undefined);
                        setCounterOfferTitleError(undefined);
                      }}
                      variant="outline"
                    />
                  </View>
                ) : (
                  <View
                    className="gap-3"
                    style={{
                      marginTop: 'auto',
                      paddingTop: homeTokens.spacing.section,
                    }}
                  >
                    <Button
                      lightText
                      label={t('Accept offer')}
                      loading={
                        mutation?.offerId === offer.id &&
                        mutation.action === 'accept'
                      }
                      disabled={
                        mutation !== undefined && mutation.offerId !== offer.id
                      }
                      onPress={() =>
                        void acceptCurrentOffer({ offer, revision })
                      }
                    />
                    <Button
                      label={t('Counter reward')}
                      disabled={mutation !== undefined}
                      onPress={() => openCounterOfferForm({ offer, revision })}
                      variant="outline"
                    />
                    <Button
                      label={t('Reject offer')}
                      disabled={mutation !== undefined}
                      onPress={() => {
                        setActionError(undefined);
                        setResultMessage(undefined);
                        setCounterOfferForm(undefined);
                        setRejectionConfirmationOfferId(offer.id);
                      }}
                      variant="danger"
                    />
                  </View>
                )}
              </View>
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}
