import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { QueryTypes } from 'sequelize';
import { success, error } from '../../../utils/response.util';

export const getPreference = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { pageKey } = req.params;

    const rows: any[] = await sequelize.query(
      `SELECT preference_data FROM user_preferences WHERE user_id = :userId AND page_key = :pageKey`,
      { replacements: { userId, pageKey }, type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      return res.json(success({}, '无个性化配置'));
    }

    let data = {};
    try {
      data = JSON.parse(rows[0].preference_data || '{}');
    } catch (_) {
      data = {};
    }

    res.json(success(data, '获取成功'));
  } catch (err) {
    next(err);
  }
};

export const savePreference = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { pageKey } = req.params;
    const preferenceData = JSON.stringify(req.body || {});

    await sequelize.query(
      `MERGE user_preferences AS target
       USING (SELECT :userId AS user_id, :pageKey AS page_key) AS source
       ON target.user_id = source.user_id AND target.page_key = source.page_key
       WHEN MATCHED THEN
         UPDATE SET preference_data = :preferenceData, updated_at = GETDATE()
       WHEN NOT MATCHED THEN
         INSERT (user_id, page_key, preference_data, updated_at)
         VALUES (:userId, :pageKey, :preferenceData, GETDATE());`,
      { replacements: { userId, pageKey, preferenceData }, type: QueryTypes.RAW }
    );

    res.json(success(null, '保存成功'));
  } catch (err) {
    next(err);
  }
};
