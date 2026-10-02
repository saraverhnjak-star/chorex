const expo = require('eslint-config-expo/flat');

module.exports = [
  ...expo,
  { settings: { react: { version: '19.2.3' } } },
  {
    files: ['**/*.cjs'],
    languageOptions: { globals: { __dirname: 'readonly' } },
  },
  {
    ignores: [
      '**/dist/**',
      'functions/lib/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/android/**',
      '**/ios/**',
    ],
  },
];
