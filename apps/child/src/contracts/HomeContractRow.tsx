import type { Contract } from '@chorex/domain';
import { useContractDetail } from '@chorex/firebase-client';
import { HomeListRow, contractStatusLabel } from '@chorex/ui';
export function HomeContractRow({
  contract,
  authUid,
  childName,
  onPress,
}: {
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
  return (
    <HomeListRow
      title={contract.rewardTerms.title}
      label={`Open Contract: ${childName ? `${childName} · ` : ''}${contract.rewardTerms.title}`}
      detail={`${childName ? `${childName} · ` : ''}${contractStatusLabel(contract.status, 'CHILD')} · Due ${new Date(contract.deadlineAt).toLocaleDateString()}${state.status === 'error' ? ' · Progress unavailable' : state.status === 'ready' && state.fromCache ? ' · Saved progress' : ''}`}
      progress={progress}
      onPress={onPress}
    />
  );
}
