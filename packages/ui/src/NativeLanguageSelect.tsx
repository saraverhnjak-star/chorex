import { useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import { Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DesignText, homeTokens } from './Home';
import { amberAuroraPalette } from './theme';
import { Button } from './Button';
import { FormMessage } from './FormMessage';
import {
  appLanguages,
  t,
  useAppLanguage,
  type AppLanguage,
} from './localization';
export function NativeLanguageSelect({
  value,
  onChange,
}: {
  value: AppLanguage;
  onChange: (value: AppLanguage) => Promise<void>;
}) {
  useAppLanguage();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(value);
  const [error, setError] = useState(false);
  const selected = appLanguages.find((option) => option.code === value)!;
  const commit = (next: AppLanguage) => {
    setOpen(false);
    setError(false);
    if (next !== value) void onChange(next).catch(() => setError(true));
  };
  const picker = (wheel: boolean) => (
    <Picker
      testID="language-native-picker"
      accessibilityLabel={t('Language')}
      selectedValue={wheel ? pending : value}
      onValueChange={(next: AppLanguage) => {
        if (!appLanguages.some((option) => option.code === next)) return;
        if (wheel) setPending(next);
        else commit(next);
      }}
      mode="dropdown"
      dropdownIconColor={amberAuroraPalette.auroraBlue}
      style={{ color: homeTokens.text, minHeight: 56 }}
      itemStyle={{ color: homeTokens.text, fontSize: 18 }}
    >
      {appLanguages.map((option) => (
        <Picker.Item
          key={option.code}
          label={`${option.flag} ${option.name}`}
          value={option.code}
        />
      ))}
    </Picker>
  );
  return (
    <>
      {Platform.OS === 'ios' ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('Language')}: ${selected.name}`}
            accessibilityState={{ expanded: open }}
            onPress={() => {
              setPending(value);
              setOpen(true);
            }}
            style={{
              minHeight: 56,
              padding: homeTokens.spacing.medium,
              flexDirection: 'row',
              alignItems: 'center',
              gap: homeTokens.spacing.medium,
            }}
          >
            <DesignText accessible={false} style={{ fontSize: 24 }}>
              {selected.flag}
            </DesignText>
            <DesignText
              style={{ flex: 1, fontSize: 16, color: homeTokens.text }}
            >
              {selected.name}
            </DesignText>
            <Ionicons
              accessible={false}
              name="chevron-down"
              size={20}
              color={homeTokens.secondary}
            />
          </Pressable>
          <Modal
            visible={open}
            transparent
            animationType="none"
            onRequestClose={() => setOpen(false)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: '#00000033',
                justifyContent: 'flex-end',
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Cancel')}
                onPress={() => setOpen(false)}
                style={{ flex: 1 }}
              />
              <View
                accessibilityViewIsModal
                style={{
                  backgroundColor: homeTokens.surface,
                  padding: homeTokens.spacing.card,
                  paddingBottom: Math.max(
                    insets.bottom,
                    homeTokens.spacing.card,
                  ),
                  borderTopLeftRadius: homeTokens.radius.card,
                  borderTopRightRadius: homeTokens.radius.card,
                  gap: homeTokens.spacing.medium,
                }}
              >
                <DesignText
                  accessibilityRole="header"
                  style={{
                    color: homeTokens.text,
                    fontSize: 20,
                    fontWeight: '700',
                  }}
                >
                  {t('Language')}
                </DesignText>
                {picker(true)}
                <View
                  style={{
                    flexDirection: 'row',
                    gap: homeTokens.spacing.medium,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t('Cancel')}
                      variant="outlineBlue"
                      onPress={() => setOpen(false)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t('Done')}
                      variant="blue"
                      lightText
                      onPress={() => commit(pending)}
                    />
                  </View>
                </View>
              </View>
            </View>
          </Modal>
        </>
      ) : (
        picker(false)
      )}
      {error ? (
        <FormMessage message={t('Language could not be saved. Try again.')} />
      ) : null}
    </>
  );
}
