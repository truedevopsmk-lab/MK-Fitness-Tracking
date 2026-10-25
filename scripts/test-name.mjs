// Greeting name rules (src/lib/name.js). The React hook isn't exercised here — only the pure resolvers.
import assert from 'node:assert/strict'
const { isHumanName, resolveName, withName } = await import(new URL('../src/lib/name.js', import.meta.url))

// Garmin ids that must never be shown as a name
for (const id of ['e0399703-3ad1-4a14-97d1-d21fc75573cf', 'E0399703-3AD1-4A14-97D1-D21FC75573CF', '0f3a9c2b7e41d8a6', 'user8842913', '12345', '', '   ', null, undefined, 42])
  assert.equal(isHumanName(id), false, `rejects ${JSON.stringify(id)}`)
for (const name of ['Asha', 'MK', 'Muthu Kumar', 'José', 'முத்து', 'runner_mk', 'Anne-Marie'])
  assert.equal(isHumanName(name), true, `accepts ${name}`)

const uuidProfile = { displayName: 'e0399703-3ad1-4a14-97d1-d21fc75573cf', fullName: null }
assert.equal(resolveName('', uuidProfile), '', 'UUID display name → no name')
assert.equal(resolveName('  Muthu  ', uuidProfile), 'Muthu', 'local override wins, trimmed')
assert.equal(resolveName('', { displayName: 'uuid-ish', fullName: 'Muthu Kumar' }), 'Muthu', 'first name from fullName')
assert.equal(resolveName('', { displayName: 'mkruns' }), 'mkruns', 'human display name used')
assert.equal(resolveName('', null), '')
assert.equal(resolveName('x'.repeat(60), null).length, 40, 'override capped at 40 chars')

assert.equal(withName('Good evening', 'Muthu'), 'Good evening, Muthu')
assert.equal(withName('Good evening', ''), 'Good evening', 'no dangling comma')
console.log('name tests: all passed')
