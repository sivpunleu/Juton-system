import fs from 'node:fs'
import dotenv from 'dotenv'
import { Sequelize } from 'sequelize'

dotenv.config()

let storageMode = 'local-json'

const getSslOptions = () => {
  if (process.env.DB_SSL !== 'true') return undefined

  let ca = process.env.DB_SSL_CA?.replace(/\\n/g, '\n')
  if (process.env.DB_SSL_CA_PATH) {
    ca = fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8')
  }

  return ca
    ? { ca, rejectUnauthorized: true }
    : { rejectUnauthorized: true }
}

const sslOptions = getSslOptions()
const dialectOptions = {
  decimalNumbers: true,
  ...(sslOptions ? { ssl: sslOptions } : {}),
}

const connectionOptions = {
  dialect: 'mysql',
  logging: process.env.DB_LOGGING === 'true' ? console.log : false,
  dialectOptions,
  pool: {
    max: Number(process.env.DB_POOL_MAX || 10),
    min: 0,
    acquire: Number(process.env.DB_POOL_ACQUIRE || 30000),
    idle: Number(process.env.DB_POOL_IDLE || 10000),
  },
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  },
}

export const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, connectionOptions)
  : new Sequelize(
      process.env.DB_NAME || 'jotun_billing',
      process.env.DB_USER || 'root',
      process.env.DB_PASSWORD || '',
      {
        ...connectionOptions,
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
      },
    )

const hasDatabaseConfig = () =>
  Boolean(
    process.env.DATABASE_URL ||
      (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER),
  )

export const connectDatabase = async () => {
  if (!hasDatabaseConfig()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MySQL environment variables are not configured')
    }
    console.warn('MySQL is not configured; using local JSON storage')
    return storageMode
  }

  try {
    await sequelize.authenticate()
    if (process.env.DB_SYNC !== 'false') {
      await sequelize.sync()
    }
    storageMode = 'mysql'
    console.log(`MySQL connected: ${sequelize.config.host}`)
    return storageMode
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`MySQL connection failed: ${error.message}`)
    }
    console.warn(`MySQL unavailable: ${error.message}`)
    console.warn('Using local JSON storage for development')
    return storageMode
  }
}

export const getStorageMode = () => storageMode

export default connectDatabase
