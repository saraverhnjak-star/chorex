import { amberAuroraPalette } from './theme';
import { RewardIcon } from './RewardIcon';
import { View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Contract, ContractTask, UserProfile } from '@chorex/domain';
import { DesignText, homeTokens } from './Home';

export function contractStatusLabel(
  status: Contract['status'],
  viewer: UserProfile['accountType'],
) {
  switch (status) {
    case 'ACTIVE':
      return 'In progress';
    case 'READY_FOR_REVIEW':
      return viewer === 'CHILD' ? 'Waiting for review' : 'Ready for review';
    case 'CHANGES_REQUESTED':
      return viewer === 'CHILD'
        ? 'Changes requested'
        : 'Waiting for resubmission';
    case 'APPROVED':
      return 'Approved';
    case 'CANCELLED':
      return 'Cancelled';
    case 'EXPIRED':
      return 'Expired';
  }
}
/** Factual presentation only. Submission eligibility stays in the existing action. */
export function ContractSummary({
  contract,
  tasks,
  viewer,
  participantName,
  isParticipant = true,
}: {
  contract: Contract;
  tasks: readonly ContractTask[];
  viewer: UserProfile['accountType'];
  participantName?: string;
  isParticipant?: boolean;
}) {
  const status = contract.status;
  const tone =
    status === 'APPROVED'
      ? homeTokens.mint
      : status === 'CHANGES_REQUESTED'
        ? homeTokens.attention
        : status === 'ACTIVE'
          ? homeTokens.blue
          : homeTokens.lavender;
  const responsibility =
    viewer === 'CHILD'
      ? status === 'ACTIVE'
        ? 'Your turn · Complete the agreed tasks, then submit for Parent review.'
        : status === 'READY_FOR_REVIEW'
          ? 'Waiting for parent review. Your submitted tasks remain visible below.'
          : status === 'CHANGES_REQUESTED'
            ? 'Your turn · Address the feedback, then resubmit. Your recorded progress is preserved.'
            : status === 'APPROVED'
              ? 'Your Parent approved this agreement. Your reward is earned. Check Rewards for delivery and receipt details.'
              : undefined
      : status === 'ACTIVE'
        ? `${participantName ?? 'Your Child'} is working on this agreement.`
        : status === 'READY_FOR_REVIEW'
          ? 'Your review · Check the agreed work, then approve or request changes.'
          : status === 'CHANGES_REQUESTED'
            ? `Waiting for ${participantName ?? 'your Child'} to address feedback and resubmit.`
            : undefined;
  const completeTasks = tasks.filter(
    (task) => task.completedCount === task.targetCount,
  ).length;
  const completed = tasks.reduce((sum, task) => sum + task.completedCount, 0);
  const required = tasks.reduce((sum, task) => sum + task.targetCount, 0);
  return (
    <View style={{ gap: homeTokens.spacing.section }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: homeTokens.spacing.medium,
        }}
      >
        <RewardIcon terms={contract.rewardTerms} size={88} />
        <View style={{ flex: 1, gap: homeTokens.spacing.small }}>
          <DesignText
            accessibilityRole="header"
            accessibilityLabel={`Promised reward: ${contract.rewardTerms.title}, ${contract.rewardTerms.type}`}
            style={{
              fontSize: 26,
              fontWeight: '700',
              color: homeTokens.text,
            }}
          >
            {contract.rewardTerms.title}
          </DesignText>
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: tone,
              borderRadius: homeTokens.radius.card,
              paddingHorizontal: homeTokens.spacing.medium,
              paddingVertical: homeTokens.spacing.small,
            }}
          >
            <DesignText
              accessibilityLabel={`Contract status: ${contractStatusLabel(status, viewer)}`}
              style={s.title}
            >
              {contractStatusLabel(status, viewer)}
            </DesignText>
          </View>
        </View>
      </View>
      {viewer === 'PARENT' && participantName ? (
        <DesignText style={s.body}>Agreement with {participantName}</DesignText>
      ) : null}
      {contract.rewardTerms.description ? (
        <DesignText style={s.body}>
          {contract.rewardTerms.description}
        </DesignText>
      ) : null}
      {responsibility && isParticipant ? (
        <DesignText style={s.body}>{responsibility}</DesignText>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: homeTokens.spacing.medium,
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: homeTokens.coralSurface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            accessible={false}
            name="calendar-outline"
            size={28}
            color={homeTokens.text}
          />
        </View>
        <DesignText
          accessibilityLabel={`Deadline: ${new Date(contract.deadlineAt).toLocaleString()}`}
          style={[s.body, { flex: 1 }]}
        >
          {new Date(contract.deadlineAt).toLocaleString()}
        </DesignText>
      </View>
      {contract.approvedAt ? (
        <DesignText style={s.caption}>
          Approved: {new Date(contract.approvedAt).toLocaleString()}
        </DesignText>
      ) : null}
      {tasks.length > 1 ? (
        <View style={{ gap: homeTokens.spacing.small }}>
          <DesignText style={s.title}>
            {completeTasks} of {tasks.length} tasks complete
          </DesignText>
          <CompletionBar
            completed={completed}
            required={required}
            decorative
            tone="blue"
          />
          <DesignText style={s.caption}>
            {completed} / {required} completions recorded
          </DesignText>
        </View>
      ) : null}
    </View>
  );
}

export function CompletionBar({
  completed,
  required,
  decorative = false,
  tone = 'green',
}: {
  completed: number;
  required: number;
  decorative?: boolean;
  tone?: 'green' | 'blue';
}) {
  return (
    <View
      accessible={!decorative}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      accessibilityRole="progressbar"
      accessibilityLabel="Recorded completions"
      accessibilityValue={{
        min: 0,
        max: required,
        now: completed,
        text: `${completed} of ${required} completions recorded`,
      }}
      style={s.track}
    >
      <View
        style={[
          s.fill,
          tone === 'blue'
            ? { backgroundColor: amberAuroraPalette.auroraBlue }
            : undefined,
          {
            width: `${required ? Math.min(100, (completed / required) * 100) : 0}%`,
          },
        ]}
      />
    </View>
  );
}
const s = StyleSheet.create({
  status: {
    padding: homeTokens.spacing.medium,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  title: { fontSize: 16, fontWeight: '600', color: homeTokens.text },
  agreement: { fontSize: 22, fontWeight: '700', color: homeTokens.text },
  body: { fontSize: 15, color: homeTokens.text },
  caption: { fontSize: 14, color: homeTokens.secondary },
  participant: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: homeTokens.coralSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: 999,
    backgroundColor: homeTokens.border,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 999, backgroundColor: homeTokens.success },
});
