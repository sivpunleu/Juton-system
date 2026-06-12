import bcrypt from 'bcryptjs'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const readline = createInterface({ input, output })
const password = await readline.question('Admin password to hash: ')
readline.close()

if (password.length < 10) {
  console.error('Use a password with at least 10 characters.')
  process.exit(1)
}

const hash = await bcrypt.hash(password, 12)
console.log('\nADMIN_PASSWORD_HASH=')
console.log(hash)

