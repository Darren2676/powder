import { Request, Response, NextFunction } from 'express';
import { Comment, User, Ticket, Notification } from '../models';
import { success, error } from '../utils/response.util';

export const getComments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = Number(req.params.ticketId);

    const comments = await Comment.findAll({
      where: {
        ticket_id: ticketId
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'real_name', 'avatar']
        }
      ],
      order: [['created_at', 'ASC']]
    });

    res.json(success(comments, '获取评论列表成功'));
  } catch (err) {
    next(err);
  }
};

export const createComment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = Number(req.params.ticketId);
    const { content } = req.body;

    if (!content) {
      return res.status(400).json(error('评论内容不能为空', 400));
    }

    const ticket = await Ticket.findByPk(ticketId);

    if (!ticket) {
      return res.status(404).json(error('工单不存在', 404));
    }

    const comment = await Comment.create({
      ticket_id: Number(ticketId),
      user_id: req.user!.id,
      content
    });

    if (ticket.creator_id !== req.user!.id) {
      await Notification.create({
        user_id: ticket.creator_id,
        ticket_id: ticket.id,
        type: 'commented',
        title: '新评论',
        content: `工单 "${ticket.title}" 有新评论`
      });
    }

    if (ticket.assignee_id && ticket.assignee_id !== req.user!.id) {
      await Notification.create({
        user_id: ticket.assignee_id,
        ticket_id: ticket.id,
        type: 'commented',
        title: '新评论',
        content: `工单 "${ticket.title}" 有新评论`
      });
    }

    const createdComment = await Comment.findByPk(comment.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'real_name', 'avatar']
        }
      ]
    });

    res.status(201).json(success(createdComment, '添加评论成功'));
  } catch (err) {
    next(err);
  }
};

export const updateComment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const { content } = req.body;

    if (!content) {
      return res.status(400).json(error('评论内容不能为空', 400));
    }

    const comment = await Comment.findByPk(id);

    if (!comment) {
      return res.status(404).json(error('评论不存在', 404));
    }

    if (comment.user_id !== req.user!.id) {
      return res.status(403).json(error('无权限修改此评论', 403));
    }

    comment.content = content;
    await comment.save();

    const updatedComment = await Comment.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'real_name', 'avatar']
        }
      ]
    });

    res.json(success(updatedComment, '更新评论成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteComment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);

    const comment = await Comment.findByPk(id);

    if (!comment) {
      return res.status(404).json(error('评论不存在', 404));
    }

    if (comment.user_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json(error('无权限删除此评论', 403));
    }

    await comment.destroy();

    res.json(success(null, '删除评论成功'));
  } catch (err) {
    next(err);
  }
};
