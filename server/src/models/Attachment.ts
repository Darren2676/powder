import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface AttachmentAttributes {
  id: number;
  ticket_id: number;
  uploader_id: number;
  original_name: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at?: Date;
}

interface AttachmentCreationAttributes extends Optional<AttachmentAttributes, 'id' | 'created_at'> {}

class Attachment extends Model<AttachmentAttributes, AttachmentCreationAttributes> implements AttachmentAttributes {
  public id!: number;
  public ticket_id!: number;
  public uploader_id!: number;
  public original_name!: string;
  public file_name!: string;
  public file_path!: string;
  public file_size!: number;
  public mime_type!: string;
  public readonly created_at!: Date;
}

Attachment.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    ticket_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    uploader_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    original_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    file_path: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    file_size: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    tableName: 'attachments',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  }
);

export default Attachment;
