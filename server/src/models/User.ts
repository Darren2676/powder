import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface UserAttributes {
  id: number;
  username: string;
  email: string;
  password: string;
  real_name: string;
  role: 'admin' | 'manager' | 'staff' | 'sales';
  department?: string;
  employee_number?: string;
  employee_name?: string;
  phone?: string;
  avatar?: string;
  status: 'active' | 'inactive' | 'disabled';
  failed_login_attempts?: number;
  locked_until?: Date | null;
  phone_verified?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'role' | 'status' | 'created_at' | 'updated_at'> {}

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: number;
  public username!: string;
  public email!: string;
  public password!: string;
  public real_name!: string;
  public role!: 'admin' | 'manager' | 'staff' | 'sales';
  public department?: string;
  public employee_number?: string;
  public employee_name?: string;
  public phone?: string;
  public avatar?: string;
  public status!: 'active' | 'inactive';
  public failed_login_attempts?: number;
  public locked_until?: Date | null;
  public phone_verified?: boolean;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    real_name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'staff',
      validate: {
        isIn: [['admin', 'manager', 'staff', 'sales']]
      }
    },
    department: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    employee_number: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    employee_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    avatar: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'inactive', 'disabled']]
      }
    },
    failed_login_attempts: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    locked_until: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    phone_verified: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
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
    tableName: 'users',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

export default User;
