/**
 * Workflow Engine Database Migration Script
 * Creates all workflow-related tables + adds department_id to users table
 * 
 * Run: npx ts-node src/sql/migrations/030_migrate_workflow.ts
 */

import sequelize from '../../config/database'

async function migrateWorkflowTables() {
  console.log('Starting workflow tables migration...')

  try {
    await sequelize.authenticate()
    console.log('Database connection established.')

    // 1. Create departments table
    console.log('Creating departments table...')
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

    // 2. Add department_id to users table (keep existing department text field)
    console.log('Adding department_id to users table...')
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'department_id')
      BEGIN
        ALTER TABLE users ADD department_id INT NULL
      END
    `)

    // 3. Create workflow_definitions table
    console.log('Creating workflow_definitions table...')
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
        CREATE INDEX IX_wf_def_code_ver ON workflow_definitions(code, version);
      END
    `)

    // 4. Create workflow_nodes table
    console.log('Creating workflow_nodes table...')
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
          position_x INT NOT NULL DEFAULT 200,
          position_y INT NOT NULL DEFAULT 200,
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT UQ_wf_nodes_def_key UNIQUE (definition_id, node_key)
        );
        CREATE INDEX IX_wf_nodes_def ON workflow_nodes(definition_id);
      END
    `)

    // 5. Create workflow_node_handlers table
    console.log('Creating workflow_node_handlers table...')
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

    // 6. Create workflow_edges table
    console.log('Creating workflow_edges table...')
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

    // 7. Create workflow_instances table
    console.log('Creating workflow_instances table...')
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
        CREATE INDEX IX_wf_inst_status ON workflow_instances(status);
        CREATE INDEX IX_wf_inst_initiator ON workflow_instances(initiator_id);
      END
    `)

    // 8. Create workflow_tasks table
    console.log('Creating workflow_tasks table...')
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
        CREATE INDEX IX_wf_tasks_node ON workflow_tasks(node_id);
      END
    `)

    // 9. Create workflow_history table
    console.log('Creating workflow_history table...')
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

    console.log('All workflow tables created successfully!')
    console.log('Migration completed.')

  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  } finally {
    await sequelize.close()
  }
}

// Run if called directly
migrateWorkflowTables()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))

export { migrateWorkflowTables }
