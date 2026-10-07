import { z } from 'zod';
import { userRoleSchema } from './family';
export const childReminderPreferencesSchema = z.strictObject({
  deadlineRemindersEnabled: z.boolean(),
});
export const parentReminderPreferencesSchema = z.strictObject({
  pendingRewardRemindersEnabled: z.boolean(),
});
export function reminderPreferenceEnabled(
  role: z.output<typeof userRoleSchema>,
  data: unknown,
): boolean {
  if (data === undefined) return true;
  return role === 'CHILD'
    ? childReminderPreferencesSchema.parse(data).deadlineRemindersEnabled
    : parentReminderPreferencesSchema.parse(data).pendingRewardRemindersEnabled;
}
export function reminderPreferenceData(
  role: z.output<typeof userRoleSchema>,
  enabled: boolean,
) {
  return role === 'CHILD'
    ? childReminderPreferencesSchema.parse({
        deadlineRemindersEnabled: enabled,
      })
    : parentReminderPreferencesSchema.parse({
        pendingRewardRemindersEnabled: enabled,
      });
}
