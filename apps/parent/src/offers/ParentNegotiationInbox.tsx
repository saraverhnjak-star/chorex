import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { ChildFamilyMembership, CounterOfferInput } from '@chorex/domain';
import {
  acceptOffer,
  counterOffer,
  rejectOffer,
  subscribeToCurrentParentNegotiationInbox,
  type ParentNegotiationInboxItem,
} from '@chorex/firebase-client';
import {
  Button,
  FormMessage,
  amberAuroraColors,
  useDynamicTypeStyles,
} from '@chorex/ui';
import {
  getAcceptOfferErrorMessage,
  getCounterOfferErrorMessage,
  getRejectOfferErrorMessage,
  getParentNegotiationInboxErrorMessage,
} from './messages';

import { ParentCounterofferForm } from './ParentCounterofferForm';

type ParentNegotiationInboxState =
  | { subscriptionKey: string; status: 'loading' }
  | {
      subscriptionKey: string;
      status: 'ready';
      items: readonly ParentNegotiationInboxItem[];
    }
  | { subscriptionKey: string; status: 'error'; message: string };

function formatDeadline(deadlineAt: string): string {
  return new Date(deadlineAt).toLocaleString();
}

function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function ParentNegotiationInbox({
  activeChildren,
  authUid,
  familyId,
}: {
  activeChildren: readonly ChildFamilyMembership[];
  authUid: string;
  familyId: string;
}) {
  const dynamicType = useDynamicTypeStyles();
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);
  const subscriptionKey = `${authUid}:${familyId}:${subscriptionAttempt}`;
  const [state, setState] = useState<ParentNegotiationInboxState>({
    subscriptionKey,
    status: 'loading',
  });

  const [rejectionConfirmation, setRejectionConfirmation] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [confirmation, setConfirmation] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const mutating = useRef(false);
  const keys = useRef(new Map<string, string>());
  const scope = useRef(subscriptionKey);
  useEffect(() => {
    scope.current = subscriptionKey;
  }, [subscriptionKey]);

  const acceptCounteroffer = async (item: ParentNegotiationInboxItem) => {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setActionError(undefined);
    setMessage(undefined);
    const identity = `${subscriptionKey}:${item.offer.id}:${item.revision.id}`;
    const key = keys.current.get(identity) ?? `accept-${newIdempotencyKey()}`;
    keys.current.set(identity, key);
    try {
      await acceptOffer({
        offerId: item.offer.id,
        currentRevisionId: item.revision.id,
        idempotencyKey: key,
      });
      if (scope.current === subscriptionKey) {
        setMessage('Contract active');
        setConfirmation(undefined);
      }
    } catch (error) {
      if (scope.current === subscriptionKey)
        setActionError(getAcceptOfferErrorMessage(error));
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };

  const rejectCounteroffer = async (item: ParentNegotiationInboxItem) => {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setActionError(undefined);
    setMessage(undefined);
    const identity = `${subscriptionKey}:reject:${item.offer.id}:${item.revision.id}`;
    const key = keys.current.get(identity) ?? `reject-${newIdempotencyKey()}`;
    keys.current.set(identity, key);
    try {
      await rejectOffer({
        offerId: item.offer.id,
        currentRevisionId: item.revision.id,
        idempotencyKey: key,
      });
      if (scope.current === subscriptionKey) {
        setMessage('Counteroffer rejected');
        setRejectionConfirmation(undefined);
      }
    } catch (error) {
      if (scope.current === subscriptionKey)
        setActionError(getRejectOfferErrorMessage(error));
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };

  const sendCounteroffer = async (proposal: CounterOfferInput) => {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setActionError(undefined);
    setMessage(undefined);
    const terms = { ...proposal, idempotencyKey: undefined };
    const fingerprint = `${subscriptionKey}:counter:${JSON.stringify(terms)}`;
    const key =
      keys.current.get(fingerprint) ?? `counter-${newIdempotencyKey()}`;
    keys.current.set(fingerprint, key);
    try {
      await counterOffer({ ...terms, idempotencyKey: key });
      if (scope.current === subscriptionKey) {
        setMessage('Counteroffer sent');
        setEditing(undefined);
      }
    } catch (error) {
      if (scope.current === subscriptionKey)
        setActionError(getCounterOfferErrorMessage(error));
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = subscribeToCurrentParentNegotiationInbox(
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
            message: getParentNegotiationInboxErrorMessage(error),
          }),
      );
    } catch (error) {
      const message = getParentNegotiationInboxErrorMessage(error);
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

  const displayedState: ParentNegotiationInboxState =
    state.subscriptionKey === subscriptionKey
      ? state
      : { subscriptionKey, status: 'loading' };

  return (
    <View className="gap-4 rounded-3xl border border-border bg-surface-warm p-5">
      <View className="gap-2">
        <Text
          allowFontScaling={false}
          accessibilityRole="header"
          className="font-bold text-text"
          style={dynamicType.title}
        >
          Counteroffers
        </Text>
        <Text
          allowFontScaling={false}
          className="text-text-muted"
          style={dynamicType.body}
        >
          Reward changes waiting for your response.
        </Text>
      </View>

      {message ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-text"
          style={dynamicType.body}
        >
          {message}
        </Text>
      ) : null}
      {actionError ? <FormMessage message={actionError} /> : null}
      {displayedState.status === 'loading' ? (
        <View className="items-center py-6">
          <ActivityIndicator
            accessibilityLabel="Loading counteroffers"
            color={amberAuroraColors.primaryPressed}
          />
          <Text
            allowFontScaling={false}
            className="mt-3 text-text-muted"
            style={dynamicType.body}
          >
            Loading counteroffers…
          </Text>
        </View>
      ) : null}

      {displayedState.status === 'error' ? (
        <View className="gap-3">
          <FormMessage message={displayedState.message} />
          <Button
            label="Try counteroffers again"
            onPress={() => setSubscriptionAttempt((attempt) => attempt + 1)}
          />
        </View>
      ) : null}

      {displayedState.status === 'ready' &&
      displayedState.items.length === 0 ? (
        <Text
          allowFontScaling={false}
          className="text-text-muted"
          style={dynamicType.body}
        >
          No counteroffers are waiting for you.
        </Text>
      ) : null}

      {displayedState.status === 'ready' && displayedState.items.length > 0 ? (
        <View className="gap-4">
          {displayedState.items.map((item) => {
            const { offer, revision } = item;
            const identity = `${subscriptionKey}:${offer.id}:${revision.id}`;
            const childName =
              activeChildren.find((child) => child.uid === offer.childUid)
                ?.displayName ?? 'Child profile unavailable';
            return (
              <View
                className="gap-3 rounded-2xl border border-border bg-background p-4"
                key={offer.id}
              >
                <Text
                  allowFontScaling={false}
                  className="font-semibold text-text"
                  style={dynamicType.body}
                >
                  {childName}
                </Text>
                <Text
                  allowFontScaling={false}
                  className="font-semibold text-text"
                  style={dynamicType.body}
                >
                  Status: Awaiting parent
                </Text>

                <View className="gap-1">
                  <Text
                    allowFontScaling={false}
                    className="font-semibold text-text"
                    style={dynamicType.body}
                  >
                    Proposed reward
                  </Text>
                  <Text
                    allowFontScaling={false}
                    className="text-text-muted"
                    style={dynamicType.body}
                  >
                    {revision.reward.title} · {revision.reward.type}
                  </Text>
                  {revision.reward.description ? (
                    <Text
                      allowFontScaling={false}
                      className="text-text-muted"
                      style={dynamicType.body}
                    >
                      {revision.reward.description}
                    </Text>
                  ) : null}
                </View>

                {revision.note ? (
                  <View className="gap-1">
                    <Text
                      allowFontScaling={false}
                      className="font-semibold text-text"
                      style={dynamicType.body}
                    >
                      Child note
                    </Text>
                    <Text
                      allowFontScaling={false}
                      className="text-text-muted"
                      style={dynamicType.body}
                    >
                      {revision.note}
                    </Text>
                  </View>
                ) : null}

                <View className="gap-1">
                  <Text
                    allowFontScaling={false}
                    className="font-semibold text-text"
                    style={dynamicType.body}
                  >
                    Tasks
                  </Text>
                  {revision.tasks.map((task, index) => (
                    <Text
                      allowFontScaling={false}
                      className="text-text-muted"
                      key={`${offer.id}-task-${index}`}
                      style={dynamicType.body}
                    >
                      {task.title} · {task.targetCount}×
                    </Text>
                  ))}
                </View>

                <Text
                  allowFontScaling={false}
                  className="text-text-muted"
                  style={dynamicType.body}
                >
                  Deadline: {formatDeadline(revision.deadlineAt)}
                </Text>
                {rejectionConfirmation === identity ? (
                  <View className="gap-3">
                    <Text
                      allowFontScaling={false}
                      accessibilityRole="alert"
                      accessibilityLiveRegion="assertive"
                      className="text-text"
                      style={dynamicType.body}
                    >
                      Rejecting this counteroffer ends this Offer negotiation.
                      The terms will remain in its history.
                    </Text>
                    <Button
                      label="Confirm reject counteroffer"
                      loading={busy}
                      onPress={() => void rejectCounteroffer(item)}
                    />
                    <Button
                      label="Keep negotiating"
                      variant="secondary"
                      disabled={busy}
                      onPress={() => setRejectionConfirmation(undefined)}
                    />
                  </View>
                ) : editing === identity ? (
                  <ParentCounterofferForm
                    key={identity}
                    revision={revision}
                    busy={busy}
                    onCancel={() => setEditing(undefined)}
                    onSubmit={sendCounteroffer}
                  />
                ) : confirmation === identity ? (
                  <View className="gap-3">
                    <Text
                      accessibilityLiveRegion="polite"
                      className="text-text"
                      style={dynamicType.body}
                    >
                      Accept these tasks, reward and deadline? This creates an
                      active Contract.
                    </Text>
                    <Button
                      label="Confirm accept counteroffer"
                      loading={busy}
                      onPress={() => void acceptCounteroffer(item)}
                    />
                    <Button
                      label="Cancel acceptance"
                      variant="secondary"
                      disabled={busy}
                      onPress={() => setConfirmation(undefined)}
                    />
                  </View>
                ) : (
                  <Button
                    label="Accept counteroffer"
                    disabled={busy}
                    onPress={() => {
                      setConfirmation(identity);
                      setActionError(undefined);
                      setMessage(undefined);
                    }}
                  />
                )}
                {rejectionConfirmation !== identity &&
                editing !== identity &&
                confirmation !== identity ? (
                  <Button
                    label="Counteroffer"
                    variant="secondary"
                    disabled={busy}
                    onPress={() => {
                      setEditing(identity);
                      setConfirmation(undefined);
                      setActionError(undefined);
                      setMessage(undefined);
                    }}
                  />
                ) : null}
                {rejectionConfirmation !== identity &&
                editing !== identity &&
                confirmation !== identity ? (
                  <Button
                    label="Reject counteroffer"
                    variant="secondary"
                    disabled={busy}
                    onPress={() => {
                      setRejectionConfirmation(identity);
                      setConfirmation(undefined);
                      setEditing(undefined);
                      setActionError(undefined);
                      setMessage(undefined);
                    }}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
