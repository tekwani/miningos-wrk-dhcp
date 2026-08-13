'use strict'

const test = require('brittle')
const path = require('path')
const WrkDHCP = require(path.join(__dirname, '../../workers/dhcp.wrk.js'))

function wrkWithKea (kea) {
  const wrk = Object.create(WrkDHCP.prototype)
  wrk.dhcpKea_k0 = kea
  return wrk
}

test('WrkDHCP#setIps delegates to kea_k0.setIps', async function (t) {
  const wrk = wrkWithKea({
    setIps: async (req) => ({ echo: req })
  })
  const req = { addrs: ['10.0.0.1'] }
  t.alike(await wrk.setIps(req), { echo: req })
})

test('WrkDHCP#setIp delegates to kea_k0.setIp', async function (t) {
  const wrk = wrkWithKea({
    setIp: async (req) => ({ echo: req })
  })
  const req = { 'ip-address': '10.0.0.2' }
  t.alike(await wrk.setIp(req), { echo: req })
})

test('WrkDHCP#releaseIp delegates to kea_k0.releaseIp', async function (t) {
  const wrk = wrkWithKea({
    releaseIp: async (req) => ({ released: req })
  })
  const req = { 'hw-address': 'aa:bb:cc:dd:ee:ff' }
  t.alike(await wrk.releaseIp(req), { released: req })
})

test('WrkDHCP#releaseIps delegates to kea_k0.releaseIps', async function (t) {
  const wrk = wrkWithKea({
    releaseIps: async (req) => ({ released: req })
  })
  const req = { list: [] }
  t.alike(await wrk.releaseIps(req), { released: req })
})

test('WrkDHCP#getLeases delegates to kea_k0.getLeases', async function (t) {
  const leases = [{ 'ip-address': '10.0.0.3' }]
  const wrk = wrkWithKea({
    getLeases: async () => leases
  })
  t.is(await wrk.getLeases(), leases)
})

test('WrkDHCP#getConf fetches config and returns serverConf', async function (t) {
  let fetched = false
  const serverConf = { Dhcp4: { subnet4: [] } }
  const wrk = wrkWithKea({
    async fetchConf () {
      fetched = true
    },
    serverConf
  })
  t.is(await wrk.getConf(), serverConf)
  t.ok(fetched)
})

test('WrkDHCP#exportLeases delegates to kea_k0.exportLeases', async function (t) {
  const blob = { raw: 'lease data' }
  const wrk = wrkWithKea({
    exportLeases: async () => blob
  })
  t.is(await wrk.exportLeases(), blob)
})

test('WrkDHCP#importLeases delegates to kea_k0.importLeases', async function (t) {
  const wrk = wrkWithKea({
    importLeases: async (req) => ({ imported: req })
  })
  const req = { data: 'x' }
  t.alike(await wrk.importLeases(req), { imported: req })
})

test('WrkDHCP module exports the worker class', function (t) {
  t.is(typeof WrkDHCP, 'function')
  t.ok(WrkDHCP.name === 'WrkDHCP' || WrkDHCP.prototype.init)
})

test('WrkDHCP#init registers store, net, http, and kea facilities', function (t) {
  const parentProto = Object.getPrototypeOf(WrkDHCP.prototype)
  const origInit = parentProto.init
  parentProto.init = function () {}

  const wrk = Object.create(WrkDHCP.prototype)
  wrk.ctx = { cluster: 'unit-test' }
  const facs = []
  wrk.setInitFacs = (list) => { facs.push(...list) }

  try {
    wrk.init()
    t.ok(facs.length >= 4)
    t.ok(facs.some((f) => f[2] === 'k0'))
    t.ok(facs.some((f) => f[2] === 's0'))
    t.ok(facs.some((f) => f[2] === 'r0'))
    t.ok(facs.some((f) => f[2] === 'c0'))
  } finally {
    parentProto.init = origInit
  }
})

test('WrkDHCP#_disableKeaHttpKeepAlive forces Connection: close and no keep-alive', function (t) {
  const wrk = Object.create(WrkDHCP.prototype)
  const calls = []
  wrk.http_c0 = {
    request (path, opts) {
      calls.push({ path, opts })
      return { path, opts }
    }
  }

  wrk._disableKeaHttpKeepAlive()
  wrk.http_c0.request('http://127.0.0.1:8000/', { body: '{}' })

  t.is(calls.length, 1)
  t.is(calls[0].opts.headers.Connection, 'close')
  t.is(calls[0].opts.agent.keepAlive, false)
})

test('WrkDHCP#_disableKeaHttpKeepAlive is a no-op without http_c0', function (t) {
  const wrk = Object.create(WrkDHCP.prototype)
  wrk._disableKeaHttpKeepAlive()
  t.pass()
})

test('WrkDHCP#_start wires RPC handlers and saves public key', async function (t) {
  const parentProto = Object.getPrototypeOf(WrkDHCP.prototype)
  const origStart = parentProto._start
  parentProto._start = (cb) => cb()

  const wrk = Object.create(WrkDHCP.prototype)
  wrk.status = {}
  wrk.saveStatus = () => {}
  const handlers = {}
  wrk.net_r0 = {
    async startRpcServer () {},
    rpcServer: {
      publicKey: Buffer.alloc(32, 1),
      respond (name, fn) { handlers[name] = fn }
    },
    handleReply: async (method, req) => ({ method, req })
  }

  try {
    await new Promise((resolve, reject) => {
      wrk._start((err) => (err ? reject(err) : resolve()))
    })
    t.ok(handlers.echo)
    t.is(handlers.echo('ping'), 'ping')
    t.ok(handlers.setIp)
    t.ok(handlers.getConf)
    t.ok(wrk.status.rpcPublicKey)
  } finally {
    parentProto._start = origStart
  }
})
