import { Request, Response } from 'express';
import { success } from '../../utils/response.util';

export const uploadFile = (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: '请选择要上传的文件' });
    return;
  }
  const file = req.file as any;
  const originalName = Buffer.from(file.originalname, 'latin1').toString('utf-8');
  const url = `/uploads/${file.filename}`;
  res.json(success({
    originalName,
    filename: file.filename,
    url,
    size: file.size,
    mimetype: file.mimetype
  }, '上传成功'));
};
