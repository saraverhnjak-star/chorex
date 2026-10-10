import { useState } from 'react';
import { Modal, Platform, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, FormMessage, SurfaceCard } from '@chorex/ui';

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
}: Deadline & {
  onChange: (value: Deadline) => void;
  disabled?: boolean;
  error?: string;
}) {
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
      accessibilityLabel={mode === 'date' ? 'Deadline date' : 'Deadline time'}
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
      <Button
        label={`Choose deadline date: ${value.toLocaleDateString()}`}
        variant="outline"
        disabled={disabled}
        onPress={() => open('date')}
      />
      <Button
        label={`Choose deadline time: ${value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
        variant="outline"
        disabled={disabled}
        onPress={() => open('time')}
      />
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
                label="Done"
                onPress={() => {
                  if (pending) commit(pending);
                }}
              />
              <Button
                label="Cancel"
                variant="outline"
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
