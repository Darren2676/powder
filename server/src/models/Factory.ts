import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface FactoryAttributes {
  id: number;
  factory_code: string;
  factory_name: string;
  factory_short?: string;
  address?: string;
  contact_name?: string;
  contact_phone?: string;
  is_headquarters?: boolean;
  status?: string;
  created_at?: Date;
  updated_at?: Date;
}

interface FactoryCreationAttributes extends Optional<FactoryAttributes, 'id' | 'created_at' | 'updated_at'> {}

class Factory extends Model<FactoryAttributes, FactoryCreationAttributes> implements FactoryAttributes {
  public id!: number;
  public factory_code!: string;
  public factory_name!: string;
  public factory_short?: string;
  public address?: string;
  public contact_name?: string;
  public contact_phone?: string;
  public is_headquarters?: boolean;
  public status?: string;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Factory.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    factory_code: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true,
      comment: '工厂编码，如 N(宁国工厂), G(广州工厂)'
    },
    factory_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '工厂全称'
    },
    factory_short: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: '工厂简称'
    },
    address: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    contact_name: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    contact_phone: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    is_headquarters: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: '是否总部'
    },
    status: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: '启用'
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
    tableName: 'factory',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

export default Factory;
