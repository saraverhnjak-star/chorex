import { useRef, useState } from 'react';
import {
  AccessibilityInfo,
  type View as NativeView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  rewardIconKeys,
  rewardPresets,
  type RewardSelection,
  type RewardIconKey,
} from '@chorex/domain';
import { DesignText, homeTokens } from './Home';
import { FocusHeading, useReducedMotion } from './accessibility';
import { Button } from './Button';
import { RewardIcon } from './RewardIcon';

export function RewardPicker({
  value,
  onChange,
  disabled = false,
  prominent = false,
  currentReward,
}: {
  value: RewardSelection;
  onChange: (key: RewardSelection) => void;
  disabled?: boolean;
  prominent?: boolean;
  currentReward?: { title: string; iconKey: RewardIconKey };
}) {
  const trigger = useRef<NativeView>(null);
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <>
      <View style={s.preview}>
        <RewardIcon
          terms={{
            iconKey:
              value === 'custom' ? (currentReward?.iconKey ?? 'gift') : value,
          }}
          size={prominent ? 88 : 52}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <DesignText style={prominent ? s.rewardTitle : s.label}>
            {prominent ? '' : 'Selected reward: '}
            {value === 'custom'
              ? currentReward?.title || 'Custom'
              : rewardPresets[value].title}
          </DesignText>
          <Button
            ref={trigger}
            label={prominent ? 'Change' : 'Choose reward'}
            variant="outline"
            disabled={disabled}
            onPress={() => setOpen(true)}
          />
        </View>
      </View>
      <Modal
        visible={open}
        animationType={reducedMotion ? 'none' : 'slide'}
        onDismiss={() => {
          if (trigger.current)
            AccessibilityInfo.sendAccessibilityEvent(trigger.current, 'focus');
        }}
        onRequestClose={() => setOpen(false)}
      >
        <View
          accessibilityViewIsModal
          style={[
            s.modal,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
          <View style={s.header}>
            <FocusHeading key={open ? 'open' : 'closed'} style={s.title}>
              Choose reward
            </FocusHeading>
            <Button
              label="Done"
              accessibilityLabel="Close reward picker"
              variant="outline"
              onPress={() => setOpen(false)}
            />
          </View>
          <ScrollView contentContainerStyle={s.grid}>
            {([...rewardIconKeys, 'custom'] as const).map((key) => (
              <Pressable
                key={key}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Choose ${key === 'custom' ? 'Custom' : rewardPresets[key].title} reward`}
                accessibilityState={{ selected: key === value, disabled }}
                disabled={disabled}
                onPress={() => {
                  onChange(key);
                  setOpen(false);
                }}
                style={[s.option, key === value && s.selected]}
              >
                <RewardIcon
                  terms={{ iconKey: key === 'custom' ? 'gift' : key }}
                  size={52}
                />
                <DesignText style={s.label}>
                  {key === 'custom' ? 'Custom' : rewardPresets[key].title}
                </DesignText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
const s = StyleSheet.create({
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: homeTokens.spacing.medium,
  },
  modal: { flex: 1, backgroundColor: homeTokens.app },
  header: { padding: homeTokens.spacing.card, gap: homeTokens.spacing.medium },
  title: { fontSize: 22, fontWeight: '700', color: homeTokens.text },
  grid: {
    padding: homeTokens.spacing.card,
    gap: homeTokens.spacing.medium,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  option: {
    width: '47%',
    minHeight: 116,
    padding: homeTokens.spacing.medium,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: homeTokens.radius.card,
    borderColor: homeTokens.border,
    backgroundColor: homeTokens.surface,
  },
  selected: {
    borderColor: homeTokens.coral,
    backgroundColor: homeTokens.coralSurface,
  },
  rewardTitle: { fontSize: 26, fontWeight: '700', color: homeTokens.text },
  label: { fontSize: 14, color: homeTokens.text },
});
