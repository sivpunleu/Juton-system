import { randomBytes } from 'node:crypto'

export const createShareToken = () => randomBytes(24).toString('base64url')
