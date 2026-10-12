import {
  t,
  useAppLanguage,
  RewardPicker,
  homeTokens,
  DesignIcon,
  amberAuroraColors,
  amberAuroraPalette,
  Button,
  FormMessage,
  TextField,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { DraftSectionHeading } from './DraftSectionHeading';
import { DeadlinePicker } from './DeadlinePicker';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  parentCounterOfferInputSchema,
  offerValidationBounds,
  rewardTermsForSelection,
  type CounterOfferInput,
  type OfferRevision,
  type RewardType,
  type RewardSelection,
} from '@chorex/domain';

type ParentProposal = Extract<CounterOfferInput, { tasks: unknown }>;
type TaskEditor = { title: string; description: string; targetCount: string };

function localDeadline(value: string): { date: string; time: string } {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  return { date: local.slice(0, 10), time: local.slice(11) };
}

function parseLocalDeadline(date: string, time: string): string | undefined {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    return;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const value = new Date(year, month - 1, day, hour, minute);
  if (
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day ||
    value.getHours() !== hour ||
    value.getMinutes() !== minute
  )
    return;
  return value.toISOString();
}

export function ParentCounterofferForm({
  revision,
  busy,
  onCancel,
  onSubmit,
}: {
  revision: OfferRevision;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (proposal: ParentProposal) => Promise<void>;
}) {
  useAppLanguage();

  const dynamicType = useDynamicTypeStyles();
  const initialDeadline = localDeadline(revision.deadlineAt);
  const [tasks, setTasks] = useState<TaskEditor[]>(() =>
    revision.tasks.map((task) => ({
      title: task.title,
      description: task.description ?? '',
      targetCount: String(task.targetCount),
    })),
  );
  const [rewardSelection, setRewardSelection] = useState<RewardSelection>(() =>
    revision.reward.type === 'CUSTOM' ? 'custom' : revision.reward.iconKey,
  );
  const [rewardTitle, setRewardTitle] = useState(revision.reward.title);
  const [rewardDescription, setRewardDescription] = useState(
    revision.reward.description ?? '',
  );
  const [rewardType, setRewardType] = useState<RewardType>(
    revision.reward.type,
  );
  const [rewardIconKey, setRewardIconKey] = useState(revision.reward.iconKey);
  const [date, setDate] = useState(initialDeadline.date);
  const [time, setTime] = useState(initialDeadline.time);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();

  const updateTask = (
    index: number,
    field: keyof TaskEditor,
    value: string,
  ) => {
    setTasks((current) =>
      current.map((task, i) =>
        i === index ? { ...task, [field]: value } : task,
      ),
    );
  };
  const send = () => {
    if (busy) return;
    const deadlineAt =
      date === initialDeadline.date && time === initialDeadline.time
        ? revision.deadlineAt
        : parseLocalDeadline(date, time);
    if (!deadlineAt || Date.parse(deadlineAt) <= Date.now()) {
      setError(t('Enter a valid future local deadline.'));
      return;
    }
    if (tasks.some((task) => !/^\d+$/.test(task.targetCount))) {
      setError(t('Task target counts must be whole numbers.'));
      return;
    }
    const result = parentCounterOfferInputSchema.safeParse({
      offerId: revision.offerId,
      currentRevisionId: revision.id,
      tasks: tasks.map((task) => ({
        title: task.title,
        targetCount: Number(task.targetCount),
        ...(task.description.trim()
          ? { description: task.description.trim() }
          : {}),
      })),
      reward: {
        title: rewardTitle,
        type: rewardType,
        iconKey: rewardIconKey,
        ...(rewardDescription.trim()
          ? { description: rewardDescription.trim() }
          : {}),
      },
      deadlineAt,
      ...(note.trim() ? { note: note.trim() } : {}),
      // The inbox replaces this validation-only key with the retry-safe request key.
      idempotencyKey: 'parent-proposal-review',
    });
    if (!result.success) {
      setError(
        t(
          'Check task and reward titles, descriptions and target counts before reviewing.',
        ),
      );
      return;
    }
    setError(undefined);
    void onSubmit(result.data);
  };
  return (
    <View
      style={{
        gap: homeTokens.spacing.medium,
        marginTop: homeTokens.spacing.section,
      }}
    >
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        className="font-bold text-home-text"
        style={dynamicType.body}
      >
        {t('Edit counteroffer terms')}
      </Text>
      <Text
        allowFontScaling={false}
        className="text-home-muted"
        style={dynamicType.small}
      >
        {t('Your changes become a new proposal for the Child to review.')}
      </Text>
      <FormMessage message={error} />
      <DraftSectionHeading tone="blue">
        {t('Choose reward')}
      </DraftSectionHeading>
      <RewardPicker
        prominent
        value={rewardSelection}
        disabled={busy}
        onChange={(selection) => {
          if (selection === rewardSelection) return;
          setRewardSelection(selection);
          const reward = rewardTermsForSelection(selection);
          setRewardTitle(t(reward.title));
          setRewardType(reward.type);
          setRewardIconKey(reward.iconKey);
        }}
      />
      {rewardSelection === 'custom' ? (
        <TextField
          label={t('Reward title')}
          value={rewardTitle}
          editable={!busy}
          maxLength={offerValidationBounds.titleMaxLength}
          onChangeText={setRewardTitle}
        />
      ) : null}
      <TextField
        required={false}
        label={t('Reward description (optional)')}
        value={rewardDescription}
        editable={!busy}
        multiline
        numberOfLines={2}
        maxLength={offerValidationBounds.descriptionMaxLength}
        onChangeText={setRewardDescription}
      />
      <DraftSectionHeading tone="lavender">{t('Tasks')}</DraftSectionHeading>
      {tasks.map((task, index) => (
        <View key={index} style={{ gap: homeTokens.spacing.small }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: homeTokens.spacing.small,
            }}
          >
            <View style={{ flex: 1 }}>
              <TextField
                hideLabel
                placeholder={t('Task')}
                label={t('Task {0} title', { '0': index + 1 })}
                value={task.title}
                editable={!busy}
                maxLength={offerValidationBounds.titleMaxLength}
                onChangeText={(value) => updateTask(index, 'title', value)}
              />
            </View>
            <Text style={{ fontSize: 24, color: homeTokens.secondary }}>×</Text>
            <View style={{ width: 72 }}>
              <TextField
                hideLabel
                label={t('Task {0} target count', { '0': index + 1 })}
                value={task.targetCount}
                editable={!busy}
                keyboardType="number-pad"
                onChangeText={(value) =>
                  updateTask(index, 'targetCount', value)
                }
              />
            </View>
            {tasks.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Remove task {0}', {
                  '0': index + 1,
                })}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() =>
                  setTasks((current) => current.filter((_, i) => i !== index))
                }
                style={{
                  width: 48,
                  height: 48,
                  flexShrink: 0,
                  borderRadius: homeTokens.radius.pill,
                  backgroundColor: amberAuroraColors.danger,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <DesignIcon
                  accessible={false}
                  name="trash-outline"
                  size={22}
                  color={amberAuroraPalette.paper}
                />
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
      {tasks.length < offerValidationBounds.taskCountMax ? (
        <Button
          label={t('Add task')}
          variant="outline"
          disabled={busy}
          onPress={() =>
            setTasks((current) => [
              ...current,
              { title: '', description: '', targetCount: '1' },
            ])
          }
        />
      ) : null}
      <DraftSectionHeading tone="mint">{t('Deadline')}</DraftSectionHeading>
      <DeadlinePicker
        compact
        date={date}
        time={time}
        disabled={busy}
        onChange={({ date, time }) => {
          setDate(date);
          setTime(time);
        }}
      />
      <TextField
        required={false}
        label={t('Proposal note (optional)')}
        value={note}
        editable={!busy}
        multiline
        numberOfLines={2}
        maxLength={offerValidationBounds.descriptionMaxLength}
        onChangeText={setNote}
      />
      <View style={{ marginTop: homeTokens.spacing.medium }}>
        <Button
          variant="blue"
          lightText
          label={t('Send')}
          loading={busy}
          onPress={send}
        />
      </View>
      <Button
        label={t('Cancel')}
        variant="outline"
        disabled={busy}
        onPress={onCancel}
      />
    </View>
  );
}
