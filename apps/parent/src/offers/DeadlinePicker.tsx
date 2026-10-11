import {
  t,
  useAppLanguage,
  dateLocale,
  Button,
  FormMessage,
  SurfaceCard,
  amberAuroraPalette,
  homeTokens,
} from '@chorex/ui';
import { useState } from 'react';
import { Modal, Platform, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

type Deadline = { date: string; time: string };
export function deadlineParts(value: Date): Deadline {
  const pad = (part: number) => String(part).padStart(2, '0');
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}
export function DeadlinePicker({
  date,
  time,
  onChange,
  disabled,
  error,
  compact = false,
}: Deadline & {
  onChange: (value: Deadline) => void;
  disabled?: boolean;
  error?: string;
  compact?: boolean;
}) {
  useAppLanguage();

  const [mode, setMode] = useState<'date' | 'time'>();
  const [pending, setPending] = useState<Date>();
  const value = new Date(`${date}T${time}:00`);
  const open = (next: 'date' | 'time') => {
    setPending(value);
    setMode(next);
  };
  const commit = (chosen: Date) => {
    const parts = deadlineParts(chosen);
    onChange(
      mode === 'date' ? { date: parts.date, time } : { date, time: parts.time },
    );
    setMode(undefined);
  };
  const picker = mode ? (
    <DateTimePicker
      accessibilityLabel={
        mode === 'date' ? t('Deadline date') : t('Deadline time')
      }
      locale={dateLocale()}
      positiveButton={{
        label: t('Done'),
        textColor: amberAuroraPalette.auroraBlue,
      }}
      negativeButton={{
        label: t('Cancel'),
        textColor: amberAuroraPalette.auroraBlue,
      }}
      value={pending ?? value}
      mode={mode}
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      onChange={(event, chosen) => {
        if (Platform.OS === 'ios') {
          if (chosen) setPending(chosen);
        } else if (event.type === 'set' && chosen) commit(chosen);
        else setMode(undefined);
      }}
    />
  ) : null;
  return (
    <View className="gap-3">
      <View
        style={{
          flexDirection: compact ? 'row' : 'column',
          gap: homeTokens.spacing.medium,
        }}
      >
        <View style={compact ? { flex: 1 } : undefined}>
          <Button
            label={
              compact
                ? value.toLocaleDateString(dateLocale())
                : t('Choose deadline date: {0}', {
                    '0': value.toLocaleDateString(dateLocale()),
                  })
            }
            accessibilityLabel={t('Choose deadline date: {0}', {
              '0': value.toLocaleDateString(dateLocale()),
            })}
            variant="outline"
            disabled={disabled}
            onPress={() => open('date')}
          />
        </View>
        <View style={compact ? { flex: 1 } : undefined}>
          <Button
            label={
              compact
                ? value.toLocaleTimeString(dateLocale(), {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : t('Choose deadline time: {0}', {
                    '0': value.toLocaleTimeString(dateLocale(), {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  })
            }
            accessibilityLabel={t('Choose deadline time: {0}', {
              '0': value.toLocaleTimeString(dateLocale(), {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
            variant="outline"
            disabled={disabled}
            onPress={() => open('time')}
          />
        </View>
      </View>
      {error ? <FormMessage message={error} /> : null}
      {Platform.OS === 'ios' ? (
        <Modal
          visible={mode !== undefined}
          transparent
          animationType="slide"
          onRequestClose={() => setMode(undefined)}
        >
          <View className="flex-1 justify-end bg-black/30 p-4">
            <SurfaceCard>
              {picker}
              <Button
                label={t('Done')}
                variant="blue"
                lightText
                onPress={() => {
                  if (pending) commit(pending);
                }}
              />
              <Button
                label={t('Cancel')}
                variant="outlineBlue"
                onPress={() => setMode(undefined)}
              />
            </SurfaceCard>
          </View>
        </Modal>
      ) : (
        picker
      )}
    </View>
  );
}
