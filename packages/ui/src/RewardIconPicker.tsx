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
import { rewardIconKeys, type RewardIconKey } from '@chorex/domain';
import { DesignText, homeTokens } from './Home';
import { FocusHeading, useReducedMotion } from './accessibility';
import { Button } from './Button';
import { RewardIcon, rewardIconLabels } from './RewardIcon';

export function RewardIconPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: RewardIconKey;
  onChange: (key: RewardIconKey) => void;
  disabled?: boolean;
}) {
  const trigger = useRef<NativeView>(null);
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <>
      <View style={s.preview}>
        <RewardIcon terms={{ iconKey: value }} />
        <View style={{ flex: 1, gap: 4 }}>
          <DesignText style={s.label}>
            Reward icon: {rewardIconLabels[value]}
          </DesignText>
          <Button
            ref={trigger}
            label="Change icon"
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
              Choose reward icon
            </FocusHeading>
            <Button
              label="Done"
              accessibilityLabel="Close reward icon picker"
              variant="outline"
              onPress={() => setOpen(false)}
            />
          </View>
          <ScrollView contentContainerStyle={s.grid}>
            {rewardIconKeys.map((key) => (
              <Pressable
                key={key}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Choose ${rewardIconLabels[key]} icon`}
                accessibilityState={{ selected: key === value, disabled }}
                disabled={disabled}
                onPress={() => {
                  onChange(key);
                  setOpen(false);
                }}
                style={[s.option, key === value && s.selected]}
              >
                <RewardIcon terms={{ iconKey: key }} size={52} />
                <DesignText style={s.label}>{rewardIconLabels[key]}</DesignText>
                {key === value ? (
                  <DesignText style={s.selection}>✓ Selected</DesignText>
                ) : null}
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
  label: { fontSize: 14, color: homeTokens.text },
  selection: { fontSize: 13, fontWeight: '600', color: homeTokens.text },
});
