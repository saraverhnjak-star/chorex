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
  SurfaceCard,
  ProposalTerms,
  ChoiceChip,
  TermsHeading,
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
  return (
    <SurfaceCard>
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        className="font-bold text-home-text"
        style={dynamicType.body}
      >
        {proposal ? 'Review your counteroffer' : 'Edit counteroffer terms'}
      </Text>
      <Text className="text-home-muted" style={dynamicType.small}>
        Your changes become a new proposal for the Child to review.
      </Text>
      <FormMessage message={error} />
      {proposal ? (
        <>
          <ProposalTerms revision={proposal} author="Your new proposal" />
          <Text className="text-home-muted" style={dynamicType.body}>
            The child will need to agree to this new proposal.
          </Text>
          <Button
            label="Send counteroffer"
            loading={busy}
            onPress={() => void onSubmit(proposal)}
          />
          <Button
            label="Edit proposal"
            variant="outline"
            disabled={busy}
            onPress={() => setProposal(undefined)}
          />
        </>
      ) : (
        <>
          <TermsHeading icon="checkbox-outline">Tasks</TermsHeading>
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
                  variant="outline"
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
          <TermsHeading icon="gift-outline">Reward</TermsHeading>
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
          <View className="flex-row flex-wrap gap-2">
            {rewardTypeSchema.options.map((type) => (
              <ChoiceChip
                key={type}
                label={`${rewardType === type ? 'Selected' : 'Select'} ${type.toLowerCase()}`}
                selected={rewardType === type}
                disabled={busy}
                onPress={() => setRewardType(type)}
              />
            ))}
          </View>
          <TermsHeading icon="calendar-outline">Deadline</TermsHeading>
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
          <TermsHeading icon="chatbox-outline">Optional note</TermsHeading>
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
        variant="outline"
        disabled={busy}
        onPress={onCancel}
      />
    </SurfaceCard>
  );
}
