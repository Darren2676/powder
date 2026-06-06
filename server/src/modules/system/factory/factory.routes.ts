import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireRole } from '../../../middleware/role.middleware';
import { generateToken } from '../../../utils/jwt.util';
import { Factory } from '../../../models';
import sequelize from '../../../config/database';
import { success, error } from '../../../utils/response.util';
import { getAccessibleFactories, isHQRole } from '../../../middleware/factoryScope.middleware';
import {
  getFactories,
  getFactoryById,
  createFactory,
  updateFactory,
  deleteFactory
} from './factory.controller';

const router = Router();

/**
 * GET /api/v1/factories/list
 * 获取当前用户可访问的工厂列表（用于顶部切换器）
 */
router.get('/list', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;

    // 总部角色：返回所有启用的工厂
    if (isHQRole(user.role)) {
      const factories = await Factory.findAll({
        where: { status: '启用' },
        order: [['id', 'ASC']]
      });
      return res.json(success(factories));
    }

    // 普通用户：返回 user_factory_access 中配置的工厂
    const factoryIds = await getAccessibleFactories(user.id);
    if (factoryIds.length === 0) {
      // 如果未配置多工厂权限，返回默认工厂
      if (user.default_factory_id) {
        const factory = await Factory.findByPk(user.default_factory_id);
        return res.json(success(factory ? [factory] : []));
      }
      return res.json(success([]));
    }

    const factories = await Factory.findAll({
      where: { id: factoryIds },
      order: [['id', 'ASC']]
    });
    return res.json(success(factories));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/factories/switch
 * 切换当前工厂（重新签发包含目标 factory_id 的 JWT）
 * Body: { factory_id: number }
 */
router.post('/switch', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { factory_id } = req.body;
    const user = req.user!;

    if (!factory_id) {
      return res.status(400).json(error('请指定目标工厂'));
    }

    // 总部角色：直接放行
    if (!isHQRole(user.role)) {
      // 普通用户：验证是否有目标工厂的访问权限
      const factoryIds = await getAccessibleFactories(user.id);
      if (factoryIds.length > 0 && !factoryIds.includes(factory_id)) {
        return res.status(403).json(error('无权限访问该工厂'));
      }
    }

    // 验证工厂存在
    const factory = await Factory.findOne({
      where: { id: factory_id, status: '启用' }
    });
    if (!factory) {
      return res.status(400).json(error('工厂不存在或已禁用'));
    }

    // 签发新 Token（包含新的 factory_id）
    const newToken = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      factory_id: factory_id
    });

    return res.json(success({
      token: newToken,
      factory: {
        id: factory.id,
        factory_code: factory.factory_code,
        factory_name: factory.factory_name,
        factory_short: factory.factory_short
      }
    }, '工厂切换成功'));
  } catch (err) {
    next(err);
  }
});

// ========== 工厂管理 CRUD（admin only）==========
router.get('/', authenticate, getFactories);
router.get('/:id', authenticate, getFactoryById);
router.post('/', authenticate, requireRole('admin'), createFactory);
router.put('/:id', authenticate, requireRole('admin'), updateFactory);
router.delete('/:id', authenticate, requireRole('admin'), deleteFactory);

export default router;
