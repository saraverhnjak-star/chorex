import { useWindowDimensions, type TextStyle } from 'react-native';

interface DynamicTypeStyles {
  body: TextStyle;
  small: TextStyle;
  title: TextStyle;
}

export function useDynamicTypeStyles(): DynamicTypeStyles {
  const { fontScale } = useWindowDimensions();

  return {
    body: { fontSize: 16 * fontScale },
    small: { fontSize: 14 * fontScale },
    title: { fontSize: 30 * fontScale },
  };
}
