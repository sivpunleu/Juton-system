import { UniqueConstraintError, ValidationError } from 'sequelize'

export const sendDatabaseError = (
  res,
  error,
  fallbackMessage = 'Request failed',
) => {
  if (error.code === 11000 || error instanceof UniqueConstraintError) {
    return res.status(409).json({ message: 'This value already exists' })
  }
  if (error instanceof ValidationError) {
    return res.status(400).json({
      message: error.errors.map((item) => item.message).join(', '),
    })
  }
  return res.status(error.statusCode || 400).json({
    message: error.message || fallbackMessage,
  })
}
