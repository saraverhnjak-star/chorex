import { RewardIcon } from './RewardIcon';
import { View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Contract, ContractTask, UserProfile } from '@chorex/domain';
import { DesignText, homeTokens } from './Home';
import { SurfaceCard, TermsHeading } from './OfferTerms';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
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
  const icon: Icon =
    status === 'APPROVED'
      ? 'checkmark-circle-outline'
      : status === 'CHANGES_REQUESTED'
        ? 'chatbox-ellipses-outline'
        : status === 'ACTIVE'
          ? 'checkbox-outline'
          : 'time-outline';
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
    <SurfaceCard>
      <View style={[s.status, { backgroundColor: tone }]}>
        <Ionicons
          accessible={false}
          name={icon}
          size={24}
          color={
            status === 'APPROVED'
              ? homeTokens.success
              : status === 'CHANGES_REQUESTED'
                ? homeTokens.attentionText
                : homeTokens.secondary
          }
        />
        <View style={{ flex: 1, gap: 8 }}>
          <DesignText
            accessibilityLabel={`Contract status: ${contractStatusLabel(status, viewer)}`}
            style={s.title}
          >
            {contractStatusLabel(status, viewer)}
          </DesignText>
          {responsibility && isParticipant ? (
            <DesignText style={s.body}>{responsibility}</DesignText>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <RewardIcon terms={contract.rewardTerms} />
        <DesignText
          accessibilityRole="header"
          style={[s.agreement, { flex: 1 }]}
        >
          {contract.rewardTerms.title}
        </DesignText>
      </View>
      <DesignText style={s.caption}>Agreed commitment</DesignText>
      {participantName ? (
        <View style={s.participant}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={s.avatar}
          >
            <DesignText style={s.title}>
              {participantName.trim().slice(0, 1).toUpperCase()}
            </DesignText>
          </View>
          <DesignText style={[s.body, { flex: 1 }]}>
            Agreement with {participantName}
          </DesignText>
        </View>
      ) : null}
      <TermsHeading icon="calendar-outline">Deadline</TermsHeading>
      <DesignText
        accessibilityLabel={`Deadline: ${new Date(contract.deadlineAt).toLocaleString()}`}
        style={s.body}
      >
        Deadline: {new Date(contract.deadlineAt).toLocaleString()}
      </DesignText>
      {contract.approvedAt ? (
        <DesignText style={s.caption}>
          Approved: {new Date(contract.approvedAt).toLocaleString()}
        </DesignText>
      ) : null}
      <TermsHeading icon="stats-chart-outline">Progress</TermsHeading>
      <DesignText style={s.title}>
        {completeTasks} of {tasks.length} tasks complete
      </DesignText>
      <CompletionBar completed={completed} required={required} decorative />
      <DesignText style={s.caption}>
        {completed} / {required} completions recorded
      </DesignText>
    </SurfaceCard>
  );
}
export function CompletionBar({
  completed,
  required,
  decorative = false,
}: {
  completed: number;
  required: number;
  decorative?: boolean;
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
