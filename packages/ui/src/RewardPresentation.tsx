import { RewardIcon } from './RewardIcon';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { EarnedReward, UserProfile } from '@chorex/domain';
import { DesignText, homeTokens } from './Home';

type Viewer = UserProfile['accountType'];
export function rewardStatusLabel(
  status: EarnedReward['status'],
  viewer: Viewer,
) {
  if (status === 'FULFILLED')
    return viewer === 'PARENT' ? 'Confirmed received' : 'Received';
  if (status === 'AWAITING_CHILD_CONFIRMATION') return 'Delivered';
  return viewer === 'PARENT' ? 'Ready to deliver' : 'Earned';
}
export function rewardResponsibility(
  reward: EarnedReward,
  viewer: Viewer,
  childName?: string,
) {
  if (viewer === 'PARENT') {
    if (reward.status === 'PENDING_FULFILLMENT')
      return `${childName ?? 'Your Child'} earned this reward. Your turn to deliver it.`;
    if (reward.status === 'AWAITING_CHILD_CONFIRMATION')
      return `Waiting for ${childName ?? 'your Child'} to confirm receipt.`;
    return `${childName ?? 'Your Child'} confirmed receiving this reward.`;
  }
  if (reward.status === 'PENDING_FULFILLMENT')
    return 'You earned this reward. Waiting for your Parent to deliver it.';
  if (reward.status === 'AWAITING_CHILD_CONFIRMATION')
    return 'Your Parent marked this reward as delivered. Confirm when you have received it.';
  return 'You confirmed receiving this reward.';
}
export function rewardTone(status: EarnedReward['status'], viewer: Viewer) {
  return status === 'FULFILLED'
    ? homeTokens.mint
    : status === 'PENDING_FULFILLMENT'
      ? viewer === 'PARENT'
        ? homeTokens.coralSurface
        : homeTokens.blue
      : viewer === 'CHILD'
        ? homeTokens.coralSurface
        : homeTokens.lavender;
}
export function RewardCard({
  reward,
  viewer,
  childName,
  onPress,
}: {
  reward: EarnedReward;
  viewer: Viewer;
  childName?: string;
  onPress: () => void;
}) {
  const date =
    reward.status === 'FULFILLED'
      ? reward.confirmedAt
      : reward.status === 'AWAITING_CHILD_CONFIRMATION'
        ? reward.deliveredAt
        : reward.earnedAt;
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Open reward: ${childName ? `${childName} · ` : ''}${reward.terms.title}. ${rewardStatusLabel(reward.status, viewer)}. ${rewardResponsibility(reward, viewer, childName)} ${new Date(date).toLocaleDateString()}`}
      onPress={onPress}
      className="active:opacity-70"
      style={s.card}
    >
      <RewardIcon terms={reward.terms} />
      <View style={s.content}>
        <DesignText style={s.title}>{reward.terms.title}</DesignText>
        {childName ? (
          <DesignText style={s.caption}>{childName}</DesignText>
        ) : null}
        <DesignText style={s.status}>
          {rewardStatusLabel(reward.status, viewer)}
        </DesignText>
        <DesignText style={s.caption}>
          {reward.status === 'PENDING_FULFILLMENT'
            ? viewer === 'PARENT'
              ? 'Your turn to deliver'
              : 'Waiting for Parent delivery'
            : reward.status === 'AWAITING_CHILD_CONFIRMATION'
              ? viewer === 'PARENT'
                ? 'Waiting for Child confirmation'
                : 'Confirm when received'
              : viewer === 'PARENT'
                ? 'Receipt confirmed by Child'
                : 'Receipt confirmed by you'}
        </DesignText>
        <DesignText style={s.caption}>
          {reward.status === 'FULFILLED'
            ? 'Received'
            : reward.status === 'AWAITING_CHILD_CONFIRMATION'
              ? 'Delivered'
              : 'Earned'}{' '}
          {new Date(date).toLocaleDateString()}
        </DesignText>
      </View>
      <Ionicons
        accessible={false}
        name="chevron-forward"
        size={20}
        color={homeTokens.secondary}
      />
    </Pressable>
  );
}
export function RewardFulfillmentProgress({
  reward,
}: {
  reward: EarnedReward;
}) {
  const steps = [
    { label: 'Earned', detail: 'Contract approved', date: reward.earnedAt },
    {
      label: 'Delivered',
      detail:
        reward.status === 'PENDING_FULFILLMENT'
          ? 'Waiting for Parent delivery'
          : 'Reported by Parent',
      date:
        reward.status === 'PENDING_FULFILLMENT'
          ? undefined
          : reward.deliveredAt,
    },
    {
      label: 'Received',
      detail:
        reward.status === 'FULFILLED'
          ? 'Confirmed by Child'
          : reward.status === 'PENDING_FULFILLMENT'
            ? 'Child confirmation follows delivery'
            : 'Waiting for Child confirmation',
      date: reward.status === 'FULFILLED' ? reward.confirmedAt : undefined,
    },
  ];
  return (
    <View style={{ gap: homeTokens.spacing.medium }}>
      {steps.map((step) => (
        <View
          key={step.label}
          accessible
          accessibilityLabel={`${step.label}. ${step.detail}${step.date ? `. ${new Date(step.date).toLocaleString()}` : '. Not yet completed.'}`}
          style={s.step}
        >
          <Ionicons
            accessible={false}
            name={step.date ? 'checkmark-circle-outline' : 'ellipse-outline'}
            size={22}
            color={step.date ? homeTokens.success : homeTokens.secondary}
          />
          <View style={s.content}>
            <DesignText style={s.title}>{step.label}</DesignText>
            <DesignText style={s.caption}>{step.detail}</DesignText>
            {step.date ? (
              <DesignText style={s.caption}>
                {new Date(step.date).toLocaleString()}
              </DesignText>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: homeTokens.spacing.medium,
    borderWidth: 1,
    borderColor: homeTokens.border,
    borderRadius: homeTokens.radius.card,
    backgroundColor: homeTokens.surface,
  },
  content: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 16, fontWeight: '600', color: homeTokens.text },
  status: { fontSize: 14, fontWeight: '600', color: homeTokens.text },
  caption: { fontSize: 13, color: homeTokens.secondary },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
});
