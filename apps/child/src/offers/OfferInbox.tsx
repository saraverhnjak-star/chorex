import {
  DesignText,
  FocusHeading,
  announceAction,
  RewardPicker,
  ProposalTerms,
  OfferOutcome,
  CountBadge,
  SectionHeading,
  HomeFeatureCard,
  HomeCardAction,
  Button,
  FormMessage,
  TextField,
  homeTokens,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import {
  acceptOffer,
  counterOffer,
  rejectOffer,
  subscribeToCurrentChildOfferInbox,
  type ChildOfferInboxItem,
} from '@chorex/firebase-client';
import {
  rewardSelectionFor,
  rewardTermsForSelection,
  type RewardType,
  type RewardSelection,
  type RewardIconKey,
} from '@chorex/domain';
import {
  getAcceptOfferErrorMessage,
  getCounterOfferErrorMessage,
  getOfferInboxErrorMessage,
  getRejectOfferErrorMessage,
} from './messages';

type OfferInboxState =
  | { subscriptionKey: string; status: 'loading' }
  | {
      subscriptionKey: string;
      status: 'ready';
      items: readonly ChildOfferInboxItem[];
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
}: {
  showBackLink?: boolean;
  offerId?: string;
  preview?: boolean;
  initialCounterOfferId?: string;
  authUid: string;
  familyId: string;
}) {
  const router = useRouter();
  const dynamicType = useDynamicTypeStyles();
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
      unsubscribe = subscribeToCurrentChildOfferInbox(
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
                rewardSelection: rewardSelectionFor(item.revision.reward),
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
  }, [familyId, subscriptionKey, initialCounterOfferId, offerId]);

  const displayedState: OfferInboxState =
    state.subscriptionKey === subscriptionKey
      ? state
      : { subscriptionKey, status: 'loading' };

  const retrySubscription = () => {
    setActionError(undefined);
    setRejectionConfirmationOfferId(undefined);
    setCounterOfferForm(undefined);
    setSubscriptionAttempt((attempt) => attempt + 1);
  };

  const acceptCurrentOffer = async (item: ChildOfferInboxItem) => {
    if (mutatingRef.current) return;
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
      announceAction('Agreement reached. Contract is active.');
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

  const rejectCurrentOffer = async (item: ChildOfferInboxItem) => {
    if (mutatingRef.current) return;
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
      announceAction('Offer declined.');
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

  const submitCounterOffer = async (item: ChildOfferInboxItem) => {
    if (
      mutatingRef.current ||
      !counterOfferForm ||
      counterOfferForm.offerId !== item.offer.id
    ) {
      return;
    }
    const rewardTitle = counterOfferForm.rewardTitle.trim();
    if (!rewardTitle) {
      setCounterOfferTitleError('Enter a reward title.');
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
      announceAction('Counteroffer sent. Waiting for Parent.');
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

  const openCounterOfferForm = (item: ChildOfferInboxItem) => {
    setActionError(undefined);
    setResultMessage(undefined);
    setCounterOfferTitleError(undefined);
    setRejectionConfirmationOfferId(undefined);
    setCounterOfferForm({
      offerId: item.offer.id,
      rewardTitle: item.revision.reward.title,
      rewardSelection: rewardSelectionFor(item.revision.reward),
      rewardType: item.revision.reward.type,
      rewardIconKey: item.revision.reward.iconKey,
      rewardDescription: item.revision.reward.description ?? '',
      note: '',
    });
  };

  if (preview) {
    if (displayedState.status !== 'ready' || displayedState.items.length === 0)
      return null;
    const { offer, revision } = displayedState.items[0]!;
    return (
      <HomeFeatureCard
        tone="coralSurface"
        badge="NEW OFFER"
        title={revision.tasks[0]?.title ?? revision.reward.title}
        detail={`Reward: ${revision.reward.title}`}
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
            label="View offer"
            tone="coral"
            onPress={() =>
              router.navigate({
                pathname: '/offers/[offerId]',
                params: { offerId: offer.id },
              })
            }
          />
          <HomeCardAction
            label="Suggest a change"
            tone="outline"
            onPress={() =>
              router.navigate({
                pathname: '/offers/[offerId]',
                params: { offerId: offer.id, counterOfferId: offer.id },
              })
            }
          />
        </View>
      </HomeFeatureCard>
    );
  }

  return (
    <View className="gap-4" style={offerId ? { flexGrow: 1 } : undefined}>
      {offerId && showBackLink ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Back to Offers"
          onPress={() => router.navigate('/offers')}
          style={{
            alignSelf: 'flex-start',
            minHeight: 44,
            justifyContent: 'center',
          }}
          className="active:opacity-60"
        >
          <DesignText style={{ fontSize: 14, color: homeTokens.coralText }}>
            ← Offers
          </DesignText>
        </Pressable>
      ) : null}
      {!offerId ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <SectionHeading>Offers</SectionHeading>
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
              ? 'Agreement reached'
              : resultMessage === 'Offer rejected.'
                ? 'Declined'
                : 'Waiting for parent'
          }
          success={resultMessage === 'Contract is active.'}
        >
          {resultMessage === 'Waiting for parent' ? undefined : resultMessage}
        </OfferOutcome>
      ) : null}

      <FormMessage message={actionError} />

      {displayedState.status === 'loading' ? (
        <View
          className={
            preview ? 'flex-row items-center gap-2' : 'items-center py-6'
          }
        >
          <ActivityIndicator
            accessibilityLabel="Loading offers"
            color={homeTokens.coral}
          />
          <Text
            allowFontScaling={false}
            className={preview ? 'text-home-muted' : 'mt-3 text-home-muted'}
            style={dynamicType.body}
          >
            Loading offers…
          </Text>
        </View>
      ) : null}

      {displayedState.status === 'error' ? (
        <View className="gap-3">
          <FormMessage message={displayedState.message} />
          <Button label="Try offers again" onPress={retrySubscription} />
        </View>
      ) : null}

      {displayedState.status === 'ready' &&
      displayedState.items.length === 0 &&
      !resultMessage ? (
        <OfferOutcome title={offerId ? 'Offer unavailable' : 'No new offers'}>
          {offerId
            ? 'This offer is no longer waiting for your response.'
            : 'No offers are waiting for you.'}
        </OfferOutcome>
      ) : null}

      {displayedState.status === 'ready' && displayedState.items.length > 0 ? (
        <View className="gap-4" style={offerId ? { flexGrow: 1 } : undefined}>
          {displayedState.items.map(({ offer, revision }) =>
            !offerId ? (
              <HomeFeatureCard
                key={offer.id}
                tone="coralSurface"
                badge="NEW OFFER"
                title={revision.tasks[0]?.title ?? revision.reward.title}
                detail={`Reward: ${revision.reward.title}`}
                reward={revision.reward}
              >
                <HomeCardAction
                  label="View offer"
                  accessibilityLabel={`Open offer: ${revision.reward.title}`}
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
                <ProposalTerms
                  layout="rewardFirst"
                  revision={revision}
                  status="Your turn"
                  author="Proposed by your Parent"
                  support="Accept to create your agreement, counter the reward, or decline."
                />
                {rejectionConfirmationOfferId === offer.id ? (
                  <View className="gap-3 rounded-2xl border border-home-border bg-home-surface p-4">
                    <FocusHeading
                      allowFontScaling={false}
                      accessibilityLiveRegion="polite"
                      className="font-semibold text-home-text"
                      style={dynamicType.body}
                    >
                      Reject this offer?
                    </FocusHeading>
                    <Text
                      allowFontScaling={false}
                      className="text-home-muted"
                      style={dynamicType.body}
                    >
                      This will close the offer without creating a contract.
                    </Text>
                    <Button
                      label="Confirm rejection"
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
                      label="Keep offer"
                      disabled={mutation !== undefined}
                      onPress={() => setRejectionConfirmationOfferId(undefined)}
                      variant="outline"
                    />
                  </View>
                ) : counterOfferForm?.offerId === offer.id ? (
                  <View
                    className="gap-3"
                    style={{ marginTop: homeTokens.spacing.section }}
                  >
                    <FocusHeading
                      allowFontScaling={false}
                      accessibilityRole="header"
                      className="font-semibold text-home-text"
                      style={dynamicType.body}
                    >
                      Make a counteroffer
                    </FocusHeading>
                    <Text
                      allowFontScaling={false}
                      className="text-home-muted"
                      style={dynamicType.small}
                    >
                      Your changes become a new proposal for your Parent to
                      review. Tasks and deadline stay the same.
                    </Text>
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
                                rewardTitle: reward.title,
                                rewardSelection: selection,
                                rewardType: reward.type,
                                rewardIconKey: reward.iconKey,
                              }
                            : current,
                        );
                      }}
                    />
                    {counterOfferForm.rewardSelection === 'custom' ? (
                      <>
                        <TextField
                          editable={mutation === undefined}
                          error={counterOfferTitleError}
                          label="Selected reward"
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
                      label="Counteroffer reward description (optional)"
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
                      label="Counteroffer note (optional)"
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
                      label="Send counteroffer"
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
                      label="Cancel counteroffer"
                      disabled={mutation !== undefined}
                      onPress={() => {
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
                      label="Accept offer"
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
                      label="Counter reward"
                      disabled={mutation !== undefined}
                      onPress={() => openCounterOfferForm({ offer, revision })}
                      variant="outline"
                    />
                    <Button
                      label="Reject offer"
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
