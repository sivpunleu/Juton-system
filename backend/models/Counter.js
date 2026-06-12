import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'

const Counter = sequelize.define(
  'Counter',
  {
    id: { type: DataTypes.STRING(50), primaryKey: true },
    sequence: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  },
  { tableName: 'counters', timestamps: false },
)

export default Counter
