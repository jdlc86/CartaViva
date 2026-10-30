import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const modulePath = process.env.SABORA_CI_PLAYWRIGHT_MODULE;
if (process.env.GITHUB_ACTIONS !== 'true' || !modulePath ||
    !process.env.SABORA_CI_MANAGEMENT_URL?.startsWith('http://127.0.0.1:')) {
  throw Error('isolated_browser_harness_required');
}
const {chromium} = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({headless: true});
const origin = process.env.SABORA_CI_MANAGEMENT_URL;
const orderId = 'a3000000-0000-4000-8000-000000000001';
const lineId = 'a4000000-0000-4000-8000-000000000001';
const timestamp = '2026-10-28T10:00:00.000Z';
let status = 'confirmed';
let role = 'kitchen';
let pickupState = 'ready';
let pickupVersion = 1;
let pickupDisplayId = null;
let failNextBoard = false;
const calls = [];
const board = () => ({version: 2, role, nextCursor: null, items: [{
  orderId, lineId, tableNumber: 7, customerLabel: 'Mesa E2E',
  confirmedAt: timestamp, grouping: 'first', lineNumber: 1,
  category: 'main', name: 'Plato E2E', quantity: 1, status,
  notification: status === 'ready' ? {
    id: 'a5000000-0000-4000-8000-000000000001',
    createdAt: timestamp, acknowledgedAt: null,
  } : null,
  pickup: status === 'ready' ? {
    taskId: 'a7000000-0000-4000-8000-000000000001', state: pickupState,
    version: pickupVersion, claimedDisplayId: pickupDisplayId,
    claimedAt: pickupState === 'claimed' ? timestamp : null, updatedAt: timestamp,
  } : null,
}]});
const context = await browser.newContext({viewport: {width: 390, height: 844}});
const page = await context.newPage();
try {
  await page.route('**/api/v1/operations/**', async route => {
    const request = route.request();
    const auth = request.headers().authorization;
    calls.push({method: request.method(), url: request.url(), auth});
    const headers = {'content-type': 'application/json', 'cache-control': 'no-store'};
    if (auth !== 'Bearer sabora_ci_browser_token_kitchen_001' &&
        auth !== 'Bearer sabora_ci_browser_token_waiter_001') {
      return route.fulfill({status: 401, headers, body: JSON.stringify({error:'unauthorized'})});
    }
    if (request.url().includes('/events')) {
      return route.fulfill({status: 403, headers, body: JSON.stringify({error:'forbidden'})});
    }
    if (request.method() === 'GET' && request.url().includes('/order-lines?')) {
      if (failNextBoard) {
        failNextBoard = false;
        return route.fulfill({status: 503, headers, body: JSON.stringify({error:'order_operations_unavailable'})});
      }
      return route.fulfill({status: 200, headers, body: JSON.stringify(board())});
    }
    if (request.method() === 'POST' && request.url().endsWith(`/order-lines/${lineId}/pickup-claim`)) {
      const {expectedVersion} = request.postDataJSON();
      if (role !== 'waiter' || pickupState !== 'ready' || expectedVersion !== pickupVersion) {
        return route.fulfill({status: 409, headers, body: JSON.stringify({error:'pickup_claim_conflict'})});
      }
      pickupState = 'claimed';
      pickupDisplayId = 'MS-903';
      pickupVersion += 1;
      return route.fulfill({status: 200, headers, body: JSON.stringify({
        version:1, outcome:'claimed', lineId,
        pickupTaskId:'a7000000-0000-4000-8000-000000000001', state:pickupState,
        taskVersion:pickupVersion, claimedDisplayId:pickupDisplayId, claimedAt:timestamp,
        updatedAt:timestamp, repeated:false,
      })});
    }
    if (request.method() === 'POST' && request.url().endsWith(`/order-lines/${lineId}/pickup-claim/cancel`)) {
      const {expectedVersion} = request.postDataJSON();
      if (role !== 'waiter' || pickupState !== 'claimed' || expectedVersion !== pickupVersion) {
        return route.fulfill({status: 409, headers, body: JSON.stringify({error:'pickup_claim_conflict'})});
      }
      pickupState = 'ready';
      pickupDisplayId = null;
      pickupVersion += 1;
      return route.fulfill({status: 200, headers, body: JSON.stringify({
        version:1, outcome:'cancelled', lineId,
        pickupTaskId:'a7000000-0000-4000-8000-000000000001', state:pickupState,
        taskVersion:pickupVersion, claimedDisplayId:null, claimedAt:null,
        updatedAt:timestamp, repeated:false,
      })});
    }
    if (request.method() === 'POST' && request.url().includes('/transitions')) {
      const {targetStatus} = request.postDataJSON();
      if (role !== 'kitchen' || !(
        (status === 'confirmed' && targetStatus === 'preparing') ||
        (status === 'preparing' && targetStatus === 'ready'))) {
        return route.fulfill({status: 403, headers, body: JSON.stringify({error:'forbidden'})});
      }
      const previousStatus = status;
      status = targetStatus;
      return route.fulfill({status: 201, headers, body: JSON.stringify({
        version:1, orderId, lineId,
        eventId:'a6000000-0000-4000-8000-000000000001',
        previousStatus, currentStatus:status, repeated:false,
        notificationId: status === 'ready' ? 'a5000000-0000-4000-8000-000000000001' : null,
      })});
    }
    return route.fulfill({status:404,headers,body:JSON.stringify({error:'order_operation_not_found'})});
  });
  await page.goto(origin + '/#comandas');
  await page.evaluate(async () => {
    const {mountAuthenticatedManagementApp} = await import('/src/main.tsx');
    window.__saboraCiDispose = mountAuthenticatedManagementApp({
      element: document.getElementById('root'),
      getAccessToken: async () => 'sabora_ci_browser_token_kitchen_001',
    });
  });
  await page.getByText('Plato E2E').first().waitFor();
  await page.getByRole('button', {name:'Iniciar preparación'}).click();
  await page.getByRole('button', {name:'Marcar lista'}).waitFor();
  await page.getByRole('button', {name:'Marcar lista'}).click();
  await page.getByText('Lista para recoger').first().waitFor();
  assert.equal(status,'ready');
  await page.evaluate(() => window.__saboraCiDispose());
  role = 'waiter';
  await page.evaluate(async () => {
    const {mountAuthenticatedManagementApp} = await import('/src/main.tsx');
    window.__saboraCiDispose = mountAuthenticatedManagementApp({
      element: document.getElementById('root'),
      getAccessToken: async () => 'sabora_ci_browser_token_waiter_001',
    });
  });
  await page.getByText('Plato E2E').first().waitFor();
  assert.equal(await page.getByRole('button',{name:'Iniciar preparación'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Marcar lista'}).count(),0);
  await page.getByRole('button',{name:'Voy a recoger'}).click();
  await page.getByText('En recogida · responsable MS-903').waitFor();
  assert.equal(pickupState,'claimed');
  assert.equal(pickupVersion,2);
  await page.getByRole('button',{name:'Cancelo'}).click();
  await page.getByText('Aviso activo para sala').waitFor();
  assert.equal(pickupState,'ready');
  assert.equal(pickupVersion,3);
  failNextBoard = true;
  await page.getByRole('button',{name:'Actualizar estado'}).click();
  await page.getByText('Estado no disponible').waitFor();
  await page.getByRole('button',{name:'Actualizar estado'}).click();
  await page.getByRole('button',{name:'Voy a recoger'}).waitFor();
  await page.evaluate(() => window.__saboraCiDispose());
  await page.getByText('Canal operativo sin conectar').first().waitFor();
  assert.ok(calls.some(call => call.method === 'POST'));
  assert.ok(calls.every(call => call.auth?.startsWith('Bearer sabora_ci_browser_token_')));
  console.log('PASS: Chromium kitchen, waiter claim/cancel, recoverable error, role isolation and logout (isolated HTTP fixture; PG17 is exercised separately)');
} finally {
  await context.close();
  await browser.close();
}
