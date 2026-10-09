import { RewardIcon } from './RewardIcon';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
}: {
  revision: Pick<OfferRevision, 'tasks' | 'reward' | 'deadlineAt' | 'note'> &
    Partial<Pick<OfferRevision, 'revisionNumber'>>;
  status?: string;
  author?: string;
  support?: string;
}) {
  return (
    <View style={styles.terms}>
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
      <DesignText style={styles.caption}>
        These terms form the agreement if accepted.
      </DesignText>
      <TermsHeading icon="checkbox-outline">Tasks</TermsHeading>
      {revision.tasks.map((task, index) => (
        <View key={index} style={styles.task}>
          <View style={styles.icon}>
            <Ionicons
              accessible={false}
              name="checkmark-outline"
              size={18}
              color={homeTokens.success}
            />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <DesignText style={styles.body}>
              {task.title} · {task.targetCount}×
            </DesignText>
            {task.description ? (
              <DesignText style={styles.secondary}>
                {task.description}
              </DesignText>
            ) : null}
          </View>
        </View>
      ))}
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
      <TermsHeading icon="calendar-outline">Deadline</TermsHeading>
      <DesignText style={styles.body}>
        Deadline: {new Date(revision.deadlineAt).toLocaleString()}
      </DesignText>
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
}: {
  title: string;
  children?: ReactNode;
  success?: boolean;
}) {
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
