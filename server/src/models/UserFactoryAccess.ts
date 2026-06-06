import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface UserFactoryAccessAttributes {
  id: number;
  user_id: number;
  factory_id: number;
  access_level?: string;
  is_default?: boolean;
  created_by?: number;
  created_at?: Date;
}

interface UserFactoryAccessCreationAttributes extends Optional<UserFactoryAccessAttributes, 'id' | 'created_at'> {}

class UserFactoryAccess extends Model<UserFactoryAccessAttributes, UserFactoryAccessCreationAttributes> implements UserFactoryAccessAttributes {
  public id!: number;
  public user_id!: number;
  public factory_id!: number;
  public access_level?: string;
  public is_default?: boolean;
  public created_by?: number;
  public readonly created_at!: Date;
}

UserFactoryAccess.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '用户ID'
    },
    factory_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '工厂ID'
    },
    access_level: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'read',
      validate: {
        isIn: [['read', 'write', 'admin']]
      },
      comment: '访问级别: read=只读, write=可操作, admin=可配置'
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: '是否默认登录工厂'
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    tableName: 'user_factory_access',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['user_id', 'factory_id'] }
    ]
  }
);

export default UserFactoryAccess;
