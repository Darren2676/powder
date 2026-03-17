import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface TicketAttributes {
  id: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'closed';
  category?: string;
  creator_id: number;
  assignee_id?: number;
  due_date?: Date;
  completed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

interface TicketCreationAttributes extends Optional<TicketAttributes, 'id' | 'priority' | 'status' | 'created_at' | 'updated_at'> {}

class Ticket extends Model<TicketAttributes, TicketCreationAttributes> implements TicketAttributes {
  public id!: number;
  public title!: string;
  public description!: string;
  public priority!: 'low' | 'medium' | 'high' | 'urgent';
  public status!: 'pending' | 'in_progress' | 'completed' | 'closed';
  public category?: string;
  public creator_id!: number;
  public assignee_id?: number;
  public due_date?: Date;
  public completed_at?: Date;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Ticket.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    priority: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'medium',
      validate: {
        isIn: [['low', 'medium', 'high', 'urgent']]
      }
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'in_progress', 'completed', 'closed']]
      }
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    creator_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    assignee_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    tableName: 'tickets',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

export default Ticket;
