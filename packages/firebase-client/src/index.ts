import { getApp } from '@react-native-firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword as firebaseCreateUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  signInWithCustomToken as firebaseSignInWithCustomToken,
  signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from '@react-native-firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where,
} from '@react-native-firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from '@react-native-firebase/functions';
import {
  childFamilyMembershipSchema,
  createChildInputSchema,
  createChildOutputSchema,
  createFamilyInputSchema,
  createFamilyOutputSchema,
  createOfferDraftInputSchema,
  createOfferDraftOutputSchema,
  createPairingSessionInputSchema,
  createPairingSessionOutputSchema,
  familySchema,
  familyCommandErrorCodes,
  offerCommandErrorCodes,
  pairingCommandErrorCodes,
  parentFamilyMembershipSchema,
  persistedChildProfileSchema,
  persistedParentProfileSchema,
  redeemPairingSessionInputSchema,
  redeemPairingSessionOutputSchema,
  type ChildFamilyMembership,
  type CreateChildInputValue,
  type CreateChildOutput,
  type CreateFamilyInputValue,
  type CreateFamilyOutput,
  type CreateOfferDraftInputValue,
  type CreateOfferDraftOutput,
  type CreatePairingSessionInputValue,
  type CreatePairingSessionOutput,
  type Family,
  type FamilyCommandErrorCode,
  type OfferCommandErrorCode,
  type ParentFamilyMembership,
  type PairingCommandErrorCode,
  type PersistedChildProfile,
  type PersistedParentProfile,
  type RedeemPairingSessionInputValue,
  type RedeemPairingSessionOutput,
} from '@chorex/domain';
import {
  firebaseDevelopmentProjectId,
  readFirebaseEmulatorConfig,
  type FirebaseEmulatorInput,
} from '@chorex/config';

interface DevelopmentFirebase {
  app: ReturnType<typeof getApp>;
  auth: ReturnType<typeof getAuth>;
  firestore: ReturnType<typeof getFirestore>;
  functions: ReturnType<typeof getFunctions>;
}

interface SetupState {
  fingerprint: string;
  services?: DevelopmentFirebase;
  failure?: Error;
}

// Persist across module re-evaluation/Fast Refresh. Never repeat partial setup.
const registry = globalThis as typeof globalThis & {
  __chorexDevelopmentFirebase?: SetupState;
};

export const authErrorCodes = {
  invalidCredentials: 'INVALID_CREDENTIALS',
  invalidEmail: 'INVALID_EMAIL',
  emailAlreadyInUse: 'EMAIL_ALREADY_IN_USE',
  weakPassword: 'WEAK_PASSWORD',
  tooManyAttempts: 'TOO_MANY_ATTEMPTS',
  networkUnavailable: 'NETWORK_UNAVAILABLE',
  unknown: 'UNKNOWN_AUTH_FAILURE',
} as const;

export type AuthErrorCode =
  (typeof authErrorCodes)[keyof typeof authErrorCodes];

export interface AuthUser {
  readonly uid: string;
  readonly email: string | null;
}

export interface AuthCredentials {
  readonly email: string;
  readonly password: string;
}

export class AuthClientError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthClientError';
  }
}

export const familyClientErrorCodes = {
  ...familyCommandErrorCodes,
  ...offerCommandErrorCodes,
  ...pairingCommandErrorCodes,
  multipleFamiliesUnsupported: 'MULTIPLE_FAMILIES_UNSUPPORTED',
  networkUnavailable: 'NETWORK_UNAVAILABLE',
  profileReadFailed: 'PROFILE_READ_FAILED',
  unknown: 'UNKNOWN_FAMILY_FAILURE',
} as const;

export type FamilyClientErrorCode =
  (typeof familyClientErrorCodes)[keyof typeof familyClientErrorCodes];

export class FamilyClientError extends Error {
  constructor(readonly code: FamilyClientErrorCode) {
    super(code);
    this.name = 'FamilyClientError';
  }
}

export const pairingClientErrorCodes = {
  ...pairingCommandErrorCodes,
  networkUnavailable: 'NETWORK_UNAVAILABLE',
  unknown: 'UNKNOWN_PAIRING_FAILURE',
} as const;

export type PairingClientErrorCode =
  (typeof pairingClientErrorCodes)[keyof typeof pairingClientErrorCodes];

export class PairingClientError extends Error {
  constructor(readonly code: PairingClientErrorCode) {
    super(code);
    this.name = 'PairingClientError';
  }
}

export interface ParentFamilyHome {
  readonly profile: PersistedParentProfile;
  readonly family: Family;
  readonly membership: ParentFamilyMembership;
  readonly children: readonly ChildFamilyMembership[];
}

export interface ChildFamilyHome {
  readonly profile: PersistedChildProfile;
  readonly family: Family;
  readonly membership: ChildFamilyMembership;
}

export function initializeDevelopmentFirebase(
  input: FirebaseEmulatorInput,
): DevelopmentFirebase {
  const config = readFirebaseEmulatorConfig(input);
  const app = getApp();
  if (app.options.projectId !== firebaseDevelopmentProjectId) {
    throw new Error(
      'FIREBASE_PROJECT_MISMATCH: native configuration must identify chorex-dev.',
    );
  }
  const fingerprint = JSON.stringify({
    projectId: app.options.projectId,
    ...config,
  });
  const previous = registry.__chorexDevelopmentFirebase;
  if (previous) {
    if (previous.fingerprint !== fingerprint) {
      throw new Error(
        'FIREBASE_EMULATOR_CONFIG_CHANGED: restart the native app after changing emulator settings.',
      );
    }
    if (previous.failure) throw previous.failure;
    if (previous.services) return previous.services;
    throw new Error('FIREBASE_SETUP_INCOMPLETE: restart the native app.');
  }
  const state: SetupState = { fingerprint };
  registry.__chorexDevelopmentFirebase = state;
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${config.host}:${config.authPort}`);
    const firestore = getFirestore(app);
    connectFirestoreEmulator(firestore, config.host, config.firestorePort);
    const functions = getFunctions(app);
    connectFunctionsEmulator(functions, config.host, config.functionsPort);
    state.services = { app, auth, firestore, functions };
    // IDs/host routing only; never log configuration files, credentials, or tokens.
    console.info(
      `Firebase emulator setup ready: ${firebaseDevelopmentProjectId} at ${config.host}`,
    );
    return state.services;
  } catch (error) {
    state.failure =
      error instanceof Error ? error : new Error('FIREBASE_SETUP_FAILED');
    throw state.failure;
  }
}

function getInitializedAuth() {
  const state = registry.__chorexDevelopmentFirebase;
  if (state?.services) return state.services.auth;
  if (state?.failure) throw state.failure;
  throw new Error(
    'FIREBASE_SETUP_REQUIRED: initialize development Firebase before using Auth.',
  );
}

function getInitializedFirestore() {
  const state = registry.__chorexDevelopmentFirebase;
  if (state?.services) return state.services.firestore;
  if (state?.failure) throw state.failure;
  throw new Error(
    'FIREBASE_SETUP_REQUIRED: initialize development Firebase before using Firestore.',
  );
}

function getInitializedFunctions() {
  const state = registry.__chorexDevelopmentFirebase;
  if (state?.services) return state.services.functions;
  if (state?.failure) throw state.failure;
  throw new Error(
    'FIREBASE_SETUP_REQUIRED: initialize development Firebase before using Functions.',
  );
}

function toAuthUser(user: Pick<User, 'uid' | 'email'>): AuthUser {
  return { uid: user.uid, email: user.email };
}

function readProviderErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}

function translateAuthError(error: unknown): AuthClientError {
  if (error instanceof AuthClientError) return error;
  switch (readProviderErrorCode(error)) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return new AuthClientError(authErrorCodes.invalidCredentials);
    case 'auth/invalid-email':
      return new AuthClientError(authErrorCodes.invalidEmail);
    case 'auth/email-already-in-use':
      return new AuthClientError(authErrorCodes.emailAlreadyInUse);
    case 'auth/weak-password':
      return new AuthClientError(authErrorCodes.weakPassword);
    case 'auth/too-many-requests':
      return new AuthClientError(authErrorCodes.tooManyAttempts);
    case 'auth/network-request-failed':
      return new AuthClientError(authErrorCodes.networkUnavailable);
    default:
      return new AuthClientError(authErrorCodes.unknown);
  }
}

export function isAuthClientError(error: unknown): error is AuthClientError {
  return error instanceof AuthClientError;
}

export function observeAuthState(
  listener: (user: AuthUser | null) => void,
  onError: (error: AuthClientError) => void,
): () => void {
  try {
    return firebaseOnAuthStateChanged(
      getInitializedAuth(),
      (user) => listener(user ? toAuthUser(user) : null),
      (error) => onError(translateAuthError(error)),
    );
  } catch (error) {
    onError(translateAuthError(error));
    return () => undefined;
  }
}

export async function registerWithEmailAndPassword(
  credentials: AuthCredentials,
): Promise<AuthUser> {
  try {
    const result = await firebaseCreateUserWithEmailAndPassword(
      getInitializedAuth(),
      credentials.email,
      credentials.password,
    );
    return toAuthUser(result.user);
  } catch (error) {
    throw translateAuthError(error);
  }
}

export async function signInWithEmailAndPassword(
  credentials: AuthCredentials,
): Promise<AuthUser> {
  try {
    const result = await firebaseSignInWithEmailAndPassword(
      getInitializedAuth(),
      credentials.email,
      credentials.password,
    );
    return toAuthUser(result.user);
  } catch (error) {
    throw translateAuthError(error);
  }
}

export async function signInWithChildCustomToken(
  customToken: string,
): Promise<AuthUser> {
  try {
    const result = await firebaseSignInWithCustomToken(
      getInitializedAuth(),
      customToken,
    );
    return toAuthUser(result.user);
  } catch (error) {
    throw translateAuthError(error);
  }
}

export async function signOutCurrentUser(): Promise<void> {
  try {
    await firebaseSignOut(getInitializedAuth());
  } catch (error) {
    throw translateAuthError(error);
  }
}

function readStableFamilyErrorCode(
  error: unknown,
):
  | FamilyCommandErrorCode
  | OfferCommandErrorCode
  | PairingCommandErrorCode
  | undefined {
  if (typeof error !== 'object' || error === null || !('details' in error)) {
    return undefined;
  }
  const details = error.details;
  if (typeof details !== 'object' || details === null || !('code' in details)) {
    return undefined;
  }
  const code = details.code;
  return [
    ...Object.values(familyCommandErrorCodes),
    ...Object.values(offerCommandErrorCodes),
    ...Object.values(pairingCommandErrorCodes),
  ].find((value) => value === code);
}

function translateFamilyError(error: unknown): FamilyClientError {
  if (error instanceof FamilyClientError) return error;
  const stableCode = readStableFamilyErrorCode(error);
  if (stableCode) return new FamilyClientError(stableCode);
  const providerCode = readProviderErrorCode(error);
  if (
    providerCode === 'functions/unavailable' ||
    providerCode === 'firestore/unavailable' ||
    providerCode === 'firestore/network-request-failed'
  ) {
    return new FamilyClientError(familyClientErrorCodes.networkUnavailable);
  }
  return new FamilyClientError(familyClientErrorCodes.unknown);
}

function translatePairingError(error: unknown): PairingClientError {
  if (error instanceof PairingClientError) return error;
  const stableCode = readStableFamilyErrorCode(error);
  if (
    stableCode &&
    Object.values(pairingCommandErrorCodes).some(
      (value) => value === stableCode,
    )
  ) {
    return new PairingClientError(stableCode as PairingCommandErrorCode);
  }
  if (readProviderErrorCode(error) === 'functions/unavailable') {
    return new PairingClientError(pairingClientErrorCodes.networkUnavailable);
  }
  return new PairingClientError(pairingClientErrorCodes.unknown);
}

export function isPairingClientError(
  error: unknown,
): error is PairingClientError {
  return error instanceof PairingClientError;
}

function timestampToIso(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('toDate' in value) ||
    typeof value.toDate !== 'function'
  ) {
    throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
  }
  const date = value.toDate();
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) {
    throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
  }
  return date.toISOString();
}

export function isFamilyClientError(
  error: unknown,
): error is FamilyClientError {
  return error instanceof FamilyClientError;
}

interface ParentProfileProjection {
  profile: PersistedParentProfile;
  familyIds: string[];
}

interface ChildProfileProjection {
  profile: PersistedChildProfile;
  familyIds: string[];
}

function parseFamilyIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((familyId) => typeof familyId !== 'string' || !familyId) ||
    new Set(value).size !== value.length
  ) {
    throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
  }
  return value;
}

async function readCurrentParentProfileProjection(): Promise<ParentProfileProjection | null> {
  const user = getInitializedAuth().currentUser;
  if (!user) {
    throw new FamilyClientError(familyClientErrorCodes.authRequired);
  }
  try {
    const snapshot = await getDoc(
      doc(getInitializedFirestore(), 'users', user.uid),
    );
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    if (data.accountType === 'CHILD') {
      throw new FamilyClientError(familyClientErrorCodes.wrongActorRole);
    }
    return {
      profile: persistedParentProfileSchema.parse({
        uid: user.uid,
        displayName: data.displayName,
        accountType: data.accountType,
        createdAt: timestampToIso(data.createdAt),
      }),
      familyIds: parseFamilyIds(data.familyIds),
    };
  } catch (error) {
    if (error instanceof FamilyClientError) throw error;
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
    }
    throw translateFamilyError(error);
  }
}

export async function readCurrentParentProfile(): Promise<PersistedParentProfile | null> {
  return (await readCurrentParentProfileProjection())?.profile ?? null;
}

async function readCurrentChildProfileProjection(): Promise<ChildProfileProjection> {
  const user = getInitializedAuth().currentUser;
  if (!user) {
    throw new FamilyClientError(familyClientErrorCodes.authRequired);
  }
  try {
    const snapshot = await getDoc(
      doc(getInitializedFirestore(), 'users', user.uid),
    );
    if (!snapshot.exists()) {
      throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
    }
    const data = snapshot.data();
    if (data.accountType !== 'CHILD') {
      throw new FamilyClientError(familyClientErrorCodes.wrongActorRole);
    }
    return {
      profile: persistedChildProfileSchema.parse({
        uid: user.uid,
        displayName: data.displayName,
        accountType: data.accountType,
        createdAt: timestampToIso(data.createdAt),
      }),
      familyIds: parseFamilyIds(data.familyIds),
    };
  } catch (error) {
    if (error instanceof FamilyClientError) throw error;
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
    }
    throw translateFamilyError(error);
  }
}

export async function readCurrentChildFamily(): Promise<ChildFamilyHome> {
  const projection = await readCurrentChildProfileProjection();
  if (projection.familyIds.length === 0) {
    throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
  }
  if (projection.familyIds.length > 1) {
    throw new FamilyClientError(
      familyClientErrorCodes.multipleFamiliesUnsupported,
    );
  }

  const familyId = projection.familyIds[0];
  try {
    const firestore = getInitializedFirestore();
    const [familySnapshot, membershipSnapshot] = await Promise.all([
      getDoc(doc(firestore, 'families', familyId)),
      getDoc(
        doc(firestore, 'families', familyId, 'members', projection.profile.uid),
      ),
    ]);
    if (!familySnapshot.exists() || !membershipSnapshot.exists()) {
      throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
    }
    const familyData = familySnapshot.data();
    const membershipData = membershipSnapshot.data();
    return {
      profile: projection.profile,
      family: familySchema.parse({
        id: familyId,
        name: familyData.name,
        createdBy: familyData.createdBy,
        createdAt: timestampToIso(familyData.createdAt),
        updatedAt: timestampToIso(familyData.updatedAt),
      }),
      membership: childFamilyMembershipSchema.parse({
        uid: projection.profile.uid,
        familyId,
        role: membershipData.role,
        displayName: membershipData.displayName,
        status: membershipData.status,
        joinedAt: timestampToIso(membershipData.joinedAt),
      }),
    };
  } catch (error) {
    if (error instanceof FamilyClientError) throw error;
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
    }
    throw translateFamilyError(error);
  }
}

export async function readCurrentParentFamily(): Promise<ParentFamilyHome | null> {
  const projection = await readCurrentParentProfileProjection();
  if (!projection || projection.familyIds.length === 0) return null;
  if (projection.familyIds.length > 1) {
    throw new FamilyClientError(
      familyClientErrorCodes.multipleFamiliesUnsupported,
    );
  }

  const familyId = projection.familyIds[0];
  try {
    const firestore = getInitializedFirestore();
    const [familySnapshot, membershipSnapshot, childrenSnapshot] =
      await Promise.all([
        getDoc(doc(firestore, 'families', familyId)),
        getDoc(
          doc(
            firestore,
            'families',
            familyId,
            'members',
            projection.profile.uid,
          ),
        ),
        getDocs(
          query(
            collection(firestore, 'families', familyId, 'members'),
            where('role', '==', 'CHILD'),
            where('status', '==', 'ACTIVE'),
          ),
        ),
      ]);
    if (!familySnapshot.exists() || !membershipSnapshot.exists()) {
      throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
    }
    const familyData = familySnapshot.data();
    const membershipData = membershipSnapshot.data();
    return {
      profile: projection.profile,
      family: familySchema.parse({
        id: familyId,
        name: familyData.name,
        createdBy: familyData.createdBy,
        createdAt: timestampToIso(familyData.createdAt),
        updatedAt: timestampToIso(familyData.updatedAt),
      }),
      membership: parentFamilyMembershipSchema.parse({
        uid: projection.profile.uid,
        familyId,
        role: membershipData.role,
        displayName: membershipData.displayName,
        status: membershipData.status,
        joinedAt: timestampToIso(membershipData.joinedAt),
      }),
      children: childrenSnapshot.docs
        .map((childSnapshot) => {
          const childData = childSnapshot.data();
          return childFamilyMembershipSchema.parse({
            uid: childSnapshot.id,
            familyId,
            role: childData.role,
            displayName: childData.displayName,
            status: childData.status,
            joinedAt: timestampToIso(childData.joinedAt),
          });
        })
        .sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        ),
    };
  } catch (error) {
    if (error instanceof FamilyClientError) throw error;
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
    }
    throw translateFamilyError(error);
  }
}

export async function createFamily(
  rawInput: CreateFamilyInputValue,
): Promise<CreateFamilyOutput> {
  const parsedInput = createFamilyInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new FamilyClientError(familyClientErrorCodes.invalidInput);
  }
  try {
    const callable = httpsCallable<typeof parsedInput.data, unknown>(
      getInitializedFunctions(),
      'createFamily',
    );
    const result = await callable(parsedInput.data);
    return createFamilyOutputSchema.parse(result.data);
  } catch (error) {
    throw translateFamilyError(error);
  }
}

export async function createChild(
  rawInput: CreateChildInputValue,
): Promise<CreateChildOutput> {
  const parsedInput = createChildInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new FamilyClientError(familyClientErrorCodes.invalidInput);
  }
  try {
    const callable = httpsCallable<typeof parsedInput.data, unknown>(
      getInitializedFunctions(),
      'createChild',
    );
    const result = await callable(parsedInput.data);
    return createChildOutputSchema.parse(result.data);
  } catch (error) {
    throw translateFamilyError(error);
  }
}

export async function createOfferDraft(
  rawInput: CreateOfferDraftInputValue,
): Promise<CreateOfferDraftOutput> {
  const parsedInput = createOfferDraftInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new FamilyClientError(familyClientErrorCodes.invalidInput);
  }
  try {
    const callable = httpsCallable<typeof parsedInput.data, unknown>(
      getInitializedFunctions(),
      'createOfferDraft',
    );
    const result = await callable(parsedInput.data);
    return createOfferDraftOutputSchema.parse(result.data);
  } catch (error) {
    throw translateFamilyError(error);
  }
}

export async function createPairingSession(
  rawInput: CreatePairingSessionInputValue,
): Promise<CreatePairingSessionOutput> {
  const parsedInput = createPairingSessionInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new FamilyClientError(familyClientErrorCodes.invalidInput);
  }
  try {
    const callable = httpsCallable<typeof parsedInput.data, unknown>(
      getInitializedFunctions(),
      'createPairingSession',
    );
    const result = await callable(parsedInput.data);
    return createPairingSessionOutputSchema.parse(result.data);
  } catch (error) {
    throw translateFamilyError(error);
  }
}

export async function redeemPairingSession(
  rawInput: RedeemPairingSessionInputValue,
): Promise<RedeemPairingSessionOutput> {
  const parsedInput = redeemPairingSessionInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new PairingClientError(pairingClientErrorCodes.invalidInput);
  }
  try {
    const callable = httpsCallable<typeof parsedInput.data, unknown>(
      getInitializedFunctions(),
      'redeemPairingSession',
    );
    const result = await callable(parsedInput.data);
    return redeemPairingSessionOutputSchema.parse(result.data);
  } catch (error) {
    throw translatePairingError(error);
  }
}
