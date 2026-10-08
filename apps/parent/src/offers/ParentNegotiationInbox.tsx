import { useRouter } from 'expo-router';
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
  ProposalTerms,
  OfferOutcome,
  CountBadge,
  CollectionHeading,
  HomeListRow,
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

function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function ParentNegotiationInbox({
  activeChildren,
  authUid,
  familyId,
  preview = false,
}: {
  activeChildren: readonly ChildFamilyMembership[];
  preview?: boolean;
  authUid: string;
  familyId: string;
}) {
  const router = useRouter();
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
    <View className="gap-4 rounded-3xl border border-home-border bg-home-surface p-5">
      <View className="gap-2">
        <CollectionHeading
          label="See all Offers"
          onSeeAll={preview ? () => router.navigate('/offers') : undefined}
        >
          Counteroffers
        </CollectionHeading>
        {displayedState.status === 'ready' ? (
          <CountBadge count={displayedState.items.length} />
        ) : null}
        <Text
          allowFontScaling={false}
          className="text-home-muted"
          style={dynamicType.body}
        >
          Reward changes waiting for your response.
        </Text>
      </View>

      {message ? (
        <OfferOutcome
          title={
            message === 'Contract active'
              ? 'Agreement reached'
              : message === 'Counteroffer rejected'
                ? 'Declined'
                : 'New proposal sent'
          }
          success={message === 'Contract active'}
        >
          {message}
        </OfferOutcome>
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
            className="mt-3 text-home-muted"
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
        <OfferOutcome title="No counteroffers">
          No counteroffers are waiting for you.
        </OfferOutcome>
      ) : null}

      {displayedState.status === 'ready' && displayedState.items.length > 0 ? (
        <View className="gap-4">
          {preview
            ? displayedState.items
                .slice(0, 2)
                .map(({ offer, revision }) => (
                  <HomeListRow
                    key={offer.id}
                    reward={revision.reward}
                    title={revision.reward.title}
                    detail={`${activeChildren.find((child) => child.uid === offer.childUid)?.displayName ?? 'Child'} · Your turn`}
                    label={`Open Offer: ${revision.reward.title}`}
                    icon="document-text-outline"
                    onPress={() => router.navigate('/offers')}
                  />
                ))
            : displayedState.items.map((item) => {
                const { offer, revision } = item;
                const identity = `${subscriptionKey}:${offer.id}:${revision.id}`;
                const childName =
                  activeChildren.find((child) => child.uid === offer.childUid)
                    ?.displayName ?? 'Child profile unavailable';
                return (
                  <View
                    className="gap-3 rounded-2xl border border-home-border bg-home-surface p-4"
                    key={offer.id}
                  >
                    <ProposalTerms
                      revision={revision}
                      status="Your turn"
                      author={`Proposed by ${childName}`}
                      support={`${childName} made a counteroffer. Review the current terms below.`}
                    />
                    {rejectionConfirmation === identity ? (
                      <View className="gap-3">
                        <Text
                          allowFontScaling={false}
                          accessibilityRole="alert"
                          accessibilityLiveRegion="assertive"
                          className="text-home-text"
                          style={dynamicType.body}
                        >
                          Rejecting this counteroffer ends this Offer
                          negotiation. The terms will remain in its history.
                        </Text>
                        <Button
                          label="Confirm reject counteroffer"
                          variant="danger"
                          loading={busy}
                          onPress={() => void rejectCounteroffer(item)}
                        />
                        <Button
                          label="Keep negotiating"
                          variant="outline"
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
                          className="text-home-text"
                          style={dynamicType.body}
                        >
                          Accept these tasks, reward and deadline? This creates
                          an active Contract.
                        </Text>
                        <Button
                          label="Confirm accept counteroffer"
                          loading={busy}
                          onPress={() => void acceptCounteroffer(item)}
                        />
                        <Button
                          label="Cancel acceptance"
                          variant="outline"
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
                        variant="outline"
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
                        variant="danger"
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
