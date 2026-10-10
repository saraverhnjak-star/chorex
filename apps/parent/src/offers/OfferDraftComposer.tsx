import { DeadlinePicker } from './DeadlinePicker';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
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
  Ionicons,
  ProposalTerms,
  DesignText,
  homeTokens,
  amberAuroraPalette,
  amberAuroraColors,
  Button,
  FormMessage,
  TextField,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { getFamilyErrorMessage } from '../family/messages';

function DraftSectionHeading({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'blue' | 'mint' | 'coralSurface' | 'lavender';
}) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: homeTokens[tone],
        borderRadius: homeTokens.radius.pill,
        paddingHorizontal: homeTokens.spacing.medium,
        paddingVertical: homeTokens.spacing.small,
      }}
    >
      <DesignText
        accessibilityRole="header"
        style={{ fontSize: 18, fontWeight: '700', color: homeTokens.text }}
      >
        {children}
      </DesignText>
    </View>
  );
}

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
    <View style={{ gap: homeTokens.spacing.section }}>
      <Text
        allowFontScaling={false}
        accessibilityLiveRegion="polite"
        className="font-bold text-home-text"
        style={{
          ...dynamicType.body,
          fontWeight: '700',
          color: homeTokens.secondary,
        }}
      >
        {published ? 'Offer published' : 'Draft saved'}
      </Text>
      <ProposalTerms
        layout="rewardFirst"
        revision={draft.revision}
        author={childName ? `For ${childName}` : undefined}
        status={
          published
            ? `Waiting for ${childName ?? 'the child'}`
            : 'Draft · not sent'
        }
        support={
          published
            ? `${childName ?? 'The child'} can accept, decline or counter the reward.`
            : 'Review these terms, then publish when you are ready.'
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
    <View style={{ gap: homeTokens.spacing.medium }}>
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
              variant="blue"
              lightText
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
          <DraftSectionHeading tone="blue">
            Who is this for?
          </DraftSectionHeading>
          <View className="flex-row flex-wrap gap-2">
            {activeChildren.map((child) => (
              <Pressable
                key={child.uid}
                accessibilityRole="button"
                accessibilityLabel={`${selectedChildUid === child.uid ? 'Selected' : 'Select'} ${child.displayName}`}
                accessibilityState={{
                  selected: selectedChildUid === child.uid,
                  disabled: isSubmitting,
                }}
                disabled={isSubmitting}
                onPress={() =>
                  setValue('childUid', child.uid, { shouldValidate: true })
                }
                style={{
                  minHeight: 48,
                  paddingHorizontal: homeTokens.spacing.card,
                  paddingVertical: homeTokens.spacing.small,
                  borderRadius: homeTokens.radius.pill,
                  backgroundColor:
                    selectedChildUid === child.uid
                      ? homeTokens.text
                      : homeTokens.surface,
                  borderWidth: 1,
                  borderColor:
                    selectedChildUid === child.uid
                      ? homeTokens.text
                      : homeTokens.border,
                  justifyContent: 'center',
                }}
              >
                <DesignText
                  style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color:
                      selectedChildUid === child.uid
                        ? amberAuroraPalette.paper
                        : homeTokens.text,
                  }}
                >
                  {child.displayName}
                </DesignText>
              </Pressable>
            ))}
          </View>
          {errors.childUid?.message ? (
            <FormMessage message={errors.childUid.message} />
          ) : null}

          <View style={{ marginTop: homeTokens.spacing.section }}>
            <DraftSectionHeading tone="lavender">Tasks</DraftSectionHeading>
          </View>
          {fields.map((field, index) => (
            <View
              style={{
                gap: homeTokens.spacing.medium,
                paddingBottom: homeTokens.spacing.medium,
                borderBottomWidth: fields.length > 1 ? 1 : 0,
                borderColor: homeTokens.border,
              }}
              key={field.id}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: homeTokens.spacing.small,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Controller
                    control={control}
                    name={`tasks.${index}.title`}
                    render={({ field: taskField }) => (
                      <TextField
                        editable={!isSubmitting}
                        error={errors.tasks?.[index]?.title?.message}
                        hideLabel
                        placeholder="Task"
                        label={`Task ${index + 1}`}
                        onBlur={taskField.onBlur}
                        onChangeText={taskField.onChange}
                        value={taskField.value}
                      />
                    )}
                  />
                </View>
                <DesignText
                  accessible={false}
                  style={{
                    fontSize: 24,
                    color: homeTokens.secondary,
                    marginTop: homeTokens.spacing.small,
                  }}
                >
                  ×
                </DesignText>
                <View
                  style={{
                    width: 36 + 3 * Number(dynamicType.body.fontSize) * 0.65,
                    flexShrink: 0,
                  }}
                >
                  <Controller
                    control={control}
                    name={`tasks.${index}.targetCount`}
                    render={({ field: countField }) => (
                      <TextField
                        editable={!isSubmitting}
                        error={errors.tasks?.[index]?.targetCount?.message}
                        keyboardType="number-pad"
                        hideLabel
                        label="Target count"
                        onBlur={countField.onBlur}
                        onChangeText={countField.onChange}
                        value={countField.value}
                      />
                    )}
                  />
                </View>
                {fields.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove task ${index + 1}`}
                    accessibilityState={{ disabled: isSubmitting }}
                    disabled={isSubmitting}
                    onPress={() => remove(index)}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: homeTokens.radius.pill,
                      backgroundColor: amberAuroraColors.danger,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons
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
          {fields.length < offerValidationBounds.taskCountMax ? (
            <Button
              label="Add another task"
              onPress={() => append({ title: '', targetCount: '1' })}
              variant="outline"
            />
          ) : null}

          <View style={{ marginTop: homeTokens.spacing.section }}>
            <DraftSectionHeading tone="coralSurface">
              Choose reward
            </DraftSectionHeading>
          </View>
          <RewardPicker
            prominent
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
          <View style={{ marginTop: homeTokens.spacing.medium }}>
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
                  numberOfLines={4}
                  textAlignVertical="top"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  value={field.value}
                />
              )}
            />
          </View>
          <View style={{ marginTop: homeTokens.spacing.section }}>
            <DraftSectionHeading tone="mint">Deadline</DraftSectionHeading>
          </View>
          <DeadlinePicker
            compact
            date={deadlineDate}
            time={deadlineTime}
            disabled={isSubmitting}
            error={errors.deadlineDate?.message ?? errors.deadlineTime?.message}
            onChange={({ date, time }) => {
              setValue('deadlineDate', date, { shouldValidate: true });
              setValue('deadlineTime', time, { shouldValidate: true });
            }}
          />
          <View
            style={{
              marginTop: homeTokens.spacing.section,
              gap: homeTokens.spacing.small,
            }}
          >
            <Button
              label="Save offer draft"
              variant="blue"
              lightText
              loading={isSubmitting}
              onPress={handleSubmit(submit)}
            />
            <DesignText
              style={{
                fontSize: 14,
                color: homeTokens.secondary,
                textAlign: 'center',
              }}
            >
              Review your draft before sending it to your child.
            </DesignText>
          </View>
        </>
      )}
    </View>
  );
}
