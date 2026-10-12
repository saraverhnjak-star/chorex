import { t, useAppLanguage, dateLocale } from './localization';
import { amberAuroraPalette } from './theme';
import { RewardIcon } from './RewardIcon';
import { View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Contract, ContractTask, UserProfile } from '@chorex/domain';
import { DesignText, homeTokens } from './Home';
import { HomeFeatureCard } from './HomeFeatureCard';

export function contractStatusLabel(
  status: Contract['status'],
  viewer: UserProfile['accountType'],
) {
  switch (status) {
    case 'ACTIVE':
      return t('In progress');
    case 'READY_FOR_REVIEW':
      return viewer === 'CHILD' ? t("Parent's turn") : t('Ready for review');
    case 'CHANGES_REQUESTED':
      return viewer === 'CHILD' ? t('Your turn') : t('Kids turn');
    case 'APPROVED':
      return t('Approved');
    case 'CANCELLED':
      return t('Cancelled');
    case 'EXPIRED':
      return t('Expired');
  }
}
/** Factual presentation only. Submission eligibility stays in the existing action. */
export function ContractSummary({
  contract,
  tasks,
  viewer,
  participantName,
  isParticipant = true,
  cardHeader = false,
}: {
  contract: Contract;
  tasks: readonly ContractTask[];
  viewer: UserProfile['accountType'];
  participantName?: string;
  isParticipant?: boolean;
  cardHeader?: boolean;
}) {
  useAppLanguage();

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
        ? t(
            'Your turn · Complete the agreed tasks, then submit for Parent review.',
          )
        : status === 'READY_FOR_REVIEW'
          ? t(
              'Waiting for parent review. Your submitted tasks remain visible below.',
            )
          : status === 'CHANGES_REQUESTED'
            ? t(
                'Your turn · Address the feedback, then resubmit. Your recorded progress is preserved.',
              )
            : status === 'APPROVED'
              ? t(
                  'Your Parent approved this agreement. Your reward is earned. Check Rewards for delivery and receipt details.',
                )
              : undefined
      : status === 'ACTIVE'
        ? t('{0} is working on this agreement.', {
            '0': participantName ?? t('Your Child'),
          })
        : status === 'READY_FOR_REVIEW'
          ? t(
              'Your review · Check the agreed work, then approve or request changes.',
            )
          : status === 'CHANGES_REQUESTED'
            ? t('Waiting for {0} to address feedback and resubmit.', {
                '0': participantName ?? t('your Child'),
              })
            : undefined;
  const completeTasks = tasks.filter(
    (task) => task.completedCount === task.targetCount,
  ).length;
  const completed = tasks.reduce((sum, task) => sum + task.completedCount, 0);
  const required = tasks.reduce((sum, task) => sum + task.targetCount, 0);
  if (cardHeader)
    return (
      <View style={{ gap: homeTokens.spacing.medium }}>
        <HomeFeatureCard
          tone="blue"
          titleAccessibilityLabel={t('Promised reward: {0}, {1}', {
            '0': contract.rewardTerms.title,
            '1': t(contract.rewardTerms.type),
          })}
          badgeAccessibilityLabel={t('Contract status: {0}', {
            '0': contractStatusLabel(status, viewer),
          })}
          detailAccessibilityLabel={t('Deadline: {0}', {
            '0': new Date(contract.deadlineAt).toLocaleString(dateLocale(), {
              dateStyle: 'short',
              timeStyle: 'short',
            }),
          })}
          badge={
            viewer === 'PARENT' && status === 'READY_FOR_REVIEW'
              ? t('Your turn')
              : contractStatusLabel(status, viewer)
          }
          title={contract.rewardTerms.title}
          reward={contract.rewardTerms}
          detail={t('Due {0}{1}', {
            '0': new Date(contract.deadlineAt).toLocaleString(dateLocale(), {
              dateStyle: 'short',
              timeStyle: 'short',
            }),
            '1':
              viewer === 'PARENT' && participantName
                ? ` · ${participantName}`
                : '',
          })}
        >
          <CompletionBar
            tone="blue"
            completed={completed}
            required={required}
            height={14}
            backgroundColor={homeTokens.surface}
          />
        </HomeFeatureCard>
        {contract.rewardTerms.description ? (
          <DesignText
            style={[
              s.body,
              {
                fontSize: 20,
                lineHeight: 28,
                marginTop: homeTokens.spacing.medium,
              },
            ]}
          >
            {contract.rewardTerms.description}
          </DesignText>
        ) : null}
        {status === 'APPROVED' && responsibility && isParticipant ? (
          <DesignText style={s.body}>{responsibility}</DesignText>
        ) : null}
        {contract.approvedAt ? (
          <DesignText style={s.caption}>
            {t('Approved: {0}', {
              '0': new Date(contract.approvedAt).toLocaleString(dateLocale(), {
                dateStyle: 'short',
                timeStyle: 'short',
              }),
            })}
          </DesignText>
        ) : null}
      </View>
    );
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
            accessibilityLabel={t('Promised reward: {0}, {1}', {
              '0': contract.rewardTerms.title,
              '1': t(contract.rewardTerms.type),
            })}
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
              accessibilityLabel={t('Contract status: {0}', {
                '0': contractStatusLabel(status, viewer),
              })}
              style={s.title}
            >
              {contractStatusLabel(status, viewer)}
            </DesignText>
          </View>
        </View>
      </View>
      {viewer === 'PARENT' && participantName ? (
        <DesignText style={s.body}>
          {t('Agreement with {0}', { '0': participantName })}
        </DesignText>
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
          accessibilityLabel={t('Deadline: {0}', {
            '0': new Date(contract.deadlineAt).toLocaleString(dateLocale(), {
              dateStyle: 'short',
              timeStyle: 'short',
            }),
          })}
          style={[s.body, { flex: 1 }]}
        >
          {new Date(contract.deadlineAt).toLocaleString(dateLocale(), {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </DesignText>
      </View>
      {contract.approvedAt ? (
        <DesignText style={s.caption}>
          {t('Approved: {0}', {
            '0': new Date(contract.approvedAt).toLocaleString(dateLocale(), {
              dateStyle: 'short',
              timeStyle: 'short',
            }),
          })}
        </DesignText>
      ) : null}
      {tasks.length > 1 ? (
        <View style={{ gap: homeTokens.spacing.small }}>
          <DesignText style={s.title}>
            {t('{0} of {1} tasks complete', {
              '0': completeTasks,
              '1': tasks.length,
            })}
          </DesignText>
          <CompletionBar
            completed={completed}
            required={required}
            decorative
            tone="blue"
          />
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
  height = 6,
  backgroundColor,
}: {
  completed: number;
  required: number;
  decorative?: boolean;
  tone?: 'green' | 'blue';
  height?: number;
  backgroundColor?: string;
}) {
  useAppLanguage();

  return (
    <View
      accessible={!decorative}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      accessibilityRole="progressbar"
      accessibilityLabel={t('Recorded completions')}
      accessibilityValue={{
        min: 0,
        max: required,
        now: completed,
        text: t('{0} of {1} completions recorded', {
          '0': completed,
          '1': required,
        }),
      }}
      style={[
        s.track,
        { height },
        backgroundColor ? { backgroundColor } : undefined,
      ]}
    >
      <View
        style={[
          s.fill,
          { height },
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
