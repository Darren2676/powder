import { Request, Response, NextFunction } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import { Ticket, User } from '../models';
import { success } from '../utils/response.util';
import dayjs from 'dayjs';

export const getStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const totalTickets = await Ticket.count();

    const pendingCount = await Ticket.count({ where: { status: 'pending' } });
    const inProgressCount = await Ticket.count({ where: { status: 'in_progress' } });
    const completedCount = await Ticket.count({ where: { status: 'completed' } });
    const closedCount = await Ticket.count({ where: { status: 'closed' } });

    const lowCount = await Ticket.count({ where: { priority: 'low' } });
    const mediumCount = await Ticket.count({ where: { priority: 'medium' } });
    const highCount = await Ticket.count({ where: { priority: 'high' } });
    const urgentCount = await Ticket.count({ where: { priority: 'urgent' } });

    const today = dayjs().startOf('day').toDate();
    const todayNew = await Ticket.count({
      where: {
        created_at: {
          [Op.gte]: today
        }
      }
    });

    const weekStart = dayjs().startOf('week').toDate();
    const weekCompleted = await Ticket.count({
      where: {
        status: 'completed',
        completed_at: {
          [Op.gte]: weekStart
        }
      }
    });

    res.json(success({
      total: totalTickets,
      byStatus: {
        pending: pendingCount,
        in_progress: inProgressCount,
        completed: completedCount,
        closed: closedCount
      },
      byPriority: {
        low: lowCount,
        medium: mediumCount,
        high: highCount,
        urgent: urgentCount
      },
      todayNew,
      weekCompleted
    }, '获取统计数据成功'));
  } catch (err) {
    next(err);
  }
};

export const getStatusDistribution = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const distribution = await Ticket.findAll({
      attributes: [
        'status',
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    res.json(success(distribution, '获取状态分布成功'));
  } catch (err) {
    next(err);
  }
};

export const getPriorityDistribution = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const distribution = await Ticket.findAll({
      attributes: [
        'priority',
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['priority'],
      raw: true
    });

    res.json(success(distribution, '获取优先级分布成功'));
  } catch (err) {
    next(err);
  }
};

export const getAssigneeWorkload = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workload = await Ticket.findAll({
      attributes: [
        'assignee_id',
        [fn('COUNT', col('Ticket.id')), 'ticket_count']
      ],
      where: {
        assignee_id: {
          [Op.ne]: null as any
        }
      },
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'real_name', 'avatar']
        }
      ],
      group: ['Ticket.assignee_id', 'assignee.id', 'assignee.username', 'assignee.real_name', 'assignee.avatar'],
      raw: false
    });

    res.json(success(workload, '获取负责人工作量成功'));
  } catch (err) {
    next(err);
  }
};

export const getTrend = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { days = 30 } = req.query;
    const startDate = dayjs().subtract(Number(days), 'day').startOf('day').toDate();

    // SQL Server uses CONVERT(date, col) instead of DATE(col)
    const dateExpr = literal("CONVERT(date, created_at)");
    const trend = await Ticket.findAll({
      attributes: [
        [dateExpr, 'date'],
        [fn('COUNT', col('id')), 'count']
      ],
      where: {
        created_at: {
          [Op.gte]: startDate
        }
      },
      group: [dateExpr as any],
      order: [[dateExpr as any, 'ASC']],
      raw: true
    });

    res.json(success(trend, '获取趋势数据成功'));
  } catch (err) {
    next(err);
  }
};

export const getMyStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const createdTotal = await Ticket.count({
      where: { creator_id: userId }
    });

    const assignedTotal = await Ticket.count({
      where: { assignee_id: userId }
    });

    const assignedPending = await Ticket.count({
      where: {
        assignee_id: userId,
        status: 'pending'
      }
    });

    const assignedInProgress = await Ticket.count({
      where: {
        assignee_id: userId,
        status: 'in_progress'
      }
    });

    const assignedCompleted = await Ticket.count({
      where: {
        assignee_id: userId,
        status: 'completed'
      }
    });

    const thisWeekStart = dayjs().startOf('week').toDate();
    const thisWeekCompleted = await Ticket.count({
      where: {
        assignee_id: userId,
        status: 'completed',
        completed_at: {
          [Op.gte]: thisWeekStart
        }
      }
    });

    res.json(success({
      created: {
        total: createdTotal
      },
      assigned: {
        total: assignedTotal,
        pending: assignedPending,
        in_progress: assignedInProgress,
        completed: assignedCompleted
      },
      thisWeekCompleted
    }, '获取我的统计数据成功'));
  } catch (err) {
    next(err);
  }
};
