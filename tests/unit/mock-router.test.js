'use strict'

const test = require('brittle')
const path = require('path')
const fastify = require('fastify')
const router = require(path.join(__dirname, '../../mock/routers/base.js'))
const loadInitialState = require(path.join(__dirname, '../../mock/initial_states/default.js'))

function buildApp () {
  const { state } = loadInitialState({
    startTime: Date.now(),
    host: '127.0.0.1',
    port: 0
  })
  const app = fastify()
  app.addHook('onRequest', async (req) => {
    req.state = state
  })
  router(app)
  return app
}

test('mock Kea: config-get returns stored config', async function (t) {
  const app = buildApp()
  await app.ready()
  const res = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'config-get',
      arguments: {}
    }
  })
  t.is(res.statusCode, 200)
  const body = res.json()
  t.ok(Array.isArray(body))
  t.is(body[0].result, 0)
  await app.close()
})

test('mock Kea: lease4-get-all returns leases list', async function (t) {
  const app = buildApp()
  await app.ready()
  const res = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-get-all',
      arguments: {}
    }
  })
  t.is(res.statusCode, 200)
  const body = res.json()
  t.ok(Array.isArray(body))
  t.is(body[0].result, 0)
  t.alike(body[0].arguments.leases, [])
  await app.close()
})

test('mock Kea: lease4-add then lease4-get-all includes lease', async function (t) {
  const app = buildApp()
  await app.ready()
  const lease = {
    'hw-address': '01:02:03:04:05:06',
    'ip-address': '10.182.0.20',
    'subnet-id': 1
  }
  const addRes = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-add',
      arguments: lease
    }
  })
  t.is(addRes.statusCode, 200)
  const getRes = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-get-all',
      arguments: {}
    }
  })
  const body = getRes.json()
  t.is(body[0].arguments.leases.length, 1)
  t.is(body[0].arguments.leases[0]['hw-address'], lease['hw-address'])
  await app.close()
})

test('mock Kea: lease4-del removes lease', async function (t) {
  const app = buildApp()
  await app.ready()
  const lease = {
    'hw-address': '0a:0b:0c:0d:0e:0f',
    'ip-address': '10.182.0.21',
    'subnet-id': 1
  }
  await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-add',
      arguments: lease
    }
  })
  const delRes = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-del',
      arguments: { 'ip-address': lease['ip-address'], 'hw-address': lease['hw-address'] }
    }
  })
  t.is(delRes.statusCode, 200)
  t.is(delRes.json()[0].result, 0)
  const getRes = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-get-all',
      arguments: {}
    }
  })
  t.is(getRes.json()[0].arguments.leases.length, 0)
  await app.close()
})

test('mock Kea: invalid service returns 400', async function (t) {
  const app = buildApp()
  await app.ready()
  const res = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['not-dhcp4'],
      command: 'config-get',
      arguments: {}
    }
  })
  t.is(res.statusCode, 400)
  await app.close()
})

test('default initial state exposes cleanup', function (t) {
  const { cleanup } = loadInitialState({
    startTime: Date.now(),
    host: '127.0.0.1',
    port: 0
  })
  t.is(typeof cleanup, 'function')
  cleanup()
})

test('mock Kea: lease4-add rejects a lease for an already leased ip', async function (t) {
  const app = buildApp()
  await app.ready()
  const existing = {
    'hw-address': '11:22:33:44:55:66',
    'ip-address': '10.182.0.10',
    'subnet-id': 1
  }
  await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-add',
      arguments: existing
    }
  })
  const conflictRes = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-add',
      arguments: {
        'hw-address': 'aa:aa:aa:aa:aa:aa',
        'ip-address': existing['ip-address'],
        'subnet-id': 1
      }
    }
  })
  t.is(conflictRes.statusCode, 200)
  t.is(conflictRes.json()[0].result, 1)
  t.is(conflictRes.json()[0].text, 'IPv4 lease already exists.')
  await app.close()
})

test('mock Kea: lease4-add allows the same hw-address in another subnet', async function (t) {
  const app = buildApp()
  await app.ready()
  const existing = {
    'hw-address': '11:22:33:44:55:66',
    'ip-address': '10.182.0.10',
    'subnet-id': 1
  }
  await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-add',
      arguments: existing
    }
  })
  const addRes = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-add',
      arguments: {
        'hw-address': existing['hw-address'],
        'ip-address': '10.10.0.99',
        'subnet-id': 2
      }
    }
  })
  t.is(addRes.statusCode, 200)
  t.is(addRes.json()[0].result, 0)
  const getRes = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-get-all',
      arguments: {}
    }
  })
  t.is(getRes.json()[0].arguments.leases.length, 2)
  await app.close()
})

test('mock Kea: lease4-del removes only the addressed lease of a hw-address', async function (t) {
  const app = buildApp()
  await app.ready()
  const mac = '11:22:33:44:55:66'
  for (const lease of [
    { 'hw-address': mac, 'ip-address': '10.182.0.10', 'subnet-id': 1 },
    { 'hw-address': mac, 'ip-address': '10.10.0.99', 'subnet-id': 2 }
  ]) {
    await app.inject({
      method: 'POST',
      url: '/',
      payload: { service: ['dhcp4'], command: 'lease4-add', arguments: lease }
    })
  }
  const delRes = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-del',
      arguments: { 'ip-address': '10.182.0.10', 'hw-address': mac }
    }
  })
  t.is(delRes.json()[0].result, 0)
  const getRes = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-get-all',
      arguments: {}
    }
  })
  t.is(getRes.json()[0].arguments.leases.length, 1)
  t.is(getRes.json()[0].arguments.leases[0]['ip-address'], '10.10.0.99')
  await app.close()
})

test('mock Kea: lease4-del for an unknown ip returns result 3', async function (t) {
  const app = buildApp()
  await app.ready()
  const res = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'lease4-del',
      arguments: { 'ip-address': '10.182.0.250', 'hw-address': 'de:ad:be:ef:00:01' }
    }
  })
  t.is(res.statusCode, 200)
  t.is(res.json()[0].result, 3)
  t.is(res.json()[0].text, 'IPv4 lease not found.')
  await app.close()
})

test('mock Kea: invalid command returns 400', async function (t) {
  const app = buildApp()
  await app.ready()
  const res = await app.inject({
    method: 'POST',
    url: '/',
    payload: {
      service: ['dhcp4'],
      command: 'unknown-cmd',
      arguments: {}
    }
  })
  t.is(res.statusCode, 400)
  await app.close()
})
