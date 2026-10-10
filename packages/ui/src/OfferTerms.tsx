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
}: {
  revision: Pick<OfferRevision, 'tasks' | 'reward' | 'deadlineAt' | 'note'> &
    Partial<Pick<OfferRevision, 'revisionNumber'>>;
  status?: string;
  author?: string;
  support?: string;
  layout?: 'standard' | 'rewardFirst';
}) {
  return (
    <View style={styles.terms}>
      {layout === 'rewardFirst' ? (
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
                    Revision {revision.revisionNumber}
                  </DesignText>
                ) : null}
              </View>
              <DesignText style={styles.secondary}>
                {revision.reward.type}
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
      {status ? (
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
            Proposal · {revision.reward.title}
          </DesignText>
          {author ? (
            <DesignText style={styles.secondary}>{author}</DesignText>
          ) : null}
          <DesignText accessibilityRole="header" style={styles.title}>
            {revision.revisionNumber
              ? `Current proposal · Revision ${revision.revisionNumber}`
              : 'Proposed terms'}
          </DesignText>
        </>
      ) : author ? (
        <DesignText style={styles.secondary}>{author}</DesignText>
      ) : null}
      <DesignText style={styles.caption}>
        These terms form the agreement if accepted.
      </DesignText>
      {layout === 'standard' ? (
        <TermsHeading icon="checkbox-outline">Tasks</TermsHeading>
      ) : null}
      <View
        style={{
          gap: homeTokens.spacing.medium,
          marginTop: layout === 'rewardFirst' ? homeTokens.spacing.medium : 0,
        }}
      >
        {revision.tasks.map((task, index) => (
          <View key={index} style={styles.task}>
            <View
              style={[
                styles.icon,
                layout === 'rewardFirst' ? styles.largeTaskIcon : undefined,
              ]}
            >
              <Ionicons
                accessible={false}
                name="checkmark-outline"
                size={layout === 'rewardFirst' ? 26 : 18}
                color={homeTokens.success}
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <DesignText style={styles.body}>
                {layout === 'rewardFirst'
                  ? task.title
                  : `${task.title} · ${task.targetCount}×`}
              </DesignText>
              {layout === 'rewardFirst' && task.targetCount > 1 ? (
                <DesignText style={styles.caption}>
                  Dogovorjeno število ponovitev
                </DesignText>
              ) : null}
              {task.description ? (
                <DesignText style={styles.secondary}>
                  {task.description}
                </DesignText>
              ) : null}
            </View>
            {layout === 'rewardFirst' && task.targetCount > 1 ? (
              <DesignText
                accessibilityLabel={`${task.targetCount} repetitions`}
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
          <TermsHeading icon="gift-outline">Reward</TermsHeading>
          <View
            style={[
              styles.reward,
              { flexDirection: 'row', alignItems: 'center', gap: 12 },
            ]}
          >
            <RewardIcon terms={revision.reward} size={40} />
            <View style={{ flex: 1, gap: 4 }}>
              <DesignText style={styles.body}>
                {revision.reward.title} · {revision.reward.type}
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
      {layout === 'rewardFirst' ? (
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
            accessibilityLabel={`Deadline: ${new Date(revision.deadlineAt).toLocaleString()}`}
            style={[styles.body, { flex: 1 }]}
          >
            {new Date(revision.deadlineAt).toLocaleString()}
          </DesignText>
        </View>
      ) : (
        <>
          <TermsHeading icon="calendar-outline">Deadline</TermsHeading>
          <DesignText style={styles.body}>
            Deadline: {new Date(revision.deadlineAt).toLocaleString()}
          </DesignText>
        </>
      )}
      {revision.note ? (
        <>
          <TermsHeading icon="chatbox-outline">Proposal note</TermsHeading>
          <DesignText style={styles.secondary}>{revision.note}</DesignText>
        </>
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
}: {
  title: string;
  children?: ReactNode;
  success?: boolean;
  centered?: boolean;
  illustration?: 'no-offers' | 'no-chores' | 'no-rewards';
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
        <Image
          accessible={false}
          source={
            illustration === 'no-offers'
              ? require('../assets/icons/no_offers.png')
              : illustration === 'no-chores'
                ? require('../assets/icons/no_chores.png')
                : illustration === 'no-rewards'
                  ? require('../assets/icons/no_rewards.png')
                  : require('../assets/icons/success.png')
          }
          style={{ width: 180, height: 180 }}
          resizeMode="contain"
        />
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
      <Ionicons
        accessible={false}
        name={success ? 'checkmark-circle-outline' : 'chatbubble-outline'}
        size={24}
        color={success ? homeTokens.success : homeTokens.secondary}
      />
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
  task: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
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
    fontSize: 14,
    fontWeight: '600',
    color: homeTokens.secondary,
    backgroundColor: homeTokens.blue,
    borderRadius: homeTokens.radius.pill,
    paddingHorizontal: homeTokens.spacing.medium,
    paddingVertical: homeTokens.spacing.small,
    overflow: 'hidden',
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
