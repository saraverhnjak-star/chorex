export function crashlyticsPolicy(input?: {
  mode?: string;
  validation?: string;
  buildProfile?: string;
}): {
  enabled: boolean;
  environment: 'production' | 'validation' | 'development';
  native: Record<string, boolean>;
};
