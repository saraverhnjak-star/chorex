export type AmberAuroraPalette = Readonly<{
  midnightPlum: string;
  warmAmber: string;
  auroraBlue: string;
  warmCanvas: string;
  peachGlow: string;
  paper: string;
  sage: string;
  softPlum: string;
  divider: string;
  danger: string;
  amberPressed: string;
}>;

export type AmberAuroraColors = Readonly<{
  background: string;
  surface: string;
  surfaceWarm: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryPressed: string;
  secondary: string;
  success: string;
  danger: string;
  border: string;
  focus: string;
}>;

export const amberAuroraPalette: AmberAuroraPalette;
export const amberAuroraColors: AmberAuroraColors;

export const homeTokens: Readonly<{
  app: string;
  surface: string;
  text: string;
  secondary: string;
  coral: string;
  coralSurface: string;
  mint: string;
  attention: string;
  attentionText: string;
  blue: string;
  lavender: string;
  border: string;
  success: string;
  spacing: { small: number; medium: number; card: number; section: number };
  radius: { card: number; pill: number };
}>;
