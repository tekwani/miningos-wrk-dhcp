'use strict'

const allowedCommands = ['config-get', 'lease4-get-all', 'lease4-add', 'lease4-del']

const KEA_RESULT = {
  SUCCESS: 0,
  ERROR: 1,
  UNSUPPORTED: 2,
  EMPTY: 3
}

module.exports = function (fastify) {
  fastify.post('/', async (request, reply) => {
    const service = request.body.service[0]
    const command = request.body.command
    const args = request.body.arguments

    if (service !== 'dhcp4') {
      return reply.code(200).send([{
        result: KEA_RESULT.ERROR,
        text: 'Invalid service name'
      }])
    }
    if (!allowedCommands.includes(command)) {
      return reply.code(200).send([{
        result: KEA_RESULT.UNSUPPORTED,
        text: `'${command}' command not supported.`
      }])
    }

    if (command === 'config-get') {
      reply.code(200).send(request.state.config)
    } else if (command === 'lease4-get-all') {
      reply.code(200).send([{
        result: KEA_RESULT.SUCCESS,
        text: 'Leases retrieved',
        arguments: { leases: request.state.leases }
      }])
    } else if (command === 'lease4-add') {
      const newLease = args
      const existingLease = request.state.leases.find(lease => lease['ip-address'] === newLease['ip-address'])
      if (existingLease) {
        reply.code(200).send([{
          result: KEA_RESULT.ERROR,
          text: 'IPv4 lease already exists.'
        }])
      } else {
        request.state.leases.push(newLease)
        reply.code(200).send([{
          result: KEA_RESULT.SUCCESS,
          text: `Lease for address ${newLease['ip-address']}, subnet-id ${newLease['subnet-id']} added.`
        }])
      }
    } else if (command === 'lease4-del') {
      const lease = args
      const existingLease = request.state.leases.find(ilease => ilease['ip-address'] === lease['ip-address'])
      if (existingLease) {
        request.state.leases = request.state.leases.filter(ilease => ilease['ip-address'] !== lease['ip-address'])
        reply.code(200).send([{
          result: KEA_RESULT.SUCCESS,
          text: 'IPv4 lease deleted.'
        }])
      } else {
        reply.code(200).send([{
          result: KEA_RESULT.EMPTY,
          text: 'IPv4 lease not found.'
        }])
      }
    }
  })
}
