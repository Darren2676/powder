/**
 * 工作流+系统表迁移
 * - workflow_definitions/nodes/edges/instances/tasks/history/handlers
 * - system_events 事件持久化表
 * - security_settings + login_logs (补充，与038互补)
 * - users 安全字段 (failed_login_attempts, locked_until, phone_verified)
 * - user_preferences, departments, users employee/department 字段
 */

import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  // workflow_definitions 表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='workflow_definitions' AND xtype='U')
      BEGIN
        CREATE TABLE workflow_definitions (
          id INT IDENTITY(1,1) PRIMARY KEY,
          code NVARCHAR(50) NOT NULL,
          name NVARCHAR(200) NOT NULL,
          module NVARCHAR(50) NOT NULL,
          description NVARCHAR(500) DEFAULT '',
          version INT NOT NULL DEFAULT 1,
          status NVARCHAR(20) NOT NULL DEFAULT N'draft',
          created_by INT NOT NULL,
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX IX_wf_def_module ON workflow_definitions(module, status);
      END
    `)
  } catch (e) { console.log('workflow_definitions 表迁移跳过或已存在') }

  // workflow_nodes 表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='workflow_nodes' AND xtype='U')
      BEGIN
        CREATE TABLE workflow_nodes (
          id INT IDENTITY(1,1) PRIMARY KEY,
          definition_id INT NOT NULL,
          node_key NVARCHAR(50) NOT NULL,
          node_type NVARCHAR(30) NOT NULL,
          name NVARCHAR(200) NOT NULL,
          sequence INT NOT NULL DEFAULT 0,
          handler_type NVARCHAR(30) NULL,
          countersign_type NVARCHAR(20) NULL,
          config NVARCHAR(MAX) DEFAULT '',
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT UQ_wf_nodes_def_key UNIQUE (definition_id, node_key)
        );
        CREATE INDEX IX_wf_nodes_def ON workflow_nodes(definition_id);
      END
    `)
  } catch (e) { console.log('workflow_nodes 表迁移跳过或已存在') }

  // 补充开始/结束节点
  try {
    await sequelize.query(`
      INSERT INTO workflow_nodes (definition_id, node_key, node_type, name, sequence, position_x, position_y)
      SELECT d.id, N'start', N'start', N'开始', 0, 100, 200
      FROM workflow_definitions d
      WHERE NOT EXISTS (
        SELECT 1 FROM workflow_nodes n WHERE n.definition_id = d.id AND n.node_type = N'start'
      )
    `)
    await sequelize.query(`
      INSERT INTO workflow_nodes (definition_id, node_key, node_type, name, sequence, position_x, position_y)
      SELECT d.id, N'end', N'end', N'结束', 999, 500, 200
      FROM workflow_definitions d
      WHERE NOT EXISTS (
        SELECT 1 FROM workflow_nodes n WHERE n.definition_id = d.id AND n.node_type = N'end'
      )
    `)
  } catch (e) { console.log('补充开始/结束节点迁移跳过或已完成') }

  // workflow_nodes position_x, position_y 列
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('workflow_nodes') AND name = 'position_x')
      BEGIN
        ALTER TABLE workflow_nodes ADD position_x INT NOT NULL DEFAULT 200;
        ALTER TABLE workflow_nodes ADD position_y INT NOT NULL DEFAULT 200;
      END
    `)
  } catch (e) { console.log('workflow_nodes position 列迁移跳过或已存在') }

  // workflow_node_handlers 表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='workflow_node_handlers' AND xtype='U')
      BEGIN
        CREATE TABLE workflow_node_handlers (
          id INT IDENTITY(1,1) PRIMARY KEY,
          node_id INT NOT NULL,
          handler_type NVARCHAR(30) NOT NULL,
          user_id INT NULL,
          role NVARCHAR(20) NULL,
          department_id INT NULL
        );
        CREATE INDEX IX_wf_nh_node ON workflow_node_handlers(node_id);
      END
    `)
  } catch (e) { console.log('workflow_node_handlers 表迁移跳过或已存在') }

  // workflow_edges 表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='workflow_edges' AND xtype='U')
      BEGIN
        CREATE TABLE workflow_edges (
          id INT IDENTITY(1,1) PRIMARY KEY,
          definition_id INT NOT NULL,
          from_node_id INT NOT NULL,
          to_node_id INT NOT NULL,
          condition_expression NVARCHAR(500) NULL,
          condition_label NVARCHAR(100) DEFAULT '',
          priority INT DEFAULT 0,
          created_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX IX_wf_edges_def ON workflow_edges(definition_id);
        CREATE INDEX IX_wf_edges_from ON workflow_edges(from_node_id);
      END
    `)
  } catch (e) { console.log('workflow_edges 表迁移跳过或已存在') }

  // workflow_instances 表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='workflow_instances' AND xtype='U')
      BEGIN
        CREATE TABLE workflow_instances (
          id INT IDENTITY(1,1) PRIMARY KEY,
          definition_id INT NOT NULL,
          module NVARCHAR(50) NOT NULL,
          record_id NVARCHAR(100) NOT NULL,
          title NVARCHAR(200) DEFAULT '',
          status NVARCHAR(20) NOT NULL DEFAULT N'running',
          current_node_id INT NULL,
          initiator_id INT NOT NULL,
          initiator_name NVARCHAR(100) NOT NULL,
          business_data NVARCHAR(MAX) DEFAULT '',
          started_at DATETIME DEFAULT GETDATE(),
          completed_at DATETIME NULL
        );
        CREATE INDEX IX_wf_inst_module_record ON workflow_instances(module, record_id);
        CREATE INDEX IX_wf_inst_initiator ON workflow_instances(initiator_id);
      END
    `)
  } catch (e) { console.log('workflow_instances 表迁移跳过或已存在') }

  // workflow_tasks 表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='workflow_tasks' AND xtype='U')
      BEGIN
        CREATE TABLE workflow_tasks (
          id INT IDENTITY(1,1) PRIMARY KEY,
          instance_id INT NOT NULL,
          node_id INT NOT NULL,
          node_key NVARCHAR(50) NOT NULL,
          node_name NVARCHAR(200) NOT NULL,
          node_type NVARCHAR(30) NOT NULL,
          assignee_id INT NOT NULL,
          assignee_name NVARCHAR(100) NOT NULL,
          status NVARCHAR(20) NOT NULL DEFAULT N'pending',
          remark NVARCHAR(500) DEFAULT '',
          created_at DATETIME DEFAULT GETDATE(),
          completed_at DATETIME NULL
        );
        CREATE INDEX IX_wf_tasks_assignee ON workflow_tasks(assignee_id, status);
        CREATE INDEX IX_wf_tasks_instance ON workflow_tasks(instance_id);
      END
    `)
  } catch (e) { console.log('workflow_tasks 表迁移跳过或已存在') }

  // workflow_history 表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='workflow_history' AND xtype='U')
      BEGIN
        CREATE TABLE workflow_history (
          id INT IDENTITY(1,1) PRIMARY KEY,
          instance_id INT NOT NULL,
          node_id INT NULL,
          node_name NVARCHAR(200) DEFAULT '',
          action NVARCHAR(30) NOT NULL,
          from_status NVARCHAR(20) DEFAULT '',
          to_status NVARCHAR(20) DEFAULT '',
          operator_id INT NOT NULL,
          operator_name NVARCHAR(100) NOT NULL,
          remark NVARCHAR(500) DEFAULT '',
          created_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX IX_wf_history_instance ON workflow_history(instance_id);
      END
    `)
  } catch (e) { console.log('workflow_history 表迁移跳过或已存在') }

  // system_events 事件持久化表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='system_events' AND xtype='U')
      BEGIN
        CREATE TABLE system_events (
          id BIGINT IDENTITY(1,1) PRIMARY KEY,
          event_type NVARCHAR(100) NOT NULL,
          event_name NVARCHAR(100) NOT NULL,
          payload NVARCHAR(MAX),
          status NVARCHAR(20) DEFAULT N'pending' NOT NULL,
          retry_count INT DEFAULT 0,
          error_message NVARCHAR(MAX),
          created_at DATETIME DEFAULT GETDATE(),
          processed_at DATETIME
        );
        CREATE INDEX IX_system_events_status ON system_events(status);
        CREATE INDEX IX_system_events_created_at ON system_events(created_at);
      END
    `)
  } catch (e) { console.log('system_events 迁移跳过或已存在') }

  // users 安全字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'failed_login_attempts')
      BEGIN
        ALTER TABLE users ADD failed_login_attempts INT DEFAULT 0
      END;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'locked_until')
      BEGIN
        ALTER TABLE users ADD locked_until DATETIME NULL
      END;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'phone_verified')
      BEGIN
        ALTER TABLE users ADD phone_verified BIT DEFAULT 0
      END
    `)
  } catch (e) { console.log('users 安全字段迁移跳过或已存在') }

  // user_preferences 表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_preferences' AND xtype='U')
      BEGIN
        CREATE TABLE user_preferences (
          id INT IDENTITY(1,1) PRIMARY KEY,
          user_id INT NOT NULL,
          page_key NVARCHAR(100) NOT NULL,
          preference_data NVARCHAR(MAX) DEFAULT '',
          updated_at DATETIME DEFAULT GETDATE()
        );
        CREATE UNIQUE INDEX UQ_user_preferences_user_page ON user_preferences(user_id, page_key);
      END
    `)
  } catch (e) { console.log('user_preferences 表迁移跳过或已存在') }

  // departments 表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='departments' AND xtype='U')
      BEGIN
        CREATE TABLE departments (
          id INT IDENTITY(1,1) PRIMARY KEY,
          dept_code NVARCHAR(50) NOT NULL,
          dept_name NVARCHAR(100) NOT NULL,
          description NVARCHAR(500) DEFAULT '',
          status NVARCHAR(20) DEFAULT N'active',
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT UQ_departments_code UNIQUE (dept_code)
        )
      END
    `)
  } catch (e) { console.log('departments 表迁移跳过或已存在') }

  // users 表添加 employee_number, employee_name 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'employee_number')
      BEGIN
        ALTER TABLE users ADD employee_number NVARCHAR(50) NULL DEFAULT ''
      END;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'employee_name')
      BEGIN
        ALTER TABLE users ADD employee_name NVARCHAR(100) NULL DEFAULT ''
      END
    `)
  } catch (e) { console.log('users employee_number/employee_name 迁移跳过或已存在') }

  // users 表添加 department_id 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'department_id')
      BEGIN
        ALTER TABLE users ADD department_id INT NULL
      END
    `)
  } catch (e) { console.log('users.department_id 迁移跳过或已存在') }
}
