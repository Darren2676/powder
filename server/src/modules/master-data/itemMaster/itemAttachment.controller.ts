import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// ==================== 查询附件列表 ====================
export const getAttachments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemNumber } = req.params;
    const category = (req.query.category as string) || '';

    let sql = `SELECT id, item_number, category, original_name, stored_name, file_size, mime_type, uploader, creation_date FROM item_attachment WHERE item_number = :itemNumber`;
    const replacements: any = { itemNumber };

    if (category) {
      sql += ` AND category = :category`;
      replacements.category = category;
    }
    sql += ` ORDER BY creation_date DESC`;

    const [rows]: any = await sequelize.query(sql, { replacements });
    res.json(success(rows, '获取附件列表成功'));
  } catch (err) { next(err); }
};

// ==================== 上传附件 ====================
export const uploadAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemNumber } = req.params;
    const category = req.body.category || '';
    const file = req.file;

    if (!file) {
      res.status(400).json({ success: false, message: '请选择要上传的文件' });
      return;
    }

    if (!category || !['设计图纸', '其他文件'].includes(category)) {
      // 删除已上传的物理文件
      try { fs.unlinkSync(file.path); } catch {}
      res.status(400).json({ success: false, message: '附件分类必须为 "设计图纸" 或 "其他文件"' });
      return;
    }

    // 获取上传人
    const uploader = (req as any).user?.username || '';

    try {
      await sequelize.query(`
        INSERT INTO item_attachment (item_number, category, original_name, stored_name, file_size, mime_type, uploader)
        VALUES (:item_number, :category, :original_name, :stored_name, :file_size, :mime_type, :uploader)
      `, {
        replacements: {
          item_number: itemNumber,
          category,
          original_name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
          stored_name: file.filename,
          file_size: file.size,
          mime_type: file.mimetype,
          uploader
        }
      });

      res.json(success(null, '上传附件成功'));
    } catch (dbErr) {
      // DB 写入失败，删除已存入的物理文件防止孤立文件
      try { fs.unlinkSync(file.path); } catch {}
      throw dbErr;
    }
  } catch (err) { next(err); }
};

// ==================== 下载附件 ====================
export const downloadAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const [rows]: any = await sequelize.query(
      `SELECT original_name, stored_name, mime_type FROM item_attachment WHERE id = :id`,
      { replacements: { id } }
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, message: '附件不存在' });
      return;
    }

    const { original_name, stored_name, mime_type } = rows[0];
    const filePath = path.resolve(UPLOAD_DIR, stored_name);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: '附件文件已丢失' });
      return;
    }

    // RFC 5987 编码处理中文文件名
    const encodedName = encodeURIComponent(original_name || stored_name);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Type', mime_type || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (err) { next(err); }
};

// ==================== 删除附件 ====================
export const deleteAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // 先查记录获取stored_name
    const [rows]: any = await sequelize.query(
      `SELECT stored_name FROM item_attachment WHERE id = :id`,
      { replacements: { id } }
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, message: '附件不存在' });
      return;
    }

    const storedName = rows[0].stored_name;

    // 删除DB记录
    await sequelize.query(`DELETE FROM item_attachment WHERE id = :id`, { replacements: { id } });

    // 删除物理文件(忽略文件不存在的错误)
    try {
      const filePath = path.resolve(UPLOAD_DIR, storedName);
      fs.unlinkSync(filePath);
    } catch {}

    res.json(success(null, '删除附件成功'));
  } catch (err) { next(err); }
};
