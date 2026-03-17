import { Request, Response, NextFunction } from 'express';
import { Notification } from '../models';
import { success, error, paginate } from '../utils/response.util';

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 10, is_read } = req.query;

    const where: any = {
      user_id: req.user!.id
    };

    if (is_read !== undefined) {
      where.is_read = is_read === 'true';
    }

    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows } = await Notification.findAndCountAll({
      where,
      limit: Number(limit),
      offset,
      order: [['created_at', 'DESC']]
    });

    res.json(paginate(rows, count, Number(page), Number(limit)));
  } catch (err) {
    next(err);
  }
};

export const getUnreadCount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await Notification.count({
      where: {
        user_id: req.user!.id,
        is_read: false
      }
    });

    res.json(success({ count }, '获取未读通知数量成功'));
  } catch (err) {
    next(err);
  }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);

    const notification = await Notification.findByPk(id);

    if (!notification) {
      return res.status(404).json(error('通知不存在', 404));
    }

    if (notification.user_id !== req.user!.id) {
      return res.status(403).json(error('无权限操作此通知', 403));
    }

    notification.is_read = true;
    await notification.save();

    res.json(success(notification, '标记通知已读成功'));
  } catch (err) {
    next(err);
  }
};

export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await Notification.update(
      { is_read: true },
      {
        where: {
          user_id: req.user!.id,
          is_read: false
        }
      }
    );

    res.json(success(null, '标记所有通知已读成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteNotification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);

    const notification = await Notification.findByPk(id);

    if (!notification) {
      return res.status(404).json(error('通知不存在', 404));
    }

    if (notification.user_id !== req.user!.id) {
      return res.status(403).json(error('无权限删除此通知', 403));
    }

    await notification.destroy();

    res.json(success(null, '删除通知成功'));
  } catch (err) {
    next(err);
  }
};
