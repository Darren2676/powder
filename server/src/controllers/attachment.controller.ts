import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { Attachment, Ticket, User } from '../models';
import { success, error } from '../utils/response.util';

export const uploadAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = Number(req.params.ticketId);

    if (!req.file) {
      return res.status(400).json(error('请上传文件', 400));
    }

    const ticket = await Ticket.findByPk(ticketId);

    if (!ticket) {
      if (req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json(error('工单不存在', 404));
    }

    const attachment = await Attachment.create({
      ticket_id: Number(ticketId),
      uploader_id: req.user!.id,
      original_name: req.file.originalname,
      file_name: req.file.filename,
      file_path: req.file.path,
      file_size: req.file.size,
      mime_type: req.file.mimetype
    });

    const createdAttachment = await Attachment.findByPk(attachment.id, {
      include: [
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'username', 'real_name']
        }
      ]
    });

    res.status(201).json(success(createdAttachment, '上传附件成功'));
  } catch (err) {
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
};

export const downloadAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);

    const attachment = await Attachment.findByPk(id);

    if (!attachment) {
      return res.status(404).json(error('附件不存在', 404));
    }

    if (!fs.existsSync(attachment.file_path)) {
      return res.status(404).json(error('文件不存在', 404));
    }

    res.download(attachment.file_path, attachment.original_name);
  } catch (err) {
    next(err);
  }
};

export const deleteAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);

    const attachment = await Attachment.findByPk(id);

    if (!attachment) {
      return res.status(404).json(error('附件不存在', 404));
    }

    if (attachment.uploader_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json(error('无权限删除此附件', 403));
    }

    if (fs.existsSync(attachment.file_path)) {
      fs.unlinkSync(attachment.file_path);
    }

    await attachment.destroy();

    res.json(success(null, '删除附件成功'));
  } catch (err) {
    next(err);
  }
};

export const getAttachments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = Number(req.params.ticketId);

    const attachments = await Attachment.findAll({
      where: {
        ticket_id: ticketId
      },
      include: [
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'username', 'real_name']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json(success(attachments, '获取附件列表成功'));
  } catch (err) {
    next(err);
  }
};
