import {
  recordOperationalError,
  setObservabilityContext,
  logDiagnosticBreadcrumb,
  type DiagnosticOperation,
} from './observabilityCore';
import {
  reminderPreferenceEnabled,
  reminderPreferenceData,
  pushDeviceMetadataSchema,
} from '@chorex/domain';
import { deserializeReward } from './rewardReadModel';
import {
  ContractReadError,
  deserializeContract,
  deserializeTasks,
  translateContractReadError,
  deserializeContractReview,
  deserializeContractReviews,
  type ReadSnapshot,
} from './contractReadModel';
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
  runTransaction,
  serverTimestamp,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from '@react-native-firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from '@react-native-firebase/functions';
import {
  markRewardDeliveredInputSchema,
  confirmRewardReceivedOutputSchema,
  type ConfirmRewardReceivedInputValue,
  type ConfirmRewardReceivedOutput,
  markRewardDeliveredOutputSchema,
  rewardCommandErrorCodes,
  type RewardCommandErrorCode,
  type MarkRewardDeliveredInputValue,
  type MarkRewardDeliveredOutput,
  type EarnedReward,
  requestContractChangesInputSchema,
  requestContractChangesOutputSchema,
  type RequestContractChangesInputValue,
  type RequestContractChangesOutput,
  type ContractReview,
  approveContractInputSchema,
  approveContractOutputSchema,
  type ApproveContractInputValue,
  type ApproveContractOutput,
  submitContractForReviewInputSchema,
  submitContractForReviewOutputSchema,
  type SubmitContractForReviewInputValue,
  type SubmitContractForReviewOutput,
  contractCommandErrorCodes,
  recordTaskCompletionInputSchema,
  recordTaskCompletionOutputSchema,
  type ContractCommandErrorCode,
  type RecordTaskCompletionInputValue,
  type RecordTaskCompletionOutput,
  acceptOfferInputSchema,
  acceptOfferOutputSchema,
  childFamilyMembershipSchema,
  childOfferInboxItemSchema,
  counterOfferInputSchema,
  counterOfferOutputSchema,
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
  parentNegotiationInboxItemSchema,
  persistedChildProfileSchema,
  persistedParentProfileSchema,
  publishOfferInputSchema,
  publishOfferOutputSchema,
  redeemPairingSessionInputSchema,
  redeemPairingSessionOutputSchema,
  rejectOfferInputSchema,
  rejectOfferOutputSchema,
  type AcceptOfferInputValue,
  type AcceptOfferOutput,
  type ChildFamilyMembership,
  type ChildOfferInboxItem,
  type Contract,
  type ContractTask,
  type CounterOfferInputValue,
  type CounterOfferOutput,
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
  type ParentNegotiationInboxItem,
  type PairingCommandErrorCode,
  type PersistedChildProfile,
  type PersistedParentProfile,
  type PublishOfferInputValue,
  type PublishOfferOutput,
  type RedeemPairingSessionInputValue,
  type RedeemPairingSessionOutput,
  type RejectOfferInputValue,
  type RejectOfferOutput,
} from '@chorex/domain';
import {
  firebaseDevelopmentProjectId,
  readFirebaseEmulatorConfig,
  type FirebaseEmulatorInput,
} from '@chorex/config';
import { createLatestSnapshotCoordinator } from './latestSnapshot';
import {
  getToken,
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';
import {
  readFirebaseBootstrapConfig,
  type FirebaseBootstrapInput,
} from '@chorex/config/app-check';

function reportClientFailure<T extends { code: string }>(
  original: unknown,
  normalized: T,
  operation: DiagnosticOperation,
): T {
  recordOperationalError(original, operation, normalized.code);
  return normalized;
}

export type {
  AcceptOfferOutput,
  ChildOfferInboxItem,
  CounterOfferOutput,
  ParentNegotiationInboxItem,
  RejectOfferOutput,
};

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
  __chorexFirebaseBootstrap?: {
    fingerprint: string;
    ready: Promise<DevelopmentFirebase>;
  };
};

// Schedule native provider setup before session listeners or commands mount.
// Cache the promise (including failure) across renders/Fast Refresh; never retry partial setup.
export function initializeFirebase(
  input: FirebaseBootstrapInput,
  developmentBuild: boolean,
): Promise<DevelopmentFirebase> {
  const config = readFirebaseBootstrapConfig(input, developmentBuild);
  const fingerprint = JSON.stringify(config);
  const previous = registry.__chorexFirebaseBootstrap;
  if (previous) {
    if (previous.fingerprint !== fingerprint)
      throw new Error(
        'FIREBASE_BOOTSTRAP_CONFIG_CHANGED: restart the native app.',
      );
    return previous.ready;
  }
  const ready = (async () => {
    const app = getApp();
    if (app.options.projectId !== config.projectId)
      throw new Error('FIREBASE_PROJECT_MISMATCH');
    const provider = new ReactNativeFirebaseAppCheckProvider();
    provider.configure({
      apple: config.appCheck.apple,
      android: config.appCheck.android,
    });
    const appCheck = initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: config.appCheck.isTokenAutoRefreshEnabled,
    });
    if (config.mode === 'emulator') return initializeDevelopmentFirebase(input);
    // In 26.4.0 the modular initializer returns synchronously while native setup
    // continues. Release services require an actual token, not an awaited object.
    // Retry only the SDK's transient provider-not-ready startup response; all
    // attestation/configuration errors fail closed. Never retain or log the token.
    for (let attempt = 0; ; attempt += 1) {
      try {
        await getToken(appCheck);
        break;
      } catch (error) {
        if (
          attempt >= 20 ||
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 'appCheck/provider-not-ready'
        )
          throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
    }
    const services = {
      app,
      auth: getAuth(app),
      firestore: getFirestore(app),
      functions: getFunctions(app),
    };
    registry.__chorexDevelopmentFirebase = { fingerprint, services };
    return services;
  })()
    .then((services) => {
      logDiagnosticBreadcrumb('bootstrap_completed');
      return services;
    })
    .catch((error) => {
      recordOperationalError(error, 'bootstrap', 'FIREBASE_BOOTSTRAP_FAILED');
      // SDK errors may contain attestation/request details. Expose only a stable setup code.
      throw new Error(
        'FIREBASE_BOOTSTRAP_FAILED: restart the native app and verify configuration.',
      );
    });
  registry.__chorexFirebaseBootstrap = { fingerprint, ready };
  return ready;
}

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

export const offerInboxClientErrorCodes = {
  authRequired: 'AUTH_REQUIRED',
  networkUnavailable: 'NETWORK_UNAVAILABLE',
  readFailed: 'OFFER_INBOX_READ_FAILED',
  malformedData: 'MALFORMED_OFFER_DATA',
} as const;

export type OfferInboxClientErrorCode =
  (typeof offerInboxClientErrorCodes)[keyof typeof offerInboxClientErrorCodes];

export class OfferInboxClientError extends Error {
  constructor(readonly code: OfferInboxClientErrorCode) {
    super(code);
    this.name = 'OfferInboxClientError';
  }
}

export function isOfferInboxClientError(
  error: unknown,
): error is OfferInboxClientError {
  return error instanceof OfferInboxClientError;
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

function initializeDevelopmentFirebase(
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
      (user) => {
        setObservabilityContext({ authenticated: Boolean(user) });
        logDiagnosticBreadcrumb(user ? 'authenticated' : 'unauthenticated');
        listener(user ? toAuthUser(user) : null);
      },
      (error) =>
        onError(reportClientFailure(error, translateAuthError(error), 'auth')),
    );
  } catch (error) {
    onError(reportClientFailure(error, translateAuthError(error), 'auth'));
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
    throw reportClientFailure(error, translateAuthError(error), 'auth');
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
    throw reportClientFailure(error, translateAuthError(error), 'auth');
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
    throw reportClientFailure(error, translateAuthError(error), 'auth');
  }
}

export async function signOutCurrentUser(): Promise<void> {
  try {
    await firebaseSignOut(getInitializedAuth());
  } catch (error) {
    throw reportClientFailure(error, translateAuthError(error), 'auth');
  }
}

function readCallableDetailsCode(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('details' in error))
    return undefined;
  const details = error.details;
  return typeof details === 'object' && details !== null && 'code' in details
    ? details.code
    : undefined;
}

function readStableFamilyErrorCode(
  error: unknown,
):
  | FamilyCommandErrorCode
  | OfferCommandErrorCode
  | PairingCommandErrorCode
  | undefined {
  const code = readCallableDetailsCode(error);
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
    if (error instanceof FamilyClientError)
      throw reportClientFailure(error, error, 'familyRead');
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      recordOperationalError(error, 'familyRead', 'PROFILE_READ_FAILED');
      throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
    }
    throw reportClientFailure(error, translateFamilyError(error), 'familyRead');
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
    if (error instanceof FamilyClientError)
      throw reportClientFailure(error, error, 'familyRead');
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      recordOperationalError(error, 'familyRead', 'PROFILE_READ_FAILED');
      throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
    }
    throw reportClientFailure(error, translateFamilyError(error), 'familyRead');
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
    if (error instanceof FamilyClientError)
      throw reportClientFailure(error, error, 'familyRead');
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      recordOperationalError(error, 'familyRead', 'PROFILE_READ_FAILED');
      throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
    }
    throw reportClientFailure(error, translateFamilyError(error), 'familyRead');
  }
}

function requireOfferSubscriptionContext(familyId: string): AuthUser {
  const user = getInitializedAuth().currentUser;
  if (!user) {
    throw new OfferInboxClientError(offerInboxClientErrorCodes.authRequired);
  }
  if (!familyId.trim() || familyId.length > 128) {
    throw new OfferInboxClientError(offerInboxClientErrorCodes.readFailed);
  }
  return toAuthUser(user);
}

function translateOfferInboxError(error: unknown): OfferInboxClientError {
  if (error instanceof OfferInboxClientError) return error;
  if (error instanceof FamilyClientError) {
    return new OfferInboxClientError(offerInboxClientErrorCodes.malformedData);
  }
  if (typeof error === 'object' && error !== null && 'issues' in error) {
    return new OfferInboxClientError(offerInboxClientErrorCodes.malformedData);
  }
  const translated = translateFamilyError(error);
  if (translated.code === familyClientErrorCodes.networkUnavailable) {
    return new OfferInboxClientError(
      offerInboxClientErrorCodes.networkUnavailable,
    );
  }
  return new OfferInboxClientError(offerInboxClientErrorCodes.readFailed);
}

async function loadOfferInboxItem<T>(
  firestore: Firestore,
  offerSnapshot: QueryDocumentSnapshot<DocumentData, DocumentData>,
  parseItem: (input: unknown) => T,
): Promise<T> {
  const offerData = offerSnapshot.data();
  if (
    typeof offerData.currentRevisionId !== 'string' ||
    !offerData.currentRevisionId
  ) {
    throw new OfferInboxClientError(offerInboxClientErrorCodes.malformedData);
  }
  const revisionSnapshot = await getDoc(
    doc(
      firestore,
      'offers',
      offerSnapshot.id,
      'revisions',
      offerData.currentRevisionId,
    ),
  );
  if (!revisionSnapshot.exists()) {
    throw new OfferInboxClientError(offerInboxClientErrorCodes.malformedData);
  }
  const revisionData = revisionSnapshot.data();

  return parseItem({
    offer: {
      id: offerSnapshot.id,
      familyId: offerData.familyId,
      parentUid: offerData.parentUid,
      childUid: offerData.childUid,
      status: offerData.status,
      currentRevisionId: offerData.currentRevisionId,
      ...(offerData.expiresAt === undefined
        ? {}
        : { expiresAt: timestampToIso(offerData.expiresAt) }),
      createdAt: timestampToIso(offerData.createdAt),
      updatedAt: timestampToIso(offerData.updatedAt),
    },
    revision: {
      id: revisionSnapshot.id,
      offerId: offerSnapshot.id,
      revisionNumber: revisionData.revisionNumber,
      proposedByUid: revisionData.proposedByUid,
      proposedByRole: revisionData.proposedByRole,
      tasks: revisionData.tasks,
      reward: revisionData.reward,
      deadlineAt: timestampToIso(revisionData.deadlineAt),
      ...(revisionData.note === undefined ? {} : { note: revisionData.note }),
      createdAt: timestampToIso(revisionData.createdAt),
    },
  });
}

function subscribeToOfferInbox<T>(
  firestore: Firestore,
  offersQuery: Query<DocumentData, DocumentData>,
  parseItem: (input: unknown) => T,
  onItems: (items: readonly T[]) => void,
  onError: (error: OfferInboxClientError) => void,
): () => void {
  const coordinator = createLatestSnapshotCoordinator(
    (snapshot: QuerySnapshot<DocumentData, DocumentData>) =>
      Promise.all(
        snapshot.docs.map((offerSnapshot) =>
          loadOfferInboxItem(firestore, offerSnapshot, parseItem),
        ),
      ),
    onItems,
    (error) =>
      onError(
        reportClientFailure(
          error,
          translateOfferInboxError(error),
          'offerRead',
        ),
      ),
  );

  let unsubscribe: () => void;
  try {
    unsubscribe = onSnapshot(offersQuery, coordinator.push, coordinator.fail);
  } catch (error) {
    coordinator.stop();
    throw reportClientFailure(
      error,
      translateOfferInboxError(error),
      'offerRead',
    );
  }

  return () => {
    coordinator.stop();
    unsubscribe();
  };
}

export function subscribeToCurrentChildOfferInbox(
  familyId: string,
  onItems: (items: readonly ChildOfferInboxItem[]) => void,
  onError: (error: OfferInboxClientError) => void,
): () => void {
  const user = requireOfferSubscriptionContext(familyId);
  const firestore = getInitializedFirestore();
  const offersQuery = query(
    collection(firestore, 'offers'),
    where('familyId', '==', familyId),
    where('participantUids', 'array-contains', user.uid),
    where('status', '==', 'AWAITING_CHILD'),
    orderBy('updatedAt', 'desc'),
  );

  return subscribeToOfferInbox(
    firestore,
    offersQuery,
    (input) => childOfferInboxItemSchema.parse(input),
    onItems,
    onError,
  );
}

export function subscribeToCurrentParentNegotiationInbox(
  familyId: string,
  onItems: (items: readonly ParentNegotiationInboxItem[]) => void,
  onError: (error: OfferInboxClientError) => void,
): () => void {
  const user = requireOfferSubscriptionContext(familyId);
  const firestore = getInitializedFirestore();
  const offersQuery = query(
    collection(firestore, 'offers'),
    where('familyId', '==', familyId),
    where('parentUid', '==', user.uid),
    where('participantUids', 'array-contains', user.uid),
    where('status', '==', 'AWAITING_PARENT'),
    orderBy('updatedAt', 'desc'),
  );

  return subscribeToOfferInbox(
    firestore,
    offersQuery,
    (input) => parentNegotiationInboxItemSchema.parse(input),
    onItems,
    onError,
  );
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
    if (error instanceof FamilyClientError)
      throw reportClientFailure(error, error, 'familyRead');
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      recordOperationalError(error, 'familyRead', 'PROFILE_READ_FAILED');
      throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
    }
    throw reportClientFailure(error, translateFamilyError(error), 'familyRead');
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
    throw reportClientFailure(
      error,
      translateFamilyError(error),
      'createFamily',
    );
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
    throw reportClientFailure(
      error,
      translateFamilyError(error),
      'createChild',
    );
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
    throw reportClientFailure(
      error,
      translateFamilyError(error),
      'createOfferDraft',
    );
  }
}

export async function publishOffer(
  rawInput: PublishOfferInputValue,
): Promise<PublishOfferOutput> {
  const parsedInput = publishOfferInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new FamilyClientError(familyClientErrorCodes.invalidInput);
  }
  try {
    const callable = httpsCallable<typeof parsedInput.data, unknown>(
      getInitializedFunctions(),
      'publishOffer',
    );
    const result = await callable(parsedInput.data);
    return publishOfferOutputSchema.parse(result.data);
  } catch (error) {
    throw reportClientFailure(
      error,
      translateFamilyError(error),
      'publishOffer',
    );
  }
}

export async function acceptOffer(
  rawInput: AcceptOfferInputValue,
): Promise<AcceptOfferOutput> {
  const parsedInput = acceptOfferInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new FamilyClientError(familyClientErrorCodes.invalidInput);
  }
  try {
    const callable = httpsCallable<typeof parsedInput.data, unknown>(
      getInitializedFunctions(),
      'acceptOffer',
    );
    const result = await callable(parsedInput.data);
    return acceptOfferOutputSchema.parse(result.data);
  } catch (error) {
    throw reportClientFailure(
      error,
      translateFamilyError(error),
      'acceptOffer',
    );
  }
}

export async function rejectOffer(
  rawInput: RejectOfferInputValue,
): Promise<RejectOfferOutput> {
  const parsedInput = rejectOfferInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new FamilyClientError(familyClientErrorCodes.invalidInput);
  }
  try {
    const callable = httpsCallable<typeof parsedInput.data, unknown>(
      getInitializedFunctions(),
      'rejectOffer',
    );
    const result = await callable(parsedInput.data);
    return rejectOfferOutputSchema.parse(result.data);
  } catch (error) {
    throw reportClientFailure(
      error,
      translateFamilyError(error),
      'rejectOffer',
    );
  }
}

export async function counterOffer(
  rawInput: CounterOfferInputValue,
): Promise<CounterOfferOutput> {
  const parsedInput = counterOfferInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new FamilyClientError(familyClientErrorCodes.invalidInput);
  }
  try {
    const callable = httpsCallable<typeof parsedInput.data, unknown>(
      getInitializedFunctions(),
      'counterOffer',
    );
    const result = await callable(parsedInput.data);
    return counterOfferOutputSchema.parse(result.data);
  } catch (error) {
    throw reportClientFailure(
      error,
      translateFamilyError(error),
      'counterOffer',
    );
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
    throw reportClientFailure(
      error,
      translateFamilyError(error),
      'createPairingSession',
    );
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
    throw reportClientFailure(
      error,
      translatePairingError(error),
      'redeemPairingSession',
    );
  }
}

export {
  ContractReadError,
  deserializeContract,
  deserializeTasks,
  type ReadSnapshot,
} from './contractReadModel';

function requireContractReadContext(id: string): string {
  const user = getInitializedAuth().currentUser;
  if (!user) throw new ContractReadError('AUTH_REQUIRED');
  if (!id.trim() || id !== id.trim() || id.length > 128 || id.includes('/'))
    throw new ContractReadError('INVALID_INPUT');
  return user.uid;
}

export function observeContract(
  contractId: string,
  callback: (snapshot: ReadSnapshot<Contract | null>) => void,
  onError: (error: ContractReadError) => void,
): () => void {
  const uid = requireContractReadContext(contractId);
  try {
    return onSnapshot(
      doc(getInitializedFirestore(), 'contracts', contractId),
      { includeMetadataChanges: true },
      (snapshot) => {
        try {
          const contract = snapshot.exists()
            ? deserializeContract(snapshot.id, snapshot.data()!)
            : null;
          if (
            contract &&
            contract.parentUid !== uid &&
            contract.childUid !== uid
          )
            throw new ContractReadError('FORBIDDEN');
          callback({ data: contract, fromCache: snapshot.metadata.fromCache });
        } catch (error) {
          onError(translateContractReadError(error));
        }
      },
      (error) => onError(translateContractReadError(error)),
    );
  } catch (error) {
    throw translateContractReadError(error);
  }
}

export function observeTasks(
  contractId: string,
  callback: (snapshot: ReadSnapshot<readonly ContractTask[]>) => void,
  onError: (error: ContractReadError) => void,
): () => void {
  requireContractReadContext(contractId);
  try {
    return onSnapshot(
      collection(getInitializedFirestore(), 'contracts', contractId, 'tasks'),
      { includeMetadataChanges: true },
      (snapshot) => {
        try {
          callback({
            data: deserializeTasks(
              contractId,
              snapshot.docs.map((item) => ({ id: item.id, data: item.data() })),
            ),
            fromCache: snapshot.metadata.fromCache,
          });
        } catch (error) {
          onError(translateContractReadError(error));
        }
      },
      (error) => onError(translateContractReadError(error)),
    );
  } catch (error) {
    throw translateContractReadError(error);
  }
}

export function observeActiveContracts(
  familyId: string,
  callback: (snapshot: ReadSnapshot<readonly Contract[]>) => void,
  onError: (error: ContractReadError) => void,
): () => void {
  return observeContractsInState(familyId, 'ACTIVE', callback, onError);
}
export function observeReadyForReviewContracts(
  familyId: string,
  callback: (snapshot: ReadSnapshot<readonly Contract[]>) => void,
  onError: (error: ContractReadError) => void,
): () => void {
  return observeContractsInState(
    familyId,
    'READY_FOR_REVIEW',
    callback,
    onError,
  );
}
function observeContractsInState(
  familyId: string,
  status: 'ACTIVE' | 'READY_FOR_REVIEW',
  callback: (snapshot: ReadSnapshot<readonly Contract[]>) => void,
  onError: (error: ContractReadError) => void,
): () => void {
  const uid = requireContractReadContext(familyId);
  const contractsQuery = query(
    collection(getInitializedFirestore(), 'contracts'),
    where('familyId', '==', familyId),
    where('participantUids', 'array-contains', uid),
    where('status', '==', status),
    orderBy('createdAt', 'desc'),
  );
  try {
    return onSnapshot(
      contractsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        try {
          const contracts = snapshot.docs.map((item) =>
            deserializeContract(item.id, item.data()),
          );
          if (
            contracts.some(
              (item) =>
                item.familyId !== familyId ||
                item.status !== status ||
                (item.parentUid !== uid && item.childUid !== uid),
            )
          )
            throw new ContractReadError('MALFORMED_DATA');
          callback({ data: contracts, fromCache: snapshot.metadata.fromCache });
        } catch (error) {
          onError(translateContractReadError(error));
        }
      },
      (error) => onError(translateContractReadError(error)),
    );
  } catch (error) {
    throw translateContractReadError(error);
  }
}

export {
  useContractDetail,
  useActiveContracts,
  useReadyForReviewContracts,
  useCurrentContractReview,
  type CurrentContractReviewState,
  type ContractDetailState,
  type ActiveContractsState,
} from './contractHooks';

export const contractClientErrorCodes = {
  ...contractCommandErrorCodes,
  networkUnavailable: 'NETWORK_UNAVAILABLE',
  unknown: 'UNKNOWN_CONTRACT_FAILURE',
} as const;
export type ContractClientErrorCode =
  | ContractCommandErrorCode
  | typeof contractClientErrorCodes.networkUnavailable
  | typeof contractClientErrorCodes.unknown;
export class ContractClientError extends Error {
  constructor(readonly code: ContractClientErrorCode) {
    super(code);
    this.name = 'ContractClientError';
  }
}
export function isContractClientError(
  error: unknown,
): error is ContractClientError {
  return error instanceof ContractClientError;
}
export async function recordTaskCompletion(
  rawInput: RecordTaskCompletionInputValue,
): Promise<RecordTaskCompletionOutput> {
  if (!getInitializedAuth().currentUser)
    throw new ContractClientError(contractClientErrorCodes.authRequired);
  const parsed = recordTaskCompletionInputSchema.safeParse(rawInput);
  if (!parsed.success)
    throw new ContractClientError(contractClientErrorCodes.invalidInput);
  try {
    const callable = httpsCallable<typeof parsed.data, unknown>(
      getInitializedFunctions(),
      'recordTaskCompletion',
    );
    const result = await callable(parsed.data);
    const output = recordTaskCompletionOutputSchema.parse(result.data);
    if (
      output.task.contractId !== parsed.data.contractId ||
      output.task.id !== parsed.data.taskId
    )
      throw new ContractClientError(contractClientErrorCodes.unknown);
    return output;
  } catch (error) {
    throw reportClientFailure(
      error,
      translateContractCommandError(error),
      'recordTaskCompletion',
    );
  }
}

function translateContractCommandError(error: unknown): ContractClientError {
  if (error instanceof ContractClientError) return error;
  const stableCode = readCallableDetailsCode(error);
  if (
    stableCode &&
    Object.values(contractCommandErrorCodes).some((code) => code === stableCode)
  )
    return new ContractClientError(stableCode as ContractCommandErrorCode);
  const providerCode = readProviderErrorCode(error);
  if (providerCode === 'functions/unauthenticated')
    return new ContractClientError(contractClientErrorCodes.authRequired);
  if (providerCode === 'functions/permission-denied')
    return new ContractClientError(contractClientErrorCodes.forbidden);
  if (
    providerCode === 'functions/unavailable' ||
    providerCode === 'functions/deadline-exceeded' ||
    providerCode === 'auth/network-request-failed'
  )
    return new ContractClientError(contractClientErrorCodes.networkUnavailable);
  return new ContractClientError(contractClientErrorCodes.unknown);
}

export async function submitContractForReview(
  rawInput: SubmitContractForReviewInputValue,
): Promise<SubmitContractForReviewOutput> {
  if (!getInitializedAuth().currentUser)
    throw new ContractClientError(contractClientErrorCodes.authRequired);
  const parsed = submitContractForReviewInputSchema.safeParse(rawInput);
  if (!parsed.success)
    throw new ContractClientError(contractClientErrorCodes.invalidInput);
  try {
    const callable = httpsCallable<typeof parsed.data, unknown>(
      getInitializedFunctions(),
      'submitContractForReview',
    );
    const result = await callable(parsed.data);
    const output = submitContractForReviewOutputSchema.parse(result.data);
    if (output.contract.id !== parsed.data.contractId)
      throw new ContractClientError(contractClientErrorCodes.unknown);
    return output;
  } catch (error) {
    throw reportClientFailure(
      error,
      translateContractCommandError(error),
      'submitContractForReview',
    );
  }
}

export async function approveContract(
  rawInput: ApproveContractInputValue,
): Promise<ApproveContractOutput> {
  if (!getInitializedAuth().currentUser)
    throw new ContractClientError(contractClientErrorCodes.authRequired);
  const parsed = approveContractInputSchema.safeParse(rawInput);
  if (!parsed.success)
    throw new ContractClientError(contractClientErrorCodes.invalidInput);
  try {
    const callable = httpsCallable<typeof parsed.data, unknown>(
      getInitializedFunctions(),
      'approveContract',
    );
    const result = await callable(parsed.data);
    const output = approveContractOutputSchema.parse(result.data);
    if (output.contract.id !== parsed.data.contractId)
      throw new ContractClientError(contractClientErrorCodes.unknown);
    return output;
  } catch (error) {
    throw reportClientFailure(
      error,
      translateContractCommandError(error),
      'approveContract',
    );
  }
}

export async function requestContractChanges(
  rawInput: RequestContractChangesInputValue,
): Promise<RequestContractChangesOutput> {
  if (!getInitializedAuth().currentUser)
    throw new ContractClientError(contractClientErrorCodes.authRequired);
  const parsed = requestContractChangesInputSchema.safeParse(rawInput);
  if (!parsed.success)
    throw new ContractClientError(contractClientErrorCodes.invalidInput);
  try {
    const callable = httpsCallable<typeof parsed.data, unknown>(
      getInitializedFunctions(),
      'requestContractChanges',
    );
    const response = await callable(parsed.data);
    const output = requestContractChangesOutputSchema.parse(response.data);
    if (output.contract.id !== parsed.data.contractId)
      throw new ContractClientError(contractClientErrorCodes.unknown);
    return output;
  } catch (error) {
    throw reportClientFailure(
      error,
      translateContractCommandError(error),
      'requestContractChanges',
    );
  }
}
export function observeCurrentContractReview(
  contract: Contract,
  callback: (snapshot: ReadSnapshot<ContractReview | null>) => void,
  onError: (error: ContractReadError) => void,
): () => void {
  const uid = requireContractReadContext(contract.id);
  if (uid !== contract.parentUid && uid !== contract.childUid)
    throw new ContractReadError('FORBIDDEN');
  const reviewQuery = query(
    collection(getInitializedFirestore(), 'contracts', contract.id, 'reviews'),
    where('familyId', '==', contract.familyId),
    where('contractId', '==', contract.id),
    where('cycle', '==', contract.reviewCycle),
    limit(2),
  );
  try {
    return onSnapshot(
      reviewQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        try {
          if (snapshot.docs.length > 1)
            throw new ContractReadError('MALFORMED_DATA');
          const item = snapshot.docs[0];
          const review = item
            ? deserializeContractReview(item.id, item.data(), contract)
            : null;
          callback({ data: review, fromCache: snapshot.metadata.fromCache });
        } catch (error) {
          onError(translateContractReadError(error));
        }
      },
      (error) => onError(translateContractReadError(error)),
    );
  } catch (error) {
    throw translateContractReadError(error);
  }
}

export { RewardReadError, deserializeReward } from './rewardReadModel';
export {
  usePendingRewards,
  useAwaitingRewards,
  useEarnedRewards,
  useRewardDetail,
  type RewardListState,
  type RewardDetailState,
} from './rewardHooks';
export class RewardClientError extends Error {
  constructor(
    readonly code:
      RewardCommandErrorCode | 'NETWORK_UNAVAILABLE' | 'UNKNOWN_REWARD_FAILURE',
  ) {
    super(code);
    this.name = 'RewardClientError';
  }
}
export function markRewardDelivered(
  rawInput: MarkRewardDeliveredInputValue,
): Promise<MarkRewardDeliveredOutput> {
  return executeRewardClientCommand(
    rawInput,
    'markRewardDelivered',
  ) as Promise<MarkRewardDeliveredOutput>;
}
export function confirmRewardReceived(
  rawInput: ConfirmRewardReceivedInputValue,
): Promise<ConfirmRewardReceivedOutput> {
  return executeRewardClientCommand(
    rawInput,
    'confirmRewardReceived',
  ) as Promise<ConfirmRewardReceivedOutput>;
}
async function executeRewardClientCommand(
  rawInput: MarkRewardDeliveredInputValue,
  command: 'markRewardDelivered' | 'confirmRewardReceived',
): Promise<MarkRewardDeliveredOutput | ConfirmRewardReceivedOutput> {
  if (!getInitializedAuth().currentUser)
    throw new RewardClientError('AUTH_REQUIRED');
  const input = markRewardDeliveredInputSchema.safeParse(rawInput);
  if (!input.success) throw new RewardClientError('INVALID_INPUT');
  try {
    const response = await httpsCallable<typeof input.data, unknown>(
      getInitializedFunctions(),
      command,
    )(input.data);
    const output = (
      command === 'markRewardDelivered'
        ? markRewardDeliveredOutputSchema
        : confirmRewardReceivedOutputSchema
    ).parse(response.data);
    if (output.reward.id !== input.data.rewardId)
      throw new RewardClientError('UNKNOWN_REWARD_FAILURE');
    return output;
  } catch (error) {
    if (error instanceof RewardClientError) {
      recordOperationalError(error, command, error.code);
      throw error;
    }
    const stable = readCallableDetailsCode(error);
    if (
      stable &&
      Object.values(rewardCommandErrorCodes).some((code) => code === stable)
    )
      throw new RewardClientError(stable as RewardCommandErrorCode);
    const provider = readProviderErrorCode(error);
    if (provider === 'functions/unauthenticated')
      throw new RewardClientError('AUTH_REQUIRED');
    if (provider === 'functions/permission-denied')
      throw new RewardClientError('FORBIDDEN');
    if (
      [
        'functions/unavailable',
        'functions/deadline-exceeded',
        'auth/network-request-failed',
      ].includes(provider ?? '')
    )
      throw new RewardClientError('NETWORK_UNAVAILABLE');
    recordOperationalError(error, command, 'UNKNOWN_REWARD_FAILURE');
    throw new RewardClientError('UNKNOWN_REWARD_FAILURE');
  }
}
export function observeReward(
  rewardId: string,
  callback: (snapshot: ReadSnapshot<EarnedReward | null>) => void,
  onError: (error: ContractReadError) => void,
): () => void {
  const uid = requireContractReadContext(rewardId);
  try {
    return onSnapshot(
      doc(getInitializedFirestore(), 'rewards', rewardId),
      { includeMetadataChanges: true },
      (snapshot) => {
        try {
          const reward = snapshot.exists()
            ? deserializeReward(snapshot.id, snapshot.data()!)
            : null;
          if (reward && reward.parentUid !== uid && reward.childUid !== uid)
            throw new ContractReadError('FORBIDDEN');
          callback({ data: reward, fromCache: snapshot.metadata.fromCache });
        } catch (error) {
          onError(translateContractReadError(error));
        }
      },
      (error) => onError(translateContractReadError(error)),
    );
  } catch (error) {
    throw translateContractReadError(error);
  }
}
export function observePendingRewards(
  familyId: string,
  callback: (snapshot: ReadSnapshot<readonly EarnedReward[]>) => void,
  onError: (error: ContractReadError) => void,
  status:
    | 'PENDING_FULFILLMENT'
    | 'AWAITING_CHILD_CONFIRMATION' = 'PENDING_FULFILLMENT',
): () => void {
  return observeRewards(familyId, true, callback, onError, status);
}
export function observeEarnedRewards(
  familyId: string,
  callback: (snapshot: ReadSnapshot<readonly EarnedReward[]>) => void,
  onError: (error: ContractReadError) => void,
): () => void {
  return observeRewards(familyId, false, callback, onError);
}
function observeRewards(
  familyId: string,
  pending: boolean,
  callback: (snapshot: ReadSnapshot<readonly EarnedReward[]>) => void,
  onError: (error: ContractReadError) => void,
  parentStatus:
    | 'PENDING_FULFILLMENT'
    | 'AWAITING_CHILD_CONFIRMATION' = 'PENDING_FULFILLMENT',
): () => void {
  const uid = requireContractReadContext(familyId);
  const constraints = [
    where('familyId', '==', familyId),
    where(pending ? 'parentUid' : 'childUid', '==', uid),
    ...(pending ? [where('status', '==', parentStatus)] : []),
    orderBy('earnedAt', 'desc'),
  ];
  try {
    return onSnapshot(
      query(collection(getInitializedFirestore(), 'rewards'), ...constraints),
      { includeMetadataChanges: true },
      (snapshot) => {
        try {
          const rewards = snapshot.docs.map((item) =>
            deserializeReward(item.id, item.data()),
          );
          if (
            rewards.some(
              (reward) =>
                reward.familyId !== familyId ||
                (pending ? reward.parentUid : reward.childUid) !== uid ||
                (pending && reward.status !== parentStatus),
            )
          )
            throw new ContractReadError('MALFORMED_DATA');
          callback({ data: rewards, fromCache: snapshot.metadata.fromCache });
        } catch (error) {
          onError(translateContractReadError(error));
        }
      },
      (error) => onError(translateContractReadError(error)),
    );
  } catch (error) {
    throw translateContractReadError(error);
  }
}

export { useContractReviews, type ContractReviewsState } from './contractHooks';
export function observeContractReviews(
  contract: Pick<Contract, 'id' | 'familyId' | 'parentUid' | 'childUid'>,
  callback: (snapshot: ReadSnapshot<readonly ContractReview[]>) => void,
  onError: (error: ContractReadError) => void,
): () => void {
  const uid = requireContractReadContext(contract.id);
  if (uid !== contract.parentUid && uid !== contract.childUid)
    throw new ContractReadError('FORBIDDEN');
  try {
    return onSnapshot(
      query(
        collection(
          getInitializedFirestore(),
          'contracts',
          contract.id,
          'reviews',
        ),
        where('familyId', '==', contract.familyId),
        where('contractId', '==', contract.id),
        orderBy('cycle', 'asc'),
      ),
      { includeMetadataChanges: true },
      (snapshot) => {
        try {
          callback({
            data: deserializeContractReviews(
              snapshot.docs.map((item) => ({ id: item.id, data: item.data() })),
              contract,
            ),
            fromCache: snapshot.metadata.fromCache,
          });
        } catch (error) {
          onError(translateContractReadError(error));
        }
      },
      (error) => onError(translateContractReadError(error)),
    );
  } catch (error) {
    throw translateContractReadError(error);
  }
}

// The documented exception: strict self-owned auxiliary push registrations.
function currentPushDeviceReference(
  expectedUid: string,
  installationId: string,
) {
  if (getInitializedAuth().currentUser?.uid !== expectedUid)
    throw new Error('AUTH_REQUIRED');
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(installationId))
    throw new Error('INVALID_DEVICE_ID');
  return doc(
    getInitializedFirestore(),
    'users',
    expectedUid,
    'devices',
    installationId,
  );
}
export async function upsertCurrentPushDevice(
  expectedUid: string,
  installationId: string,
  metadata: unknown,
): Promise<void> {
  const data = pushDeviceMetadataSchema.parse(metadata);
  const reference = currentPushDeviceReference(expectedUid, installationId);
  await runTransaction(getInitializedFirestore(), async (transaction) => {
    const existing = await transaction.get(reference);
    currentPushDeviceReference(expectedUid, installationId);
    transaction.set(reference, {
      ...data,
      createdAt: existing.exists()
        ? existing.data().createdAt
        : serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    });
  });
}
export async function deleteCurrentPushDevice(
  expectedUid: string,
  installationId: string,
): Promise<void> {
  const reference = currentPushDeviceReference(expectedUid, installationId);
  // A transaction requires backend confirmation rather than a queued offline deletion.
  await runTransaction(getInitializedFirestore(), async (transaction) => {
    const existing = await transaction.get(reference);
    currentPushDeviceReference(expectedUid, installationId);
    if (existing.exists()) transaction.delete(reference);
  });
}

export function subscribeReminderPreference(
  uid: string,
  role: import('@chorex/domain').UserProfile['accountType'],
  onValue: (value: { enabled: boolean; fromCache: boolean }) => void,
  onError: (error: unknown) => void,
): () => void {
  if (getInitializedAuth().currentUser?.uid !== uid)
    throw new Error('AUTH_REQUIRED');
  return onSnapshot(
    doc(getInitializedFirestore(), 'users', uid, 'preferences', 'reminders'),
    { includeMetadataChanges: true },
    (snapshot) => {
      try {
        if (getInitializedAuth().currentUser?.uid !== uid)
          throw new Error('AUTH_REQUIRED');
        onValue({
          enabled: reminderPreferenceEnabled(
            role,
            snapshot.exists() ? snapshot.data() : undefined,
          ),
          fromCache: snapshot.metadata.fromCache,
        });
      } catch (error) {
        onError(error);
      }
    },
    onError,
  );
}
export async function saveReminderPreference(
  uid: string,
  role: import('@chorex/domain').UserProfile['accountType'],
  enabled: boolean,
): Promise<void> {
  const check = () => {
    if (getInitializedAuth().currentUser?.uid !== uid)
      throw new Error('AUTH_REQUIRED');
  };
  check();
  const data = reminderPreferenceData(role, enabled);
  const ref = doc(
    getInitializedFirestore(),
    'users',
    uid,
    'preferences',
    'reminders',
  );
  await runTransaction(getInitializedFirestore(), async (tx) => {
    await tx.get(ref);
    check();
    tx.set(ref, data);
  });
}
export { useReminderPreference } from './useReminderPreference';
