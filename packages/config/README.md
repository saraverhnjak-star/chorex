# Shared configuration

The public `tsconfig.base.json` entry preserves strict TypeScript settings. The module exports the development project ID and validates explicit emulator mode, local/private IPv4 host, and ports from 1 to 65535. App composition reads Expo environment variables; configuration itself has no native or Firebase dependencies.
