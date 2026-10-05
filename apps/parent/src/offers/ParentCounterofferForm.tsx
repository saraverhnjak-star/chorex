import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  parentCounterOfferInputSchema,
  offerValidationBounds,
  rewardTypeSchema,
  type CounterOfferInput,
  type OfferRevision,
  type RewardType,
} from '@chorex/domain';
import {
  Button,
  FormMessage,
  TextField,
  useDynamicTypeStyles,
} from '@chorex/ui';

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
  const dynamicType = useDynamicTypeStyles();
  const initialDeadline = localDeadline(revision.deadlineAt);
  const [tasks, setTasks] = useState<TaskEditor[]>(() =>
    revision.tasks.map((task) => ({
      title: task.title,
      description: task.description ?? '',
      targetCount: String(task.targetCount),
    })),
  );
  const [rewardTitle, setRewardTitle] = useState(revision.reward.title);
  const [rewardDescription, setRewardDescription] = useState(
    revision.reward.description ?? '',
  );
  const [rewardType, setRewardType] = useState<RewardType>(
    revision.reward.type,
  );
  const [date, setDate] = useState(initialDeadline.date);
  const [time, setTime] = useState(initialDeadline.time);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [proposal, setProposal] = useState<ParentProposal>();

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
  const review = () => {
    const deadlineAt =
      date === initialDeadline.date && time === initialDeadline.time
        ? revision.deadlineAt
        : parseLocalDeadline(date, time);
    if (!deadlineAt || Date.parse(deadlineAt) <= Date.now()) {
      setError('Enter a valid future local deadline.');
      return;
    }
    if (tasks.some((task) => !/^\d+$/.test(task.targetCount))) {
      setError('Task target counts must be whole numbers.');
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
        'Check task and reward titles, descriptions and target counts before reviewing.',
      );
      return;
    }
    setError(undefined);
    setProposal(result.data);
  };
  const text = (value: string) => (
    <Text
      allowFontScaling={false}
      className="text-text"
      style={dynamicType.body}
    >
      {value}
    </Text>
  );
  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        className="font-bold text-text"
        style={dynamicType.body}
      >
        {proposal ? 'Review your counteroffer' : 'Edit counteroffer terms'}
      </Text>
      <FormMessage message={error} />
      {proposal ? (
        <>
          {proposal.tasks.map((task, index) => (
            <View key={index} className="gap-1">
              {text(`${task.title} · ${task.targetCount}×`)}
              {task.description ? text(task.description) : null}
            </View>
          ))}
          {text(`Reward: ${proposal.reward.title} · ${proposal.reward.type}`)}
          {proposal.reward.description
            ? text(proposal.reward.description)
            : null}
          {text(`Deadline: ${new Date(proposal.deadlineAt).toLocaleString()}`)}
          {proposal.note ? text(`Note: ${proposal.note}`) : null}
          {text('The child will need to agree to this new proposal.')}
          <Button
            label="Send counteroffer"
            loading={busy}
            onPress={() => void onSubmit(proposal)}
          />
          <Button
            label="Edit proposal"
            variant="secondary"
            disabled={busy}
            onPress={() => setProposal(undefined)}
          />
        </>
      ) : (
        <>
          {tasks.map((task, index) => (
            <View key={index} className="gap-3">
              <TextField
                label={`Task ${index + 1} title`}
                value={task.title}
                editable={!busy}
                maxLength={offerValidationBounds.titleMaxLength}
                onChangeText={(value) => updateTask(index, 'title', value)}
              />
              <TextField
                label={`Task ${index + 1} description (optional)`}
                value={task.description}
                editable={!busy}
                multiline
                maxLength={offerValidationBounds.descriptionMaxLength}
                onChangeText={(value) =>
                  updateTask(index, 'description', value)
                }
              />
              <TextField
                label={`Task ${index + 1} target count`}
                value={task.targetCount}
                editable={!busy}
                keyboardType="number-pad"
                onChangeText={(value) =>
                  updateTask(index, 'targetCount', value)
                }
              />
              {tasks.length > 1 ? (
                <Button
                  label={`Remove task ${index + 1}`}
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    setTasks((current) => current.filter((_, i) => i !== index))
                  }
                />
              ) : null}
            </View>
          ))}
          {tasks.length < offerValidationBounds.taskCountMax ? (
            <Button
              label="Add task"
              variant="secondary"
              disabled={busy}
              onPress={() =>
                setTasks((current) => [
                  ...current,
                  { title: '', description: '', targetCount: '1' },
                ])
              }
            />
          ) : null}
          <TextField
            label="Reward title"
            value={rewardTitle}
            editable={!busy}
            maxLength={offerValidationBounds.titleMaxLength}
            onChangeText={setRewardTitle}
          />
          <TextField
            label="Reward description (optional)"
            value={rewardDescription}
            editable={!busy}
            multiline
            maxLength={offerValidationBounds.descriptionMaxLength}
            onChangeText={setRewardDescription}
          />
          {rewardTypeSchema.options.map((type) => (
            <Button
              key={type}
              label={`${rewardType === type ? 'Selected' : 'Select'} ${type.toLowerCase()}`}
              variant={rewardType === type ? 'primary' : 'secondary'}
              disabled={busy}
              onPress={() => setRewardType(type)}
            />
          ))}
          <TextField
            label="Deadline date (YYYY-MM-DD)"
            value={date}
            editable={!busy}
            autoCapitalize="none"
            onChangeText={setDate}
          />
          <TextField
            label="Deadline time (local, HH:mm)"
            value={time}
            editable={!busy}
            autoCapitalize="none"
            onChangeText={setTime}
          />
          <TextField
            label="Proposal note (optional)"
            value={note}
            editable={!busy}
            multiline
            maxLength={offerValidationBounds.descriptionMaxLength}
            onChangeText={setNote}
          />
          <Button
            label="Review counteroffer"
            disabled={busy}
            onPress={review}
          />
        </>
      )}
      <Button
        label="Cancel counteroffer"
        variant="secondary"
        disabled={busy}
        onPress={onCancel}
      />
    </View>
  );
}
