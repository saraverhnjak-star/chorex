import { randomUUID } from 'node:crypto';
import {
  initializeTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

const projectId = 'chorex-dev';
const required = {
  GCLOUD_PROJECT: projectId,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
};
for (const [key, value] of Object.entries(required)) {
  if (process.env[key] !== value)
    throw new Error(`Emulator guard failed: ${key}`);
}
const deadline = setTimeout(() => {
  console.error('Emulator verification exceeded 40 seconds');
  process.exit(1);
}, 40_000);
let environment;
let identity;
const path = `bootstrapSecurity/${randomUUID()}`;
async function authRequest(operation, body) {
  const response = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${operation}?key=emulator-only`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok)
    throw new Error(`Auth emulator ${operation} failed: ${response.status}`);
  return response.json();
}
try {
  identity = await authRequest('signUp', {
    email: `bootstrap-${randomUUID()}@example.invalid`,
    password: randomUUID(),
    returnSecureToken: true,
  });
  if (
    typeof identity.localId !== 'string' ||
    typeof identity.idToken !== 'string'
  ) {
    throw new Error('Invalid Auth emulator response');
  }
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080 },
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), { infrastructureCheck: true });
  });
  for (const context of [
    environment.unauthenticatedContext(),
    environment.authenticatedContext(identity.localId),
  ]) {
    const reference = doc(context.firestore(), path);
    await assertFails(getDoc(reference));
    await assertFails(setDoc(reference, { infrastructureCheck: false }));
  }
  console.info(
    'PASS: emulator rules deny anonymous and authenticated reads/writes',
  );
} finally {
  try {
    if (environment) {
      await environment.withSecurityRulesDisabled(async (context) => {
        await deleteDoc(doc(context.firestore(), path));
      });
      await environment.cleanup();
    }
  } finally {
    if (identity?.idToken)
      await authRequest('delete', { idToken: identity.idToken });
    clearTimeout(deadline);
  }
}
