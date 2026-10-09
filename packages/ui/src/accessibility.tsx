import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Text,
  type TextProps,
} from 'react-native';
import { DesignText } from './Home';

/** Explicit command feedback only; never attach this to realtime listeners. */
export function announceAction(message: string) {
  if (Platform.OS === 'ios')
    AccessibilityInfo.announceForAccessibility(message);
}

/** Android uses live regions; iOS needs an explicit announcement for new errors. */
export function useErrorAnnouncement(message?: string) {
  useEffect(() => {
    if (message && Platform.OS === 'ios') announceAction(message);
  }, [message]);
}

/** A newly opened inline confirmation has a focusable title in reading order. */
export function FocusHeading(props: TextProps) {
  const ref = useRef<Text>(null);
  const focused = useRef(false);
  return (
    <DesignText
      {...props}
      ref={ref}
      accessible
      accessibilityRole="header"
      onLayout={() => {
        if (focused.current || !ref.current) return;
        focused.current = true;
        AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
      }}
    />
  );
}

export function useReducedMotion() {
  // Avoid starting a nonessential animation while the preference is loading.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
