// Native development verification only; no domain writes or remote push sends.
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(
  realpathSync(`${root}apps/child/node_modules/expo/package.json`),
);
const cliRequire = createRequire(require.resolve('@expo/cli/package.json'));
const WebSocket = cliRequire('ws');
const domainRequire = createRequire(
  `${root}packages/notifications/package.json`,
);
const { negotiationNotificationDataSchema } = domainRequire('@chorex/domain');
const port = Number(process.argv[2]);
const operation = process.argv[3] ?? 'permission';
if (![8081, 8082].includes(port))
  throw Error('Only local Parent 8081 / Child 8082 Metro ports are supported.');
if (
  ![
    'permission',
    'request',
    'schedule',
    'offline',
    'online',
    'cleanup',
  ].includes(operation)
)
  throw Error('Unsupported verification operation.');
const payload =
  operation === 'schedule'
    ? negotiationNotificationDataSchema.parse(
        JSON.parse(process.argv[4] ?? '{}'),
      )
    : null;
const identifier = `routing-verify-${Date.now()}`;
const body = {
  permission: 'sdk.getPermissionsAsync()',
  request:
    'sdk.requestPermissionsAsync({ios:{allowAlert:true,allowSound:false,allowBadge:false}})',
  schedule: `sdk.scheduleNotificationAsync({identifier:${JSON.stringify(identifier)},content:{title:'ChoreX routing verification',body:'Open the current agreement.',data:${JSON.stringify(payload)}},trigger:{type:sdk.SchedulableTriggerInputTypes.TIME_INTERVAL,seconds:30}})`,
  offline:
    "(()=>{const api=modules.find(e=>e?.getFirestore&&e?.disableNetwork);if(!api)throw Error('Firestore SDK missing');return api.disableNetwork(api.getFirestore()).then(()=>({networkEnabled:false}));})()",
  online:
    "(()=>{const api=modules.find(e=>e?.getFirestore&&e?.enableNetwork);if(!api)throw Error('Firestore SDK missing');return api.enableNetwork(api.getFirestore()).then(()=>({networkEnabled:true}));})()",
  cleanup:
    "Promise.all([sdk.getAllScheduledNotificationsAsync(),sdk.getPresentedNotificationsAsync()]).then(([scheduled,presented])=>Promise.all([...scheduled.filter(n=>n.identifier.startsWith('routing-verify-')).map(n=>sdk.cancelScheduledNotificationAsync(n.identifier)),...presented.filter(n=>n.request.identifier.startsWith('routing-verify-')).map(n=>sdk.dismissNotificationAsync(n.request.identifier))])).then(()=>({testNotificationsRemoved:true}))",
}[operation];
const targets = await (
  await fetch(`http://127.0.0.1:${port}/json/list`)
).json();
const target = targets.find(
  (t) =>
    t.appId === `dev.chorex.bootstrap.${port === 8081 ? 'parent' : 'child'}`,
);
if (!target)
  throw Error('Open the corresponding native development app first.');
const ws = new WebSocket(target.webSocketDebuggerUrl, {
  headers: { Origin: `http://127.0.0.1:${port}` },
});
const timeout = setTimeout(() => {
  console.error(
    'Native verification timed out; bring the app to the foreground and retry.',
  );
  process.exitCode = 1;
  ws.close();
}, 30000);
ws.on('open', () => {
  ws.send(JSON.stringify({ id: 0, method: 'Runtime.enable' }));
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `(()=>{if(!globalThis.__DEV__)throw Error('Development build required');const modules=[...globalThis.__r.getModules().values()].map(m=>m.publicModule?.exports);const sdk=modules.find(e=>e?.getPermissionsAsync&&e?.scheduleNotificationAsync);if(!sdk)throw Error('Expo SDK missing');${body}.then(result=>console.log(${JSON.stringify(identifier)},JSON.stringify(result))).catch(error=>console.log(${JSON.stringify(identifier)},JSON.stringify({error:error.code??'NATIVE_FAILURE'})));return 'REQUESTED';})()`,
        returnByValue: true,
      },
    }),
  );
});
ws.on('message', (data) => {
  const value = JSON.parse(String(data));
  if (
    value.method === 'Runtime.consoleAPICalled' &&
    value.params.args[0]?.value === identifier
  ) {
    const result = value.params.args[1]?.value;
    console.log(result);
    if (JSON.parse(result)?.error) process.exitCode = 1;
    ws.close();
  }
  if (value.id === 1 && value.result?.exceptionDetails) {
    console.error('Native verification expression failed.');
    process.exitCode = 1;
    ws.close();
  }
});
ws.on('error', () => {
  console.error('Local native debugger connection failed.');
  process.exitCode = 1;
});
ws.on('close', () => clearTimeout(timeout));
