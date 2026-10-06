const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/responseRouting.ts');
const compiled = new Module(filename, module);
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  filename,
);
const {
  parseNotificationRoutingIntent,
  createNotificationResponseCoordinator,
  listenForNotificationResponsesWithDependencies,
} = compiled.exports;
const payload = (patch = {}) => ({
  type: 'CONTRACT_SUBMITTED',
  entityType: 'CONTRACT',
  entityId: 'contract',
  familyId: 'family',
  ...patch,
});
const response = (
  identifier = 'response',
  data = payload(),
  actionIdentifier = 'DEFAULT',
) => ({
  actionIdentifier,
  notification: { request: { identifier, content: { data } } },
});
const ready = (patch = {}) => ({
  authStatus: 'ready',
  uid: 'actor',
  routerReady: true,
  ...patch,
});
function fixture(initial = null) {
  const coordinator = createNotificationResponseCoordinator('DEFAULT'),
    destinations = [];
  let last = initial,
    listener,
    clears = 0,
    removes = 0;
  const transport = {
    addResponseListener: (fn) => {
      listener = fn;
      return { remove: () => removes++ };
    },
    getLastResponse: () => last,
    clearLastResponse: () => {
      clears++;
      last = null;
    },
  };
  const bind = () =>
    listenForNotificationResponsesWithDependencies(
      coordinator,
      transport,
      (intent) => destinations.push(intent),
    );
  return {
    coordinator,
    destinations,
    transport,
    bind,
    tap: (value) => {
      last = value;
      listener(value);
    },
    get clears() {
      return clears;
    },
    get removes() {
      return removes;
    },
  };
}
for (const [type, entityType] of [
  ['OFFER_PUBLISHED', 'OFFER'],
  ['OFFER_COUNTERED', 'OFFER'],
  ['OFFER_ACCEPTED', 'CONTRACT'],
  ['CONTRACT_SUBMITTED', 'CONTRACT'],
  ['CONTRACT_CHANGES_REQUESTED', 'CONTRACT'],
  ['CONTRACT_APPROVED', 'CONTRACT'],
  ['REWARD_FULFILLED', 'REWARD'],
])
  test(`${type}: canonical semantic intent without paths or copied domain terms`, () => {
    const value = payload({ type, entityType });
    assert.deepEqual(parseNotificationRoutingIntent(value), value);
  });
for (const patch of [
  { entityType: 'AUCTION' },
  { entityId: '' },
  { entityId: '../secret' },
  { entityId: 'a/b' },
  { entityId: 'a\\b' },
  { entityId: 'a?admin=true' },
  { entityId: 'a#route' },
  { entityId: ' ' },
  { entityId: '.' },
  { entityId: '..' },
  { entityId: 'a\u0000b' },
  { familyId: 'x/y' },
  { type: 'OFFER_ACCEPTED', entityType: 'OFFER' },
  { url: '/private' },
  { note: 'private' },
])
  test(`reject malformed/injected payload ${JSON.stringify(patch)}`, () =>
    assert.equal(parseNotificationRoutingIntent(payload(patch)), undefined));
test('null/non-object/incomplete payload safely fails', () => {
  for (const value of [
    null,
    undefined,
    [],
    {},
    '/',
    { type: 'CONTRACT_SUBMITTED' },
  ])
    assert.equal(parseNotificationRoutingIntent(value), undefined);
});
test('cold response waits for Auth restoration AND router readiness, then navigates once', () => {
  const f = fixture(response());
  const stop = f.bind();
  assert.equal(f.destinations.length, 0);
  assert.equal(f.clears, 1);
  f.coordinator.update(ready({ routerReady: false }));
  assert.equal(f.destinations.length, 0);
  f.coordinator.update(ready());
  assert.deepEqual(f.destinations, [payload()]);
  f.coordinator.update(ready());
  f.tap(response());
  assert.equal(f.destinations.length, 1);
  stop();
});
test('pending cold response survives root/listener remount and latest valid tap wins during restoration', () => {
  const f = fixture(response('first'));
  let stop = f.bind();
  stop();
  stop = f.bind();
  f.tap(response('second', payload({ entityId: 'second' })));
  f.coordinator.update(ready());
  assert.deepEqual(f.destinations, [payload({ entityId: 'second' })]);
  stop();
});
test('background live response and last-response retrieval/remount deduplicate; stopped callbacks do not route', () => {
  const f = fixture();
  f.coordinator.update(ready());
  let stop = f.bind();
  f.tap(response());
  stop();
  f.tap(response('after-unmount'));
  assert.equal(f.destinations.length, 1);
  stop = f.bind();
  assert.equal(f.destinations.length, 2);
  f.tap(response());
  assert.equal(f.destinations.length, 2);
  stop();
  assert.equal(f.removes, 2);
});
test('foreground arrival is not a response; only explicit default action can route', () => {
  const f = fixture();
  f.coordinator.update(ready());
  const stop = f.bind();
  f.coordinator.receive({ notification: response().notification });
  f.tap(response('dismiss', payload(), 'DISMISS'));
  assert.equal(f.destinations.length, 0);
  f.tap(response());
  assert.equal(f.destinations.length, 1);
  stop();
});
for (const authStatus of ['ready', 'error'])
  test(`resolved ${authStatus} without user discards pending response rather than exposing it after later sign-in`, () => {
    const f = fixture(response());
    const stop = f.bind();
    f.coordinator.update(ready({ authStatus, uid: null }));
    f.coordinator.update(ready());
    assert.equal(f.destinations.length, 0);
    f.tap(response());
    assert.equal(f.destinations.length, 0);
    stop();
  });
test('router-not-ready pending intent cannot cross an account switch', () => {
  const f = fixture();
  f.coordinator.update(ready({ routerReady: false }));
  const stop = f.bind();
  f.tap(response());
  f.coordinator.update(ready({ uid: 'different' }));
  assert.equal(f.destinations.length, 0);
  stop();
});
test('malformed/default-action responses never navigate; clear failure cannot duplicate consumed response', () => {
  const f = fixture(response('bad', payload({ url: '/private' })));
  f.coordinator.update(ready());
  let stop = f.bind();
  assert.equal(f.destinations.length, 0);
  f.transport.clearLastResponse = () => {
    throw Error('native unavailable');
  };
  f.tap(response());
  stop();
  stop = f.bind();
  assert.equal(f.destinations.length, 1);
  stop();
});
test('native listener/getLast failures and navigation exceptions fail safely without retry loops', () => {
  const coordinator = createNotificationResponseCoordinator('DEFAULT');
  coordinator.update(ready());
  const stop = listenForNotificationResponsesWithDependencies(
    coordinator,
    {
      addResponseListener: () => {
        throw Error('not available');
      },
      getLastResponse: () => response(),
      clearLastResponse: () => {},
    },
    () => {
      throw Error('unmounted');
    },
  );
  coordinator.receive(response());
  stop();
});
test('same response observed 100 times causes one navigation', () => {
  const f = fixture();
  f.coordinator.update(ready());
  const stop = f.bind();
  for (let i = 0; i < 100; i++) f.tap(response());
  assert.equal(f.destinations.length, 1);
  stop();
});

test('earlier response stays consumed after many distinct taps and a remount', () => {
  const f = fixture();
  f.coordinator.update(ready());
  let stop = f.bind();
  for (let i = 0; i < 100; i++) f.tap(response(`response-${i}`));
  stop();
  stop = f.bind();
  f.tap(response('response-0'));
  assert.equal(f.destinations.length, 100);
  stop();
});
test('latest invalid tap discards an earlier startup intent', () => {
  const f = fixture(response());
  const stop = f.bind();
  f.tap(response('invalid-latest', payload({ entityId: '../private' })));
  f.coordinator.update(ready());
  assert.equal(f.destinations.length, 0);
  stop();
});
