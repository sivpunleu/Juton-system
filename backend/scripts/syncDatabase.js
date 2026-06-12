import '../models/Admin.js'
import '../models/AuditLog.js'
import '../models/BackupSnapshot.js'
import '../models/Counter.js'
import '../models/Customer.js'
import '../models/Invoice.js'
import '../models/Product.js'
import '../models/Salesperson.js'
import '../models/SystemSetting.js'
import { sequelize } from '../config/database.js'

try {
  await sequelize.authenticate()
  await sequelize.sync()
  console.log('MySQL schema synchronized successfully')
} catch (error) {
  console.error(`MySQL schema synchronization failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await sequelize.close()
}
