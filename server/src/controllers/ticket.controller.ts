import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { Ticket, User, Comment, Attachment, Notification } from '../models';
import { success, error, paginate } from '../utils/response.util';

export const getTickets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      status, 
      priority, 
      assignee_id, 
      creator_id, 
      search, 
      page = 1, 
      limit = 10,
      sort = 'created_at',
      order = 'DESC'
    } = req.query;

    const where: any = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignee_id) where.assignee_id = assignee_id;
    if (creator_id) where.creator_id = creator_id;
    if (search) {
      where.title = {
        [Op.like]: `%${search}%`
      };
    }

    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows } = await Ticket.findAndCountAll({
      where,
      limit: Number(limit),
      offset,
      order: [[sort as string, order as string]],
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'real_name', 'avatar']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'real_name', 'avatar']
        }
      ]
    });

    res.json(paginate(rows, count, Number(page), Number(limit)));
  } catch (err) {
    next(err);
  }
};

export const getTicketById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);

    const ticket = await Ticket.findByPk(id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'real_name', 'avatar']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'real_name', 'avatar']
        },
        {
          model: Comment,
          as: 'comments',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'username', 'real_name', 'avatar']
            }
          ],
          order: [['created_at', 'ASC']]
        },
        {
          model: Attachment,
          as: 'attachments',
          include: [
            {
              model: User,
              as: 'uploader',
              attributes: ['id', 'username', 'real_name']
            }
          ]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json(error('工单不存在', 404));
    }

    res.json(success(ticket, '获取工单详情成功'));
  } catch (err) {
    next(err);
  }
};

export const createTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, priority, category, assignee_id, due_date } = req.body;

    if (!title || !description) {
      return res.status(400).json(error('标题和描述不能为空', 400));
    }

    const ticket = await Ticket.create({
      title,
      description,
      priority: priority || 'medium',
      category,
      creator_id: req.user!.id,
      assignee_id,
      due_date,
      status: 'pending'
    });

    if (assignee_id) {
      await Notification.create({
        user_id: assignee_id,
        ticket_id: ticket.id,
        type: 'assigned',
        title: '新工单分配',
        content: `您被分配了新工单: ${title}`
      });
    }

    const createdTicket = await Ticket.findByPk(ticket.id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'real_name', 'avatar']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'real_name', 'avatar']
        }
      ]
    });

    res.status(201).json(success(createdTicket, '创建工单成功'));
  } catch (err) {
    next(err);
  }
};

export const updateTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const { title, description, priority, category, due_date } = req.body;

    const ticket = await Ticket.findByPk(id);

    if (!ticket) {
      return res.status(404).json(error('工单不存在', 404));
    }

    if (ticket.creator_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json(error('无权限修改此工单', 403));
    }

    if (title !== undefined) ticket.title = title;
    if (description !== undefined) ticket.description = description;
    if (priority !== undefined) ticket.priority = priority;
    if (category !== undefined) ticket.category = category;
    if (due_date !== undefined) ticket.due_date = due_date;

    await ticket.save();

    const updatedTicket = await Ticket.findByPk(id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'real_name', 'avatar']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'real_name', 'avatar']
        }
      ]
    });

    res.json(success(updatedTicket, '更新工单成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);

    const ticket = await Ticket.findByPk(id);

    if (!ticket) {
      return res.status(404).json(error('工单不存在', 404));
    }

    if (ticket.creator_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json(error('无权限删除此工单', 403));
    }

    await ticket.destroy();

    res.json(success(null, '删除工单成功'));
  } catch (err) {
    next(err);
  }
};

export const assignTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const { assignee_id } = req.body;

    const ticket = await Ticket.findByPk(id);

    if (!ticket) {
      return res.status(404).json(error('工单不存在', 404));
    }

    const oldAssigneeId = ticket.assignee_id;
    ticket.assignee_id = assignee_id;
    await ticket.save();

    if (assignee_id) {
      await Notification.create({
        user_id: assignee_id,
        ticket_id: ticket.id,
        type: 'assigned',
        title: '工单分配',
        content: `您被分配了工单: ${ticket.title}`
      });
    }

    const updatedTicket = await Ticket.findByPk(id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'real_name', 'avatar']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'real_name', 'avatar']
        }
      ]
    });

    res.json(success(updatedTicket, '分配工单成功'));
  } catch (err) {
    next(err);
  }
};

export const updateStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;

    if (!status) {
      return res.status(400).json(error('状态不能为空', 400));
    }

    const ticket = await Ticket.findByPk(id);

    if (!ticket) {
      return res.status(404).json(error('工单不存在', 404));
    }

    const oldStatus = ticket.status;
    ticket.status = status;

    if (status === 'completed' && !ticket.completed_at) {
      ticket.completed_at = new Date();
    }

    await ticket.save();

    if (ticket.creator_id !== req.user!.id) {
      await Notification.create({
        user_id: ticket.creator_id,
        ticket_id: ticket.id,
        type: 'status_changed',
        title: '工单状态变更',
        content: `工单 "${ticket.title}" 状态从 ${oldStatus} 变更为 ${status}`
      });
    }

    if (ticket.assignee_id && ticket.assignee_id !== req.user!.id) {
      await Notification.create({
        user_id: ticket.assignee_id,
        ticket_id: ticket.id,
        type: 'status_changed',
        title: '工单状态变更',
        content: `工单 "${ticket.title}" 状态从 ${oldStatus} 变更为 ${status}`
      });
    }

    const updatedTicket = await Ticket.findByPk(id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'real_name', 'avatar']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'real_name', 'avatar']
        }
      ]
    });

    res.json(success(updatedTicket, '更新工单状态成功'));
  } catch (err) {
    next(err);
  }
};

export const getMyCreatedTickets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows } = await Ticket.findAndCountAll({
      where: {
        creator_id: req.user!.id
      },
      limit: Number(limit),
      offset,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'real_name', 'avatar']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'real_name', 'avatar']
        }
      ]
    });

    res.json(paginate(rows, count, Number(page), Number(limit)));
  } catch (err) {
    next(err);
  }
};

export const getMyAssignedTickets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows } = await Ticket.findAndCountAll({
      where: {
        assignee_id: req.user!.id
      },
      limit: Number(limit),
      offset,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'real_name', 'avatar']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'real_name', 'avatar']
        }
      ]
    });

    res.json(paginate(rows, count, Number(page), Number(limit)));
  } catch (err) {
    next(err);
  }
};
