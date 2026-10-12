import { t, useAppLanguage, dateLocale } from './localization';
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
  if (status === 'FULFILLED') return t('Received');
  if (status === 'AWAITING_CHILD_CONFIRMATION') return t('Delivered');
  return viewer === 'PARENT' ? t('Your turn') : t('Earned');
}
export function rewardResponsibility(
  reward: EarnedReward,
  viewer: Viewer,
  childName?: string,
) {
  if (viewer === 'PARENT') {
    if (reward.status === 'PENDING_FULFILLMENT')
      return t('{0} earned this reward. Your turn to deliver it.', {
        '0': childName ?? t('Your Child'),
      });
    if (reward.status === 'AWAITING_CHILD_CONFIRMATION')
      return t('Waiting for {0} to confirm receipt.', {
        '0': childName ?? t('your Child'),
      });
    return t('{0} confirmed receiving this reward.', {
      '0': childName ?? t('Your Child'),
    });
  }
  if (reward.status === 'PENDING_FULFILLMENT')
    return t('You earned this reward. Waiting for your Parent to deliver it.');
  if (reward.status === 'AWAITING_CHILD_CONFIRMATION')
    return t(
      'Your Parent marked this reward as delivered. Confirm when you have received it.',
    );
  return t('You confirmed receiving this reward.');
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
  useAppLanguage();

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
      accessibilityLabel={t('Open reward: {0}{1}. {2}. {3} {4}', {
        '0': childName ? `${childName} · ` : '',
        '1': reward.terms.title,
        '2': rewardStatusLabel(reward.status, viewer),
        '3': rewardResponsibility(reward, viewer, childName),
        '4': new Date(date).toLocaleDateString(dateLocale()),
      })}
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
              ? t('Your turn')
              : t('Waiting for Parent delivery')
            : reward.status === 'AWAITING_CHILD_CONFIRMATION'
              ? viewer === 'PARENT'
                ? t('Waiting for Child confirmation')
                : t('Confirm when received')
              : viewer === 'PARENT'
                ? t('Receipt confirmed by Child')
                : t('Receipt confirmed by you')}
        </DesignText>
        <DesignText style={s.caption}>
          {reward.status === 'FULFILLED'
            ? t('Received')
            : reward.status === 'AWAITING_CHILD_CONFIRMATION'
              ? t('Delivered')
              : t('Earned')}{' '}
          {new Date(date).toLocaleDateString(dateLocale())}
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
  useAppLanguage();

  const steps = [
    {
      label: t('Earned'),
      detail: t('Contract approved'),
      date: reward.earnedAt,
    },
    {
      label: t('Delivered'),
      detail:
        reward.status === 'PENDING_FULFILLMENT'
          ? t('Waiting for Parent delivery')
          : t('Reported by Parent'),
      date:
        reward.status === 'PENDING_FULFILLMENT'
          ? undefined
          : reward.deliveredAt,
    },
    {
      label: t('Received'),
      detail:
        reward.status === 'FULFILLED'
          ? t('Confirmed by Child')
          : reward.status === 'PENDING_FULFILLMENT'
            ? t('Child confirmation follows delivery')
            : t('Waiting for Child confirmation'),
      date: reward.status === 'FULFILLED' ? reward.confirmedAt : undefined,
    },
  ];
  return (
    <View style={{ gap: homeTokens.spacing.medium }}>
      {steps.map((step) => (
        <View
          key={step.label}
          accessible
          accessibilityLabel={`${step.label}. ${step.detail}${step.date ? `. ${new Date(step.date).toLocaleString(dateLocale(), { dateStyle: 'short', timeStyle: 'short' })}` : t('. Not yet completed.')}`}
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
                {new Date(step.date).toLocaleString(dateLocale(), {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
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
