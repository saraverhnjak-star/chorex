import { t, useAppLanguage, dateLocale } from './localization';
import { HomeFeatureCard } from './HomeFeatureCard';
import { amberAuroraPalette } from './theme';
import { RewardIcon } from './RewardIcon';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { OfferRevision } from '@chorex/domain';
import { DesignText, homeTokens } from './Home';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
export function SurfaceCard({ children }: { children: ReactNode }) {
  return <View style={styles.surface}>{children}</View>;
}
export function TermsHeading({
  children,
  icon,
}: {
  children: ReactNode;
  icon: Icon;
}) {
  return (
    <View style={styles.heading}>
      <Ionicons
        accessible={false}
        name={icon}
        size={20}
        color={homeTokens.secondary}
      />
      <DesignText accessibilityRole="header" style={styles.title}>
        {children}
      </DesignText>
    </View>
  );
}
export function ChoiceChip({
  label,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className="active:opacity-70"
      style={[
        styles.choice,
        {
          backgroundColor: selected
            ? homeTokens.coralSurface
            : homeTokens.surface,
          borderColor: selected ? homeTokens.coral : homeTokens.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <DesignText style={styles.choiceText}>
        {selected ? '✓ ' : ''}
        {label}
      </DesignText>
    </Pressable>
  );
}
export function ProposalTerms({
  revision,
  status,
  author,
  support,
  layout = 'standard',
  cardHeader = false,
  participantName,
}: {
  revision: Pick<OfferRevision, 'tasks' | 'reward' | 'deadlineAt' | 'note'> &
    Partial<Pick<OfferRevision, 'revisionNumber'>>;
  status?: string;
  author?: string;
  support?: string;
  layout?: 'standard' | 'rewardFirst';
  cardHeader?: boolean;
  participantName?: string;
}) {
  useAppLanguage();

  return (
    <View style={styles.terms}>
      {cardHeader ? (
        <>
          <HomeFeatureCard
            tone="coralSurface"
            badge={status}
            title={revision.reward.title}
            reward={revision.reward}
            detail={
              (participantName ? `${participantName} · ` : '') +
              t('Deadline: {0}', {
                '0': new Date(revision.deadlineAt).toLocaleString(
                  dateLocale(),
                  {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  },
                ),
              })
            }
          />
          {revision.reward.description ? (
            <DesignText
              style={{
                fontSize: 20,
                lineHeight: 28,
                color: homeTokens.text,
                marginTop: homeTokens.spacing.medium,
              }}
            >
              {revision.reward.description}
            </DesignText>
          ) : null}
        </>
      ) : layout === 'rewardFirst' ? (
        <View style={{ gap: homeTokens.spacing.medium }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: homeTokens.spacing.medium,
            }}
          >
            <RewardIcon terms={revision.reward} size={88} />
            <View style={{ flex: 1, gap: homeTokens.spacing.small }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: homeTokens.spacing.small,
                }}
              >
                <DesignText
                  accessibilityRole="header"
                  style={styles.rewardTitle}
                >
                  {revision.reward.title}
                </DesignText>
                {revision.revisionNumber !== undefined ? (
                  <DesignText style={styles.revisionPill}>
                    {t('Revision {0}', { '0': revision.revisionNumber })}
                  </DesignText>
                ) : null}
              </View>
              <DesignText style={styles.secondary}>
                {t(revision.reward.type)}
              </DesignText>
            </View>
          </View>
          {revision.reward.description ? (
            <DesignText style={styles.secondary}>
              {revision.reward.description}
            </DesignText>
          ) : null}
        </View>
      ) : null}
      {status && !cardHeader ? (
        <View style={styles.status}>
          <Ionicons
            accessible={false}
            name="chatbubbles-outline"
            size={22}
            color={homeTokens.coral}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <DesignText style={styles.title}>{status}</DesignText>
            {support ? (
              <DesignText style={styles.secondary}>{support}</DesignText>
            ) : null}
          </View>
        </View>
      ) : null}
      {layout === 'standard' ? (
        <>
          <DesignText accessibilityRole="header" style={styles.title}>
            {t('Proposal · {0}', { '0': revision.reward.title })}
          </DesignText>
          {author ? (
            <DesignText style={styles.secondary}>{author}</DesignText>
          ) : null}
          <DesignText accessibilityRole="header" style={styles.title}>
            {revision.revisionNumber
              ? t('Current proposal · Revision {0}', {
                  '0': revision.revisionNumber,
                })
              : t('Proposed terms')}
          </DesignText>
        </>
      ) : author && !cardHeader ? (
        <DesignText style={styles.secondary}>{author}</DesignText>
      ) : null}
      {!cardHeader ? (
        <DesignText style={styles.caption}>
          {t('These terms form the agreement if accepted.')}
        </DesignText>
      ) : null}
      {layout === 'standard' ? (
        <TermsHeading icon="checkbox-outline">{t('Tasks')}</TermsHeading>
      ) : null}
      <View
        style={{
          gap: homeTokens.spacing.medium,
          marginTop: layout === 'rewardFirst' ? homeTokens.spacing.medium : 0,
        }}
      >
        {revision.tasks.map((task, index) => (
          <View key={index} style={styles.task}>
            {!cardHeader ? (
              <View
                style={[
                  styles.icon,
                  layout === 'rewardFirst' ? styles.largeTaskIcon : undefined,
                  cardHeader ? { backgroundColor: homeTokens.blue } : undefined,
                ]}
              >
                <Ionicons
                  accessible={false}
                  name={cardHeader ? 'checkbox-outline' : 'checkmark-outline'}
                  size={layout === 'rewardFirst' ? 26 : 18}
                  color={
                    cardHeader
                      ? amberAuroraPalette.auroraBlue
                      : homeTokens.success
                  }
                />
              </View>
            ) : null}
            <View style={{ flex: 1, gap: 4 }}>
              <DesignText
                style={[styles.body, cardHeader ? { fontSize: 22 } : undefined]}
              >
                {layout === 'rewardFirst'
                  ? task.title
                  : `${task.title} · ${task.targetCount}×`}
              </DesignText>
              {!cardHeader &&
              layout === 'rewardFirst' &&
              task.targetCount > 1 ? (
                <DesignText style={styles.caption}>
                  {t('Agreed number of repetitions')}
                </DesignText>
              ) : null}
              {task.description ? (
                <DesignText style={styles.secondary}>
                  {task.description}
                </DesignText>
              ) : null}
            </View>
            {layout === 'rewardFirst' ? (
              <DesignText
                accessibilityLabel={t('{0} repetitions', {
                  '0': task.targetCount,
                })}
                style={styles.repetitionsPill}
              >
                {task.targetCount}×
              </DesignText>
            ) : null}
          </View>
        ))}
      </View>
      {layout === 'standard' ? (
        <>
          <TermsHeading icon="gift-outline">{t('Reward')}</TermsHeading>
          <View
            style={[
              styles.reward,
              { flexDirection: 'row', alignItems: 'center', gap: 12 },
            ]}
          >
            <RewardIcon terms={revision.reward} size={40} />
            <View style={{ flex: 1, gap: 4 }}>
              <DesignText style={styles.body}>
                {revision.reward.title} · {t(revision.reward.type)}
              </DesignText>
              {revision.reward.description ? (
                <DesignText style={styles.secondary}>
                  {revision.reward.description}
                </DesignText>
              ) : null}
            </View>
          </View>
        </>
      ) : null}
      {cardHeader ? null : layout === 'rewardFirst' ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: homeTokens.spacing.medium,
          }}
        >
          <View style={styles.deadlineIcon}>
            <Ionicons
              accessible={false}
              name="calendar-outline"
              size={28}
              color={homeTokens.coral}
            />
          </View>
          <DesignText
            accessibilityLabel={t('Deadline: {0}', {
              '0': new Date(revision.deadlineAt).toLocaleString(dateLocale(), {
                dateStyle: 'short',
                timeStyle: 'short',
              }),
            })}
            style={[styles.body, { flex: 1 }]}
          >
            {new Date(revision.deadlineAt).toLocaleString(dateLocale(), {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </DesignText>
        </View>
      ) : (
        <>
          <TermsHeading icon="calendar-outline">{t('Deadline')}</TermsHeading>
          <DesignText style={styles.body}>
            {t('Deadline: {0}', {
              '0': new Date(revision.deadlineAt).toLocaleString(dateLocale(), {
                dateStyle: 'short',
                timeStyle: 'short',
              }),
            })}
          </DesignText>
        </>
      )}
      {revision.note ? (
        <View
          style={{
            backgroundColor: homeTokens.mint,
            marginTop: homeTokens.spacing.medium,
            borderRadius: homeTokens.radius.card,
            padding: homeTokens.spacing.medium,
            gap: homeTokens.spacing.small,
          }}
        >
          <DesignText accessibilityRole="header" style={styles.title}>
            {t('Proposal note')}
          </DesignText>
          <DesignText style={styles.secondary}>{revision.note}</DesignText>
        </View>
      ) : null}
    </View>
  );
}
export function OfferOutcome({
  title,
  children,
  success = false,
  centered = false,
  illustration,
  showIcon = true,
}: {
  title: string;
  children?: ReactNode;
  success?: boolean;
  centered?: boolean;
  showIcon?: boolean;
  illustration?: 'no-offers' | 'no-chores' | 'no-rewards' | 'no-activities';
}) {
  if (centered && (success || illustration))
    return (
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          gap: homeTokens.spacing.medium,
          paddingVertical: homeTokens.spacing.section,
        }}
      >
        {showIcon ? (
          <Image
            accessible={false}
            source={
              illustration === 'no-offers'
                ? require('../assets/icons/no_offers.png')
                : illustration === 'no-chores'
                  ? require('../assets/icons/no_chores.png')
                  : illustration === 'no-rewards'
                    ? require('../assets/icons/no_rewards.png')
                    : illustration === 'no-activities'
                      ? require('../assets/icons/no_activities.png')
                      : require('../assets/icons/success.png')
            }
            style={{ width: 180, height: 180 }}
            resizeMode="contain"
          />
        ) : null}
        <DesignText
          accessibilityRole="header"
          style={{
            fontSize: 26,
            fontWeight: '700',
            color: homeTokens.text,
            textAlign: 'center',
          }}
        >
          {title}
        </DesignText>
        {children ? (
          <DesignText style={[styles.secondary, { textAlign: 'center' }]}>
            {children}
          </DesignText>
        ) : null}
      </View>
    );
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.status,
        { backgroundColor: success ? homeTokens.mint : homeTokens.lavender },
      ]}
    >
      {showIcon ? (
        <Ionicons
          accessible={false}
          name={success ? 'checkmark-circle-outline' : 'chatbubble-outline'}
          size={24}
          color={success ? homeTokens.success : homeTokens.secondary}
        />
      ) : null}
      <View style={{ flex: 1, gap: 4 }}>
        <DesignText style={styles.title}>{title}</DesignText>
        {children ? (
          <DesignText style={styles.secondary}>{children}</DesignText>
        ) : null}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  surface: {
    padding: homeTokens.spacing.card,
    borderRadius: homeTokens.radius.card,
    borderWidth: 1,
    borderColor: homeTokens.border,
    backgroundColor: homeTokens.surface,
    gap: homeTokens.spacing.medium,
  },
  terms: { gap: 12 },
  heading: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  title: { fontSize: 16, fontWeight: '600', color: homeTokens.text },
  body: { fontSize: 15, color: homeTokens.text },
  secondary: { fontSize: 14, color: homeTokens.secondary },
  caption: { fontSize: 12, color: homeTokens.secondary },
  task: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: homeTokens.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeTaskIcon: { width: 44, height: 44, borderRadius: 22 },
  repetitionsPill: {
    fontSize: 28,
    fontWeight: '600',
    color: amberAuroraPalette.auroraBlue,
  },
  deadlineIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: homeTokens.coralSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: homeTokens.text,
    flexGrow: 1,
    flexShrink: 1,
  },
  revisionPill: {
    fontSize: 12,
    fontWeight: '600',
    color: homeTokens.secondary,
    backgroundColor: homeTokens.lavender,
    borderRadius: homeTokens.radius.pill,
    paddingHorizontal: homeTokens.spacing.medium,
    paddingVertical: homeTokens.spacing.small,
    overflow: 'hidden',
    marginLeft: 'auto',
  },
  reward: {
    gap: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: homeTokens.app,
  },
  status: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: homeTokens.coralSurface,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceText: { fontSize: 14, color: homeTokens.text },
});
