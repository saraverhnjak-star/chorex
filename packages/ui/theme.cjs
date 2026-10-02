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

module.exports = { amberAuroraColors, amberAuroraPalette };
