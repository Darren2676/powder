import sequelize from '../config/database';
import User from './User';
import Ticket from './Ticket';
import Comment from './Comment';
import Attachment from './Attachment';
import Notification from './Notification';

// User <-> Ticket (as creator)
User.hasMany(Ticket, {
  foreignKey: 'creator_id',
  as: 'createdTickets',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

Ticket.belongsTo(User, {
  foreignKey: 'creator_id',
  as: 'creator',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

// User <-> Ticket (as assignee)
User.hasMany(Ticket, {
  foreignKey: 'assignee_id',
  as: 'assignedTickets',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

Ticket.belongsTo(User, {
  foreignKey: 'assignee_id',
  as: 'assignee',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

// Ticket <-> Comment
Ticket.hasMany(Comment, {
  foreignKey: 'ticket_id',
  as: 'comments',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

Comment.belongsTo(Ticket, {
  foreignKey: 'ticket_id',
  as: 'ticket',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

// User <-> Comment
User.hasMany(Comment, {
  foreignKey: 'user_id',
  as: 'comments',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

Comment.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

// Ticket <-> Attachment
Ticket.hasMany(Attachment, {
  foreignKey: 'ticket_id',
  as: 'attachments',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

Attachment.belongsTo(Ticket, {
  foreignKey: 'ticket_id',
  as: 'ticket',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

// User <-> Attachment
User.hasMany(Attachment, {
  foreignKey: 'uploader_id',
  as: 'attachments',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

Attachment.belongsTo(User, {
  foreignKey: 'uploader_id',
  as: 'uploader',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

// User <-> Notification
User.hasMany(Notification, {
  foreignKey: 'user_id',
  as: 'notifications',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

Notification.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

// Ticket <-> Notification
Ticket.hasMany(Notification, {
  foreignKey: 'ticket_id',
  as: 'notifications',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

Notification.belongsTo(Ticket, {
  foreignKey: 'ticket_id',
  as: 'ticket',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

export const initDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');
    
    await sequelize.sync();
    console.log('数据库同步完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
};

export {
  sequelize,
  User,
  Ticket,
  Comment,
  Attachment,
  Notification
};
