const { amberAuroraColors, homeTokens } = require('./theme.cjs');

module.exports = {
  theme: {
    extend: {
      colors: {
        'home-background': homeTokens.app,
        'home-surface': homeTokens.surface,
        'home-text': homeTokens.text,
        'home-muted': homeTokens.secondary,
        'home-border': homeTokens.border,
        background: amberAuroraColors.background,
        surface: amberAuroraColors.surface,
        'surface-warm': amberAuroraColors.surfaceWarm,
        text: amberAuroraColors.text,
        'text-muted': amberAuroraColors.textMuted,
        primary: amberAuroraColors.primary,
        'primary-pressed': amberAuroraColors.primaryPressed,
        secondary: amberAuroraColors.secondary,
        success: amberAuroraColors.success,
        danger: amberAuroraColors.danger,
        border: amberAuroraColors.border,
        focus: amberAuroraColors.focus,
      },
    },
  },
};
