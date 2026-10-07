import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  acceptOffer,
  counterOffer,
  rejectOffer,
  subscribeToCurrentChildOfferInbox,
  type ChildOfferInboxItem,
} from '@chorex/firebase-client';
import { rewardTypeSchema, type RewardType } from '@chorex/domain';
import {
  CountBadge,
  Button,
  FormMessage,
  TextField,
  amberAuroraColors,
  useDynamicTypeStyles,
} from '@chorex/ui';
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

function formatDeadline(deadlineAt: string): string {
  return new Date(deadlineAt).toLocaleString();
}

function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

type MutationState =
  { offerId: string; action: 'accept' | 'reject' | 'counter' } | undefined;

interface CounterOfferFormState {
  offerId: string;
  rewardTitle: string;
  rewardType: RewardType;
  rewardDescription: string;
  note: string;
}

const rewardTypes = rewardTypeSchema.options;

export function OfferInbox({
  authUid,
  familyId,
}: {
  authUid: string;
  familyId: string;
}) {
  const dynamicType = useDynamicTypeStyles();
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);
  const subscriptionKey = `${authUid}:${familyId}:${subscriptionAttempt}`;
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

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = subscribeToCurrentChildOfferInbox(
        familyId,
        (items) => {
          if (active) {
            setState({ subscriptionKey, status: 'ready', items });
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
  }, [familyId, subscriptionKey]);

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
      rewardType: item.revision.reward.type,
      rewardDescription: item.revision.reward.description ?? '',
      note: '',
    });
  };

  return (
    <View className="gap-4 rounded-3xl border border-home-border bg-home-surface p-5">
      <View className="gap-2">
        <Text
          allowFontScaling={false}
          accessibilityRole="header"
          className="font-bold text-home-text"
          style={[dynamicType.body, { fontSize: 21 }]}
        >
          Offers
        </Text>
        {displayedState.status === 'ready' ? (
          <CountBadge count={displayedState.items.length} />
        ) : null}
        <Text
          allowFontScaling={false}
          className="text-home-muted"
          style={dynamicType.body}
        >
          Agreements waiting for your response.
        </Text>
      </View>

      {resultMessage ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="font-semibold text-home-text"
          style={dynamicType.body}
        >
          {resultMessage}
        </Text>
      ) : null}

      <FormMessage message={actionError} />

      {displayedState.status === 'loading' ? (
        <View className="items-center py-6">
          <ActivityIndicator
            accessibilityLabel="Loading offers"
            color={amberAuroraColors.primaryPressed}
          />
          <Text
            allowFontScaling={false}
            className="mt-3 text-home-muted"
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
      displayedState.items.length === 0 ? (
        <View>
          <Text
            allowFontScaling={false}
            className="text-home-muted"
            style={dynamicType.body}
          >
            No offers are waiting for you.
          </Text>
        </View>
      ) : null}

      {displayedState.status === 'ready' && displayedState.items.length > 0 ? (
        <View className="gap-4">
          {displayedState.items.map(({ offer, revision }) => (
            <View
              className="gap-3 rounded-2xl border border-home-border bg-background p-4"
              key={offer.id}
            >
              <Text
                allowFontScaling={false}
                className="font-semibold text-home-text"
                style={dynamicType.body}
              >
                Status: Awaiting child
              </Text>

              <View className="gap-1">
                <Text
                  allowFontScaling={false}
                  className="font-semibold text-home-text"
                  style={dynamicType.body}
                >
                  Tasks
                </Text>
                {revision.tasks.map((task, index) => (
                  <Text
                    allowFontScaling={false}
                    className="text-home-muted"
                    key={`${offer.id}-task-${index}`}
                    style={dynamicType.body}
                  >
                    {task.title} · {task.targetCount}×
                  </Text>
                ))}
              </View>

              <View className="gap-1">
                <Text
                  allowFontScaling={false}
                  className="font-semibold text-home-text"
                  style={dynamicType.body}
                >
                  Reward
                </Text>
                <Text
                  allowFontScaling={false}
                  className="text-home-muted"
                  style={dynamicType.body}
                >
                  {revision.reward.title} · {revision.reward.type}
                </Text>
                {revision.reward.description ? (
                  <Text
                    allowFontScaling={false}
                    className="text-home-muted"
                    style={dynamicType.body}
                  >
                    {revision.reward.description}
                  </Text>
                ) : null}
              </View>

              <Text
                allowFontScaling={false}
                className="text-home-muted"
                style={dynamicType.body}
              >
                Deadline: {formatDeadline(revision.deadlineAt)}
              </Text>
              {rejectionConfirmationOfferId === offer.id ? (
                <View className="gap-3 rounded-2xl border border-home-border bg-home-surface p-4">
                  <Text
                    allowFontScaling={false}
                    accessibilityLiveRegion="polite"
                    className="font-semibold text-home-text"
                    style={dynamicType.body}
                  >
                    Reject this offer?
                  </Text>
                  <Text
                    allowFontScaling={false}
                    className="text-home-muted"
                    style={dynamicType.body}
                  >
                    This will close the offer without creating a contract.
                  </Text>
                  <Button
                    label="Confirm rejection"
                    loading={
                      mutation?.offerId === offer.id &&
                      mutation.action === 'reject'
                    }
                    disabled={
                      mutation !== undefined && mutation.offerId !== offer.id
                    }
                    onPress={() => void rejectCurrentOffer({ offer, revision })}
                  />
                  <Button
                    label="Keep offer"
                    disabled={mutation !== undefined}
                    onPress={() => setRejectionConfirmationOfferId(undefined)}
                    variant="secondary"
                  />
                </View>
              ) : counterOfferForm?.offerId === offer.id ? (
                <View className="gap-3 rounded-2xl border border-home-border bg-home-surface p-4">
                  <Text
                    allowFontScaling={false}
                    accessibilityRole="header"
                    className="font-semibold text-home-text"
                    style={dynamicType.body}
                  >
                    Counter the reward
                  </Text>
                  <TextField
                    editable={mutation === undefined}
                    error={counterOfferTitleError}
                    label="Counteroffer reward title"
                    onChangeText={(rewardTitle) => {
                      setCounterOfferTitleError(undefined);
                      setCounterOfferForm((current) =>
                        current ? { ...current, rewardTitle } : current,
                      );
                    }}
                    value={counterOfferForm.rewardTitle}
                  />
                  <Text
                    allowFontScaling={false}
                    className="font-semibold text-home-text"
                    style={dynamicType.body}
                  >
                    Counteroffer reward type
                  </Text>
                  <View className="gap-2">
                    {rewardTypes.map((rewardType) => (
                      <Button
                        key={rewardType}
                        label={`${counterOfferForm.rewardType === rewardType ? 'Selected' : 'Select'} ${rewardType.toLowerCase()}`}
                        disabled={mutation !== undefined}
                        onPress={() =>
                          setCounterOfferForm((current) =>
                            current ? { ...current, rewardType } : current,
                          )
                        }
                        variant={
                          counterOfferForm.rewardType === rewardType
                            ? 'primary'
                            : 'secondary'
                        }
                      />
                    ))}
                  </View>
                  <TextField
                    editable={mutation === undefined}
                    label="Counteroffer reward description (optional)"
                    multiline
                    onChangeText={(rewardDescription) =>
                      setCounterOfferForm((current) =>
                        current ? { ...current, rewardDescription } : current,
                      )
                    }
                    value={counterOfferForm.rewardDescription}
                  />
                  <TextField
                    editable={mutation === undefined}
                    label="Counteroffer note (optional)"
                    multiline
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
                    onPress={() => void submitCounterOffer({ offer, revision })}
                  />
                  <Button
                    label="Cancel counteroffer"
                    disabled={mutation !== undefined}
                    onPress={() => {
                      setCounterOfferForm(undefined);
                      setCounterOfferTitleError(undefined);
                    }}
                    variant="secondary"
                  />
                </View>
              ) : (
                <View className="gap-3">
                  <Button
                    label="Accept offer"
                    loading={
                      mutation?.offerId === offer.id &&
                      mutation.action === 'accept'
                    }
                    disabled={
                      mutation !== undefined && mutation.offerId !== offer.id
                    }
                    onPress={() => void acceptCurrentOffer({ offer, revision })}
                  />
                  <Button
                    label="Counter reward"
                    disabled={mutation !== undefined}
                    onPress={() => openCounterOfferForm({ offer, revision })}
                    variant="secondary"
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
                    variant="secondary"
                  />
                </View>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
