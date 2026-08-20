'use strict'

const allowedCommands = ['config-get', 'lease4-get-all', 'lease4-add', 'lease4-del']

module.exports = function (fastify) {
  fastify.post('/', async (request, reply) => {
    const service = request.body.service[0]
    const command = request.body.command
    const args = request.body.arguments

    if (service !== 'dhcp4') {
      reply.code(400).send({
        result: 1,
        text: 'Invalid service name'
      })
    }
    if (!allowedCommands.includes(command)) {
      reply.code(400).send({
        result: 1,
        text: 'Invalid command'
      })
    }

    if (command === 'config-get') {
      reply.code(200).send(request.state.config)
    } else if (command === 'lease4-get-all') {
      reply.code(200).send([{
        result: 0,
        text: 'Leases retrieved',
        arguments: { leases: request.state.leases }
      }])
    } else if (command === 'lease4-add') {
      const newLease = args
      const existingLease = request.state.leases.find(lease => lease['ip-address'] === newLease['ip-address'])
      if (existingLease) {
        reply.code(200).send([{
          result: 1,
          text: 'IPv4 lease already exists.'
        }])
      } else {
        request.state.leases.push(newLease)
        reply.code(200).send([{
          result: 0,
          text: `Lease for address ${newLease['ip-address']}, subnet-id ${newLease['subnet-id']} added.`
        }])
      }
    } else if (command === 'lease4-del') {
      const lease = args
      const existingLease = request.state.leases.find(ilease => ilease['ip-address'] === lease['ip-address'])
      if (existingLease) {
        request.state.leases = request.state.leases.filter(ilease => ilease['ip-address'] !== lease['ip-address'])
        reply.code(200).send([{
          result: 0,
          text: 'IPv4 lease deleted.'
        }])
      } else {
        reply.code(200).send([{
          result: 3,
          text: 'IPv4 lease not found.'
        }])
      }
    }
  })
}
