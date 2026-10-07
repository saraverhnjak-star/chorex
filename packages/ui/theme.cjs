const amberAuroraPalette = Object.freeze({
  midnightPlum: '#2D203B',
  warmAmber: '#F2A65A',
  auroraBlue: '#7796B8',
  warmCanvas: '#FFF8F2',
  peachGlow: '#FFF0E7',
  paper: '#FFFFFF',
  sage: '#5F9878',
  softPlum: '#716778',
  divider: '#E5DAD3',
  danger: '#B94E55',
  amberPressed: '#D98B3F',
});

const amberAuroraColors = Object.freeze({
  background: amberAuroraPalette.warmCanvas,
  surface: amberAuroraPalette.paper,
  surfaceWarm: amberAuroraPalette.peachGlow,
  text: amberAuroraPalette.midnightPlum,
  textMuted: amberAuroraPalette.softPlum,
  primary: amberAuroraPalette.warmAmber,
  primaryPressed: amberAuroraPalette.amberPressed,
  secondary: amberAuroraPalette.auroraBlue,
  success: amberAuroraPalette.sage,
  danger: amberAuroraPalette.danger,
  border: amberAuroraPalette.divider,
  focus: amberAuroraPalette.auroraBlue,
});

const homeTokens = {
  app: '#FFF9F4',
  surface: '#FFFDFA',
  text: '#211A3B',
  secondary: '#668096',
  coral: '#E95240',
  coralSurface: '#FFEAE4',
  mint: '#E7F5EE',
  attention: '#FFF0D9',
  attentionText: '#98621D',
  blue: '#E8F1FF',
  lavender: '#F0EAFA',
  border: '#F0E5DD',
  success: '#299D7E',
  spacing: { small: 8, medium: 12, card: 16, section: 24 },
  radius: { card: 20, pill: 999 },
};

module.exports = { amberAuroraColors, amberAuroraPalette, homeTokens };
