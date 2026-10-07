// Local native verification. Installs an in-memory Expo token test double only.
// Never configures EAS, calls Expo Push Service, or changes Auth permissions.
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(
  realpathSync(`${root}apps/child/node_modules/expo/package.json`),
);
const WebSocket = createRequire(require.resolve('@expo/cli/package.json'))(
  'ws',
);
const port = Number(process.argv[2]);
const operation = process.argv[3];
if (![8081, 8082].includes(port)) throw Error('Local Metro only');
if (
  ![
    'install-double',
    'rotate',
    'status',
    'reconcile',
    'sign-in-A',
    'sign-in-B',
    'pair',
  ].includes(operation)
)
  throw Error('Unsupported operation');
let credentials;
if (operation.startsWith('sign-in-') || operation === 'pair') {
  if (!process.argv[4]?.startsWith('/tmp/'))
    throw Error('Private local fixture file required');
  const fixture = JSON.parse(readFileSync(process.argv[4], 'utf8'));
  credentials =
    operation === 'pair' ? fixture.pairing.token : fixture[operation.slice(-1)];
}
const body = {
  'install-double': `const api=modules.find(e=>e?.registerCurrentDevice&&e?.readNotificationPermission);const core=modules.find(e=>e?.createRegistrationSessionCoordinator);const store=modules.find(e=>e?.getItemAsync&&e?.setItemAsync&&e?.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY);const crypto=modules.find(e=>e?.randomUUID&&e?.digestStringAsync);if(!api||!core||!store||!crypto)throw Error('Modules unavailable');
 const auth=modules.find(e=>e?.getAuth&&e?.onAuthStateChanged).getAuth();if(auth.emulatorConfig?.host && !['127.0.0.1','localhost'].includes(auth.emulatorConfig.host))throw Error('Emulator only');
 globalThis.__chorexTokenDouble={generation:1};
 const coordinator=core.createRegistrationSessionCoordinator({getAuthenticatedUid:()=>auth.currentUser?.uid??null,getPermission:api.readNotificationPermission,requestPermission:async()=>{const p=await sdk.requestPermissionsAsync({ios:{allowAlert:true,allowBadge:true,allowSound:true}});return {granted:p.granted||[sdk.IosAuthorizationStatus.PROVISIONAL,sdk.IosAuthorizationStatus.EPHEMERAL].includes(p.ios?.status),status:p.status,canAskAgain:p.canAskAgain};},prepareAndroidChannel:async()=>{},getInstallationId:()=>store.getItemAsync('chorex.installation-id.v1'),setInstallationId:id=>store.setItemAsync('chorex.installation-id.v1',id,{keychainAccessible:store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY}),createInstallationId:crypto.randomUUID,getExpoPushToken:async()=>('ExpoPushToken[native-test-'+${port}+'-'+globalThis.__chorexTokenDouble.generation+']'),getProjectId:()=> 'dependency-test-double',getAppVersion:()=> '0.0.0',getPlatform:()=> 'ios',upsertDevice:client.upsertCurrentPushDevice,deleteDevice:client.deleteCurrentPushDevice});
 api.registerCurrentDevice=(variant,options)=>coordinator.register(variant,options);api.resumeDeviceRegistration=uid=>coordinator.resume(uid);api.removeCurrentDeviceRegistration=()=>coordinator.remove();globalThis.__chorexTokenDouble.api=api;return Promise.resolve({tokenDoubleInstalled:true,realExpoRequested:false});`,
  rotate:
    "if(!globalThis.__chorexTokenDouble)throw Error('Install double first');globalThis.__chorexTokenDouble.generation++;return globalThis.__chorexTokenDouble.api.registerCurrentDevice(variant,{requestPermission:false});",
  reconcile:
    "if(!globalThis.__chorexTokenDouble)throw Error('Install double first');globalThis.__chorexTokenDouble.api.resumeDeviceRegistration(modules.find(e=>e?.getAuth&&e?.onAuthStateChanged).getAuth().currentUser?.uid);return globalThis.__chorexTokenDouble.api.registerCurrentDevice(variant,{requestPermission:false});",
  status:
    "const store=modules.find(e=>e?.getItemAsync&&e?.setItemAsync);return Promise.all([sdk.getPermissionsAsync(),store.getItemAsync('chorex.installation-id.v1'),store.getItemAsync('chorex.notification-education.v1')]).then(([permission,installationId,education])=>({uid:modules.find(e=>e?.getAuth&&e?.onAuthStateChanged).getAuth().currentUser?.uid??null,permission,installationId,education}));",
  'sign-in-A': `return client.signInWithEmailAndPassword(${JSON.stringify(credentials && { email: credentials.email, password: credentials.password })}).then(user=>({uid:user.uid}));`,
  'sign-in-B': `return client.signInWithEmailAndPassword(${JSON.stringify(credentials && { email: credentials.email, password: credentials.password })}).then(user=>({uid:user.uid}));`,
  pair: `return client.redeemPairingSession({token:${JSON.stringify(credentials && { email: credentials.email, password: credentials.password })},idempotencyKey:'native-permission-pair-'+Date.now()}).then(result=>client.signInWithChildCustomToken(result.customToken)).then(user=>({uid:user.uid}));`,
}[operation];
const targets = await (
  await fetch(`http://127.0.0.1:${port}/json/list`)
).json();
const target = targets.find(
  (t) =>
    t.appId === `dev.chorex.bootstrap.${port === 8081 ? 'parent' : 'child'}` &&
    t.deviceName === 'ChoreX Permission Verification',
);
if (!target)
  throw Error(
    'Open isolated ChoreX Permission Verification simulator app first',
  );
const marker = `registration-native-${Date.now()}`;
const ws = new WebSocket(target.webSocketDebuggerUrl, {
  headers: { Origin: `http://127.0.0.1:${port}` },
});
const timeout = setTimeout(() => {
  process.exitCode = 1;
  ws.close();
  console.error('Native verification timeout');
}, 30000);
ws.on('open', () => {
  ws.send(JSON.stringify({ id: 0, method: 'Runtime.enable' }));
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `(()=>{if(!globalThis.__DEV__)throw Error('Development only');const config=JSON.parse(globalThis.__chorexDevelopmentFirebase?.fingerprint??'{}');if(config.projectId!=='chorex-dev'||!['127.0.0.1','localhost'].includes(config.host))throw Error('Local emulator configuration required');const modules=[...globalThis.__r.getModules().values()].map(m=>m.publicModule?.exports);const sdk=modules.find(e=>e?.getPermissionsAsync&&e?.scheduleNotificationAsync);const client=modules.find(e=>e?.upsertCurrentPushDevice&&e?.signInWithEmailAndPassword);const variant=${JSON.stringify(port === 8081 ? 'PARENT' : 'CHILD')};if(!sdk||!client)throw Error('SDK/client missing');(async()=>{${body}})().then(result=>console.log(${JSON.stringify(marker)},JSON.stringify(result))).catch(error=>console.log(${JSON.stringify(marker)},JSON.stringify({error:error.code??error.message})));return 'REQUESTED';})()`,
        returnByValue: true,
      },
    }),
  );
});
ws.on('message', (data) => {
  const value = JSON.parse(String(data));
  if (
    value.method === 'Runtime.consoleAPICalled' &&
    value.params.args[0]?.value === marker
  ) {
    const result = value.params.args[1]?.value;
    console.log(result);
    if (JSON.parse(result).error) process.exitCode = 1;
    ws.close();
  }
  if (value.id === 1 && value.result?.exceptionDetails) {
    console.error('Native verification expression failed');
    process.exitCode = 1;
    ws.close();
  }
});
ws.on('error', () => {
  process.exitCode = 1;
  console.error('Local native debugger connection failed');
});
ws.on('close', () => clearTimeout(timeout));
