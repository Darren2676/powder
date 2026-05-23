/**
 * 权限测试辅助函数
 * 
 * 提供权限相关的 API 操作：创建测试用户、分配角色、管理字段权限等
 */
import { APIRequestContext, request } from '@playwright/test';
import { query, T } from './db.helper';

const API_BASE = 'http://localhost:3000/api/v1';

// ==================== 登录与 Context ====================

/** 以指定用户登录并返回 token（带429重试+缓存） */
export async function loginAs(username: string, password: string, maxRetries = 5): Promise<string> {
  // 缓存命中则直接返回
  if (tokenCache[username]) return tokenCache[username];
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const ctx = await request.newContext();
    try {
      const res = await ctx.post(`${API_BASE}/auth/login`, {
        data: { username, password },
        timeout: 30_000, // 30秒超时，避免服务端冷启动时超时
      });
      if (res.ok()) {
        const body = await res.json();
        const token = body?.data?.token || body?.token;
        if (!token) throw new Error(`登录 ${username} 响应无 token: ${JSON.stringify(body)}`);
        tokenCache[username] = token;
        return token;
      }
      if (res.status() === 429 && attempt < maxRetries) {
        const delay = attempt * 5000;
        console.log(`[loginAs] ${username} 429限频，${delay / 1000}s后重试 (${attempt}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`登录 ${username} 失败 HTTP ${res.status()}: ${await res.text()}`);
    } finally {
      await ctx.dispose();
    }
  }
  throw new Error(`登录 ${username} 失败: ${maxRetries}次重试后仍429`);
}

// Token 缓存，避免重复登录触发429限频
const tokenCache: Record<string, string> = {};

/** 以 admin 登录获取带 token 的 APIContext（缓存token） */
export async function getAdminContext(): Promise<APIRequestContext> {
  if (!tokenCache['admin']) {
    tokenCache['admin'] = await loginAs('admin', 'admin123');
  }
  return await request.newContext({
    extraHTTPHeaders: {
      Authorization: `Bearer ${tokenCache['admin']}`,
      'Content-Type': 'application/json',
    },
  });
}

/** 以指定 token 创建 APIContext */
export async function getContextWithToken(token: string): Promise<APIRequestContext> {
  return await request.newContext({
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

// ==================== 用户管理 ====================

/** 创建测试用户，返回用户ID */
export async function createTestUser(username: string, displayName: string, password = 'Test@123'): Promise<number> {
  const ctx = await getAdminContext();
  try {
    const res = await ctx.post(`${API_BASE}/users`, {
      data: { username, password, display_name: displayName, phone: '13800000000', role: 'staff' },
    });
    if (!res.ok()) {
      const text = await res.text();
      // 用户已存在不算错误
      if (text.includes('已存在') || text.includes('已注册')) {
        console.log(`  用户 ${username} 已存在，跳过创建`);
        // 查找已有用户ID
        const rows = await query<any>(
          `SELECT id FROM users WHERE username = @u`,
          { u: { type: T.NVarChar, value: username } }
        );
        return rows[0]?.id;
      }
      throw new Error(`创建用户失败 ${res.status()}: ${text}`);
    }
    const body = await res.json();
    const userId = body?.data?.id;
    console.log(`  创建测试用户: ${username} (ID: ${userId})`);
    return userId;
  } finally {
    await ctx.dispose();
  }
}

/** 为用户分配角色（直接操作数据库，避免 User model isIn 验证限制） */
export async function assignUserRoles(userId: number, roleIds: number[]): Promise<void> {
  // 先删除旧关联
  try {
    await query(
      `DELETE FROM user_role WHERE user_id = @uid`,
      { uid: { type: T.Int, value: userId } }
    );
  } catch (e: any) {
    console.error(`assignUserRoles: DELETE user_role failed for userId=${userId}:`, e.message);
    throw e;
  }
  // 插入新关联
  for (const rid of roleIds) {
    try {
      await query(
        `INSERT INTO user_role (user_id, role_id) VALUES (@uid, @rid)`,
        { uid: { type: T.Int, value: userId }, rid: { type: T.Int, value: rid } }
      );
    } catch (e: any) {
      console.error(`assignUserRoles: INSERT user_role failed for userId=${userId}, roleId=${rid}:`, e.message);
      throw e;
    }
  }
}

/** 删除测试用户 */
export async function deleteUser(userId: number): Promise<void> {
  const ctx = await getAdminContext();
  try {
    await ctx.delete(`${API_BASE}/users/${userId}`);
  } finally {
    await ctx.dispose();
  }
}

/** 更新用户状态 */
export async function updateUserStatus(userId: number, status: string): Promise<void> {
  const ctx = await getAdminContext();
  try {
    await ctx.put(`${API_BASE}/users/${userId}/status`, { data: { status } });
  } finally {
    await ctx.dispose();
  }
}

// ==================== 角色管理 ====================

/** 创建测试角色，返回角色ID */
export async function createTestRole(roleCode: string, roleName: string): Promise<number> {
  const ctx = await getAdminContext();
  try {
    const res = await ctx.post(`${API_BASE}/roles`, {
      data: { role_name: roleName, role_code: roleCode, description: 'E2E测试角色' },
    });
    if (!res.ok()) {
      const text = await res.text();
      if (text.includes('已存在')) {
        console.log(`  角色 ${roleCode} 已存在，跳过创建`);
        const rows = await query<any>(
          `SELECT id FROM role WHERE role_code = @c`,
          { c: { type: T.NVarChar, value: roleCode } }
        );
        return rows[0]?.id;
      }
      throw new Error(`创建角色失败 ${res.status()}: ${text}`);
    }
    const body = await res.json();
    const roleId = body?.data?.id;
    console.log(`  创建测试角色: ${roleCode} (ID: ${roleId})`);
    return roleId;
  } finally {
    await ctx.dispose();
  }
}

/** 为角色分配权限（替换策略） */
export async function assignRolePermissions(roleId: number, permissionIds: number[]): Promise<void> {
  const ctx = await getAdminContext();
  try {
    const res = await ctx.put(`${API_BASE}/roles/${roleId}/permissions`, {
      data: { permission_ids: permissionIds },
    });
    if (!res.ok()) {
      throw new Error(`分配权限失败 ${res.status()}: ${await res.text()}`);
    }
  } finally {
    await ctx.dispose();
  }
}

/** 删除测试角色 */
export async function deleteRole(roleId: number): Promise<void> {
  const ctx = await getAdminContext();
  try {
    await ctx.delete(`${API_BASE}/roles/${roleId}`);
  } finally {
    await ctx.dispose();
  }
}

// ==================== 权限查询 ====================

/** 获取所有权限（admin视角） */
export async function getAllPermissions(): Promise<any[]> {
  const ctx = await getAdminContext();
  try {
    const res = await ctx.get(`${API_BASE}/permissions`);
    if (!res.ok()) throw new Error(`获取权限列表失败: ${await res.text()}`);
    const body = await res.json();
    return body?.data || [];
  } finally {
    await ctx.dispose();
  }
}

/** 获取当前用户权限 */
export async function getMyPermissions(token: string): Promise<{
  permissionCodes: string[];
  menuKeys: string[];
  operationPermissions: Record<string, string[]>;
  fieldPermissions: Record<string, string[]>;
  isAdmin: boolean;
}> {
  const ctx = await getContextWithToken(token);
  try {
    const res = await ctx.get(`${API_BASE}/permissions/mine`);
    if (!res.ok()) throw new Error(`获取我的权限失败: ${await res.text()}`);
    const body = await res.json();
    return body?.data || {};
  } finally {
    await ctx.dispose();
  }
}

/** 获取权限树（admin） */
export async function getPermissionTree(): Promise<any[]> {
  const ctx = await getAdminContext();
  try {
    const res = await ctx.get(`${API_BASE}/permissions/tree`);
    if (!res.ok()) throw new Error(`获取权限树失败: ${await res.text()}`);
    const body = await res.json();
    return body?.data || [];
  } finally {
    await ctx.dispose();
  }
}

// ==================== 字段权限便捷操作 ====================

/**
 * 查找指定页面+字段名的权限ID
 */
export async function findFieldPermissionId(pageCode: string, fieldName: string): Promise<number | null> {
  const code = `${pageCode}:field:${fieldName}`;
  const rows = await query<any>(
    `SELECT id FROM permission WHERE permission_code = @code AND permission_type = N'field'`,
    { code: { type: T.NVarChar, value: code } }
  );
  return rows[0]?.id || null;
}

/**
 * 查找指定页面的所有字段权限ID
 */
export async function findPageFieldPermissionIds(pageCode: string): Promise<number[]> {
  const rows = await query<any>(
    `SELECT id FROM permission WHERE permission_code LIKE @pattern AND permission_type = N'field'`,
    { pattern: { type: T.NVarChar, value: `${pageCode}:field:%` } }
  );
  return rows.map(r => r.id);
}

/**
 * 查找指定页面的page级权限ID（作为字段权限的parent）
 */
export async function findPagePermissionId(pageCode: string): Promise<number | null> {
  const rows = await query<any>(
    `SELECT id FROM permission WHERE permission_code = @code AND permission_type = N'page'`,
    { code: { type: T.NVarChar, value: pageCode } }
  );
  return rows[0]?.id || null;
}

/**
 * 查找角色ID
 */
export async function findRoleId(roleCode: string): Promise<number | null> {
  const rows = await query<any>(
    `SELECT id FROM role WHERE role_code = @c`,
    { c: { type: T.NVarChar, value: roleCode } }
  );
  return rows[0]?.id || null;
}

/**
 * 查找用户ID
 */
export async function findUserId(username: string): Promise<number | null> {
  const rows = await query<any>(
    `SELECT id FROM users WHERE username = @u`,
    { u: { type: T.NVarChar, value: username } }
  );
  return rows[0]?.id || null;
}

/**
 * 为角色添加指定页面的查看权限+指定字段权限
 * (不替换已有权限，只增量添加)
 */
export async function addFieldPermissionsToRole(roleId: number, pageCode: string, fieldNames: string[]): Promise<void> {
  // 收集需要分配的权限ID
  const permissionIds: number[] = [];

  // 1. 页面查看权限
  const viewCode = `${pageCode}:view`;
  const viewRows = await query<any>(
    `SELECT id FROM permission WHERE permission_code = @code`,
    { code: { type: T.NVarChar, value: viewCode } }
  );
  if (viewRows[0]) permissionIds.push(viewRows[0].id);

  // 2. 字段权限
  for (const field of fieldNames) {
    const fieldCode = `${pageCode}:field:${field}`;
    const fieldRows = await query<any>(
      `SELECT id FROM permission WHERE permission_code = @code`,
      { code: { type: T.NVarChar, value: fieldCode } }
    );
    if (fieldRows[0]) permissionIds.push(fieldRows[0].id);
  }

  // 3. 获取角色当前权限
  const currentPerms = await query<any>(
    `SELECT permission_id FROM role_permission WHERE role_id = @rid`,
    { rid: { type: T.Int, value: roleId } }
  );
  const currentPermIds = new Set(currentPerms.map(r => r.permission_id));

  // 4. 只插入新增的
  for (const pid of permissionIds) {
    if (!currentPermIds.has(pid)) {
      await query(
        `INSERT INTO role_permission (role_id, permission_id) VALUES (@rid, @pid)`,
        { rid: { type: T.Int, value: roleId }, pid: { type: T.Int, value: pid } }
      );
    }
  }
}

/**
 * 从角色移除指定字段权限
 */
export async function removeFieldPermissionsFromRole(roleId: number, pageCode: string, fieldNames: string[]): Promise<void> {
  for (const field of fieldNames) {
    const fieldCode = `${pageCode}:field:${field}`;
    const fieldRows = await query<any>(
      `SELECT id FROM permission WHERE permission_code = @code`,
      { code: { type: T.NVarChar, value: fieldCode } }
    );
    if (fieldRows[0]) {
      await query(
        `DELETE FROM role_permission WHERE role_id = @rid AND permission_id = @pid`,
        { rid: { type: T.Int, value: roleId }, pid: { type: T.Int, value: fieldRows[0].id } }
      );
    }
  }
}
