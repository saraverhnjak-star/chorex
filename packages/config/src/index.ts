export const firebaseDevelopmentProjectId = 'chorex-dev';

export interface FirebaseEmulatorInput {
  mode: string | undefined;
  host: string | undefined;
  authPort: string | undefined;
  firestorePort: string | undefined;
  functionsPort: string | undefined;
}

export interface FirebaseEmulatorConfig {
  host: string;
  authPort: number;
  firestorePort: number;
  functionsPort: number;
}

function port(value: string | undefined, name: string): number {
  if (
    !value ||
    !/^\d+$/.test(value) ||
    Number(value) < 1 ||
    Number(value) > 65535
  ) {
    throw new Error(
      `FIREBASE_EMULATOR_CONFIG_INVALID: ${name} must be an explicit port (1–65535).`,
    );
  }
  return Number(value);
}

function isLocalHost(host: string): boolean {
  if (host === 'localhost') return true;
  const octets = host.split('.');
  if (
    octets.length !== 4 ||
    octets.some(
      (part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255,
    )
  )
    return false;
  const [first, second] = octets.map(Number);
  return (
    first === 127 ||
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}

export function readFirebaseEmulatorConfig(
  input: FirebaseEmulatorInput,
): FirebaseEmulatorConfig {
  if (input.mode !== 'emulator') {
    throw new Error(
      'FIREBASE_EMULATOR_CONFIG_INVALID: EXPO_PUBLIC_FIREBASE_MODE must be emulator. Live Firebase is not supported.',
    );
  }
  if (!input.host || !isLocalHost(input.host)) {
    throw new Error(
      'FIREBASE_EMULATOR_CONFIG_INVALID: specify localhost, a loopback IPv4 address, or a private LAN IPv4 address without a scheme or port.',
    );
  }
  return {
    host: input.host,
    authPort: port(input.authPort, 'Auth port'),
    firestorePort: port(input.firestorePort, 'Firestore port'),
    functionsPort: port(input.functionsPort, 'Functions port'),
  };
}
