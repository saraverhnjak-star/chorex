import { ParentHomeCard, ParentHomeRow } from '../navigation/ParentHomeRow';
import type { Contract } from '@chorex/domain';
import { useContractDetail } from '@chorex/firebase-client';
import {
  HomeListRow,
  CompletionBar,
  DesignText,
  homeTokens,
  contractStatusLabel,
} from '@chorex/ui';
export function HomeContractRow({
  contract,
  authUid,
  childName,
  onPress,
  preview = false,
}: {
  preview?: boolean;
  contract: Contract;
  authUid: string;
  childName?: string;
  onPress: () => void;
}) {
  const state = useContractDetail(contract.id, authUid);
  const progress =
    state.status === 'ready'
      ? {
          completed: state.tasks.reduce(
            (sum, task) => sum + task.completedCount,
            0,
          ),
          required: state.tasks.reduce(
            (sum, task) => sum + task.targetCount,
            0,
          ),
        }
      : undefined;
  if (preview)
    return (
      <ParentHomeCard>
        <ParentHomeRow
          title={contract.rewardTerms.title}
          detail={`${childName ? `${childName} · ` : ''}Due ${new Date(contract.deadlineAt).toLocaleDateString()}`}
          reward={contract.rewardTerms}
          artRight
          label={`Open Contract: ${childName ? `${childName} · ` : ''}${contract.rewardTerms.title}`}
          onPress={onPress}
        >
          {progress ? (
            <>
              <CompletionBar
                completed={progress.completed}
                required={progress.required}
              />
              <DesignText style={{ fontSize: 13, color: homeTokens.secondary }}>
                {progress.completed} of {progress.required} completions
              </DesignText>
            </>
          ) : (
            <DesignText style={{ fontSize: 13, color: homeTokens.secondary }}>
              {state.status === 'error'
                ? 'Progress unavailable'
                : 'Loading progress…'}
            </DesignText>
          )}
          {state.status === 'ready' && state.fromCache ? (
            <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
              Saved progress. Updates may be pending.
            </DesignText>
          ) : null}
        </ParentHomeRow>
      </ParentHomeCard>
    );
  return (
    <HomeListRow
      reward={contract.rewardTerms}
      title={contract.rewardTerms.title}
      label={`Open Contract: ${childName ? `${childName} · ` : ''}${contract.rewardTerms.title}`}
      detail={`${childName ? `${childName} · ` : ''}${contractStatusLabel(contract.status, 'PARENT')} · Due ${new Date(contract.deadlineAt).toLocaleDateString()}${state.status === 'error' ? ' · Progress unavailable' : state.status === 'ready' && state.fromCache ? ' · Saved progress' : ''}`}
      progress={progress}
      onPress={onPress}
    />
  );
}
