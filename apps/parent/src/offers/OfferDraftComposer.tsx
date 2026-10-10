import { DeadlinePicker } from './DeadlinePicker';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  createOfferDraft,
  publishOffer,
  type ParentFamilyHome,
} from '@chorex/firebase-client';
import {
  offerValidationBounds,
  rewardTypeSchema,
  rewardIconKeySchema,
  rewardTypeDefaultIcons,
  rewardPresets,
  rewardTermsForSelection,
  type RewardSelection,
  type CreateOfferDraftOutput,
  type PublishOfferOutput,
} from '@chorex/domain';
import {
  RewardPicker,
  SurfaceCard,
  ProposalTerms,
  ChoiceChip,
  TermsHeading,
  Button,
  FormMessage,
  TextField,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { getFamilyErrorMessage } from '../family/messages';

const targetCountTextSchema = z
  .string()
  .regex(/^\d+$/, 'Enter a whole number.')
  .refine(
    (value) =>
      Number(value) >= 1 &&
      Number(value) <= offerValidationBounds.targetCountMax,
    `Enter a number from 1 to ${offerValidationBounds.targetCountMax}.`,
  );

const formSchema = z.strictObject({
  childUid: z.string().min(1, 'Select a child.'),
  tasks: z
    .array(
      z.strictObject({
        title: z
          .string()
          .trim()
          .min(1, 'Enter a task title.')
          .max(offerValidationBounds.titleMaxLength),
        targetCount: targetCountTextSchema,
      }),
    )
    .min(1)
    .max(offerValidationBounds.taskCountMax),
  rewardTitle: z
    .string()
    .trim()
    .min(1, 'Enter a reward title.')
    .max(offerValidationBounds.titleMaxLength),
  rewardType: rewardTypeSchema,
  rewardIconKey: rewardIconKeySchema,
  rewardDescription: z
    .string()
    .trim()
    .max(offerValidationBounds.descriptionMaxLength),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  deadlineTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm.'),
});

type OfferDraftForm = z.output<typeof formSchema>;
type ActiveChild = ParentFamilyHome['children'][number];

function newIdempotencyKey(): string {
  return `offer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function defaultDeadline(): { deadlineDate: string; deadlineTime: string } {
  const value = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  return {
    deadlineDate: local.slice(0, 10),
    deadlineTime: local.slice(11, 16),
  };
}

function localDeadlineToUtc(dateText: string, timeText: string): string | null {
  const [year, month, day] = dateText.split('-').map(Number);
  const [hour, minute] = timeText.split(':').map(Number);
  const local = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    Number.isNaN(local.valueOf()) ||
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hour ||
    local.getMinutes() !== minute ||
    local.getTime() <= Date.now()
  ) {
    return null;
  }
  return local.toISOString();
}

function SavedDraft({
  draft,
  published,
  childName,
}: {
  draft: CreateOfferDraftOutput;
  published?: PublishOfferOutput;
  childName?: string;
}) {
  const dynamicType = useDynamicTypeStyles();
  return (
    <View className="gap-3 rounded-2xl border border-home-border bg-home-surface p-4">
      <Text
        allowFontScaling={false}
        accessibilityLiveRegion="polite"
        className="font-bold text-home-text"
        style={dynamicType.body}
      >
        {published ? 'Offer published' : 'Draft saved'}
      </Text>
      <ProposalTerms
        revision={draft.revision}
        author="Your proposal"
        status={
          published
            ? `Waiting for ${childName ?? 'the child'}`
            : 'Draft · not sent'
        }
        support={
          published
            ? `${childName ?? 'The child'} can accept, decline or counter the reward.`
            : 'Save first, then publish when you are ready.'
        }
      />
      {published ? (
        <Text
          allowFontScaling={false}
          className="font-semibold text-home-text"
          style={dynamicType.body}
        >
          Waiting for the child response.
        </Text>
      ) : null}
    </View>
  );
}

export function OfferDraftComposer({
  familyId,
  activeChildren,
}: {
  familyId: string;
  activeChildren: readonly ActiveChild[];
}) {
  const dynamicType = useDynamicTypeStyles();
  const deadline = defaultDeadline();
  const [pendingRequest, setPendingRequest] = useState<{
    fingerprint: string;
    idempotencyKey: string;
  }>();
  const [savedDraft, setSavedDraft] = useState<CreateOfferDraftOutput>();
  const [publishedOffer, setPublishedOffer] = useState<PublishOfferOutput>();
  const [publishIdempotencyKey, setPublishIdempotencyKey] = useState<string>();
  const [publishError, setPublishError] = useState<string>();
  const [isPublishing, setIsPublishing] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OfferDraftForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      childUid: activeChildren[0]?.uid ?? '',
      tasks: [{ title: '', targetCount: '1' }],
      rewardTitle: rewardPresets.cinema.title,
      rewardType: 'EXPERIENCE',
      rewardIconKey: rewardTypeDefaultIcons.EXPERIENCE,
      rewardDescription: '',
      ...deadline,
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'tasks' });
  const selectedChildUid = useWatch({ control, name: 'childUid' });
  const [rewardSelection, setRewardSelection] =
    useState<RewardSelection>('cinema');
  const deadlineDate = useWatch({ control, name: 'deadlineDate' });
  const deadlineTime = useWatch({ control, name: 'deadlineTime' });

  useEffect(() => {
    if (
      activeChildren.length > 0 &&
      !activeChildren.some((child) => child.uid === selectedChildUid)
    ) {
      setValue('childUid', activeChildren[0].uid, { shouldValidate: true });
    }
  }, [activeChildren, selectedChildUid, setValue]);

  const submit = async (form: OfferDraftForm) => {
    const deadlineAt = localDeadlineToUtc(form.deadlineDate, form.deadlineTime);
    if (!deadlineAt) {
      setError('deadlineDate', {
        message: 'Enter a valid future local date and time.',
      });
      return;
    }
    const rewardDescription = form.rewardDescription.trim();
    const requestPayload = {
      familyId,
      childUid: form.childUid,
      tasks: form.tasks.map((task) => ({
        title: task.title,
        targetCount: Number(task.targetCount),
      })),
      reward: {
        title: form.rewardTitle,
        type: form.rewardType,
        iconKey: form.rewardIconKey,
        ...(rewardDescription ? { description: rewardDescription } : {}),
      },
      deadlineAt,
    };
    const fingerprint = JSON.stringify(requestPayload);
    const requestKey =
      pendingRequest?.fingerprint === fingerprint
        ? pendingRequest.idempotencyKey
        : newIdempotencyKey();
    setPendingRequest({ fingerprint, idempotencyKey: requestKey });
    try {
      const output = await createOfferDraft({
        ...requestPayload,
        idempotencyKey: requestKey,
      });
      setSavedDraft(output);
      setPublishedOffer(undefined);
      setPendingRequest(undefined);
    } catch (error) {
      setError('root.offer', { message: getFamilyErrorMessage(error) });
    }
  };

  const publishSavedDraft = async () => {
    if (!savedDraft) return;
    const requestKey = publishIdempotencyKey ?? newIdempotencyKey();
    setPublishIdempotencyKey(requestKey);
    setPublishError(undefined);
    setIsPublishing(true);
    try {
      const output = await publishOffer({
        offerId: savedDraft.offer.id,
        currentRevisionId: savedDraft.revision.id,
        idempotencyKey: requestKey,
      });
      setPublishedOffer(output);
    } catch (error) {
      setPublishError(getFamilyErrorMessage(error));
    } finally {
      setIsPublishing(false);
    }
  };

  const startAnother = () => {
    setRewardSelection('cinema');
    reset({
      childUid: activeChildren[0]?.uid ?? '',
      tasks: [{ title: '', targetCount: '1' }],
      rewardTitle: rewardPresets.cinema.title,
      rewardType: 'EXPERIENCE',
      rewardIconKey: rewardTypeDefaultIcons.EXPERIENCE,
      rewardDescription: '',
      ...defaultDeadline(),
    });
    setSavedDraft(undefined);
    setPublishedOffer(undefined);
    setPublishIdempotencyKey(undefined);
    setPublishError(undefined);
    setPendingRequest(undefined);
  };

  return (
    <SurfaceCard>
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        className="font-bold text-home-text"
        style={dynamicType.body}
      >
        Create an offer draft
      </Text>
      {savedDraft ? (
        <>
          <SavedDraft
            draft={savedDraft}
            published={publishedOffer}
            childName={
              activeChildren.find(
                (child) => child.uid === savedDraft.offer.childUid,
              )?.displayName
            }
          />
          <FormMessage message={publishError} />
          {!publishedOffer ? (
            <Button
              label="Publish offer"
              loading={isPublishing}
              onPress={() => void publishSavedDraft()}
            />
          ) : null}
          <Button
            label="Create another draft"
            onPress={startAnother}
            variant="outline"
          />
        </>
      ) : activeChildren.length === 0 ? (
        <Text
          allowFontScaling={false}
          className="text-home-muted"
          style={dynamicType.body}
        >
          Add a child before creating an offer draft.
        </Text>
      ) : (
        <>
          <FormMessage message={errors.root?.offer?.message} />
          <TermsHeading icon="people-outline">Who is this for?</TermsHeading>
          <View className="flex-row flex-wrap gap-2">
            {activeChildren.map((child) => (
              <ChoiceChip
                key={child.uid}
                label={`${selectedChildUid === child.uid ? 'Selected' : 'Select'} ${child.displayName}`}
                onPress={() =>
                  setValue('childUid', child.uid, { shouldValidate: true })
                }
                selected={selectedChildUid === child.uid}
              />
            ))}
          </View>
          {errors.childUid?.message ? (
            <FormMessage message={errors.childUid.message} />
          ) : null}

          <TermsHeading icon="checkbox-outline">Tasks</TermsHeading>
          {fields.map((field, index) => (
            <View
              className="gap-3 rounded-2xl border border-home-border bg-home-surface p-4"
              key={field.id}
            >
              <Controller
                control={control}
                name={`tasks.${index}.title`}
                render={({ field: taskField }) => (
                  <TextField
                    editable={!isSubmitting}
                    error={errors.tasks?.[index]?.title?.message}
                    label={`Task ${index + 1}`}
                    onBlur={taskField.onBlur}
                    onChangeText={taskField.onChange}
                    value={taskField.value}
                  />
                )}
              />
              <Controller
                control={control}
                name={`tasks.${index}.targetCount`}
                render={({ field: countField }) => (
                  <TextField
                    editable={!isSubmitting}
                    error={errors.tasks?.[index]?.targetCount?.message}
                    keyboardType="number-pad"
                    label="Target count"
                    onBlur={countField.onBlur}
                    onChangeText={countField.onChange}
                    value={countField.value}
                  />
                )}
              />
              {fields.length > 1 ? (
                <Button
                  label={`Remove task ${index + 1}`}
                  onPress={() => remove(index)}
                  variant="outline"
                />
              ) : null}
            </View>
          ))}
          {fields.length < offerValidationBounds.taskCountMax ? (
            <Button
              label="Add task"
              onPress={() => append({ title: '', targetCount: '1' })}
              variant="outline"
            />
          ) : null}

          <TermsHeading icon="gift-outline">Choose reward</TermsHeading>
          <RewardPicker
            value={rewardSelection}
            disabled={isSubmitting}
            onChange={(selection) => {
              if (selection === rewardSelection) return;
              setRewardSelection(selection);
              const reward = rewardTermsForSelection(selection);
              setValue('rewardTitle', reward.title, { shouldValidate: true });
              setValue('rewardType', reward.type, { shouldValidate: true });
              setValue('rewardIconKey', reward.iconKey, {
                shouldValidate: true,
              });
            }}
          />
          {rewardSelection === 'custom' ? (
            <>
              {' '}
              <Controller
                control={control}
                name="rewardTitle"
                render={({ field }) => (
                  <TextField
                    editable={!isSubmitting}
                    error={errors.rewardTitle?.message}
                    label="Reward title"
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    value={field.value}
                  />
                )}
              />
            </>
          ) : null}
          <Controller
            control={control}
            name="rewardDescription"
            render={({ field }) => (
              <TextField
                required={false}
                editable={!isSubmitting}
                error={errors.rewardDescription?.message}
                label="Reward description (optional)"
                multiline
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                value={field.value}
              />
            )}
          />
          <TermsHeading icon="calendar-outline">Deadline</TermsHeading>
          <DeadlinePicker
            date={deadlineDate}
            time={deadlineTime}
            disabled={isSubmitting}
            error={errors.deadlineDate?.message ?? errors.deadlineTime?.message}
            onChange={({ date, time }) => {
              setValue('deadlineDate', date, { shouldValidate: true });
              setValue('deadlineTime', time, { shouldValidate: true });
            }}
          />
          <Button
            label="Save offer draft"
            loading={isSubmitting}
            onPress={handleSubmit(submit)}
          />
        </>
      )}
    </SurfaceCard>
  );
}
