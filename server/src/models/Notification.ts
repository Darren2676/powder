import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface NotificationAttributes {
  id: number;
  user_id: number;
  ticket_id?: number;
  type: 'assigned' | 'commented' | 'status_changed' | 'due_soon' | 'approval_pending' | 'approval_result';
  title: string;
  content: string;
  is_read: boolean;
  created_at?: Date;
}

interface NotificationCreationAttributes extends Optional<NotificationAttributes, 'id' | 'is_read' | 'created_at'> {}

class Notification extends Model<NotificationAttributes, NotificationCreationAttributes> implements NotificationAttributes {
  public id!: number;
  public user_id!: number;
  public ticket_id?: number;
  public type!: 'assigned' | 'commented' | 'status_changed' | 'due_soon' | 'approval_pending' | 'approval_result';
  public title!: string;
  public content!: string;
  public is_read!: boolean;
  public readonly created_at!: Date;
}

Notification.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    ticket_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      validate: {
        isIn: [['assigned', 'commented', 'status_changed', 'due_soon', 'approval_pending', 'approval_result']]
      }
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    tableName: 'notifications',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  }
);

export default Notification;
