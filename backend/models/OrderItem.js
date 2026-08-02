import { randomUUID } from 'node:crypto'
import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import Order from './Order.js'
import Product from './Product.js'

const OrderItem = sequelize.define(
  'OrderItem',
  {
    id: {
      type: DataTypes.STRING(64),
      defaultValue: () => randomUUID(),
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Order, key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    productId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: Product, key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    description: { type: DataTypes.STRING(191), allowNull: false },
    itemCode: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    colorCode: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    quantity: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    unit: { type: DataTypes.STRING(50), allowNull: false },
    unitPrice: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    total: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    sortOrder: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: 'order_items',
    timestamps: true,
    indexes: [
      { fields: ['orderId'] },
      { fields: ['productId'] },
      { fields: ['orderId', 'sortOrder'] },
    ],
  },
)

Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'itemRows' })
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' })
Product.hasMany(OrderItem, { foreignKey: 'productId', as: 'orderItemRows' })
OrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' })

export default OrderItem
