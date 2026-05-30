-- ============================================================
-- 报销单管理 — 数据库表创建脚本
-- 版本: v1.0
-- 日期: 2026-05-29
-- ============================================================

-- 1. 报销单主表
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'expense_claim')
BEGIN
    CREATE TABLE expense_claim (
        id                          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        claim_number                NVARCHAR(30)  NOT NULL,               -- 报销单编号 RE-YYYYMMDD-NNN
        claim_date                  DATE          NOT NULL,               -- 报销日期
        claim_type                  NVARCHAR(50)  NOT NULL,               -- 报销类型：差旅费/日常报销/招待费/其他
        applicant_id                INT           NOT NULL,               -- 申请人 user.id
        applicant_name              NVARCHAR(50)  NULL,                   -- 申请人姓名（冗余）
        department                  NVARCHAR(100) NULL,                   -- 部门
        purpose                     NVARCHAR(500) NULL,                   -- 事由
        total_amount                DECIMAL(18,2) NOT NULL DEFAULT 0,    -- 报销总额（由明细汇总）
        advance_amount              DECIMAL(18,2) NOT NULL DEFAULT 0,    -- 预支金额
        return_amount               DECIMAL(18,2) NOT NULL DEFAULT 0,    -- 退回金额
        supplement_amount           DECIMAL(18,2) NOT NULL DEFAULT 0,    -- 补领金额
        approval_status             NVARCHAR(20)  NOT NULL DEFAULT N'草稿', -- 草稿/待审批/审批中/已审批/已驳回/已撤回
        current_step                INT           NOT NULL DEFAULT 0,    -- 当前审批步骤（0=草稿, 1/2/3...=第N步待审）
        remark                      NVARCHAR(1000) NULL,                  -- 备注
        created_by                  NVARCHAR(50)  NULL,
        created_at                  DATETIME      DEFAULT GETDATE(),
        updated_by                  NVARCHAR(50)  NULL,
        updated_at                  DATETIME      DEFAULT GETDATE()
    );

    CREATE UNIQUE INDEX UX_expense_claim_number ON expense_claim(claim_number);
    CREATE INDEX IX_expense_claim_applicant   ON expense_claim(applicant_id);
    CREATE INDEX IX_expense_claim_status       ON expense_claim(approval_status);
    CREATE INDEX IX_expense_claim_date         ON expense_claim(claim_date);
END;
GO

-- 2. 报销单费用明细
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'expense_claim_item')
BEGIN
    CREATE TABLE expense_claim_item (
        id                          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        claim_number                NVARCHAR(30)  NOT NULL,               -- 关联主表
        expense_category            NVARCHAR(50)  NOT NULL,               -- 交通费/住宿费/出差补贴/餐饮费/其他
        trip_from                   NVARCHAR(100) NULL,                   -- 起点（差旅专用）
        trip_to                     NVARCHAR(100) NULL,                   -- 终点（差旅专用）
        trip_start_date             DATE          NULL,                   -- 出发日期（差旅专用）
        trip_end_date               DATE          NULL,                   -- 返回日期（差旅专用）
        vehicle_type                NVARCHAR(50)  NULL,                   -- 交通工具（差旅专用）
        receipt_count               INT           NOT NULL DEFAULT 0,    -- 单据张数
        person_count                INT           NOT NULL DEFAULT 1,    -- 人数（补贴类）
        days                        DECIMAL(5,1)  NOT NULL DEFAULT 0,    -- 天数（补贴类）
        subsidy_rate                DECIMAL(18,2) NOT NULL DEFAULT 0,    -- 补贴标准/单价
        amount                      DECIMAL(18,2) NOT NULL,              -- 金额
        item_remark                 NVARCHAR(500) NULL,                   -- 明细备注
        sort_order                  INT           NOT NULL DEFAULT 0,    -- 排序
        CONSTRAINT FK_eci_claim FOREIGN KEY (claim_number)
            REFERENCES expense_claim(claim_number) ON DELETE CASCADE
    );

    CREATE INDEX IX_eci_claim    ON expense_claim_item(claim_number);
    CREATE INDEX IX_eci_category ON expense_claim_item(expense_category);
END;
GO

-- 3. 审批步骤表
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'expense_claim_approval_step')
BEGIN
    CREATE TABLE expense_claim_approval_step (
        id                          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        claim_number                NVARCHAR(30)  NOT NULL,               -- 关联主表
        step_number                 INT           NOT NULL,               -- 步骤序号 1/2/3...
        step_name                   NVARCHAR(100) NULL,                   -- 步骤名称：主管审批/财务复核/出纳确认
        approver_id                 INT           NULL,                   -- 审批人 user.id
        approver_name               NVARCHAR(50)  NULL,                   -- 审批人姓名
        status                      NVARCHAR(20)  NOT NULL DEFAULT N'待审批', -- 待审批/已通过/已驳回
        approved_at                 DATETIME      NULL,                   -- 审批时间
        remark                      NVARCHAR(500) NULL,                   -- 审批意见
        CONSTRAINT FK_ecas_claim FOREIGN KEY (claim_number)
            REFERENCES expense_claim(claim_number) ON DELETE CASCADE
    );

    CREATE INDEX IX_ecas_claim    ON expense_claim_approval_step(claim_number);
    CREATE INDEX IX_ecas_approver ON expense_claim_approval_step(approver_id);
END;
GO

-- 4. 附件表
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'expense_claim_attachment')
BEGIN
    CREATE TABLE expense_claim_attachment (
        id                          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        claim_number                NVARCHAR(30)  NOT NULL,               -- 关联主表
        file_name                   NVARCHAR(200) NULL,                   -- 文件名
        file_url                    NVARCHAR(500) NULL,                   -- 文件路径
        file_size                   INT           NULL,                   -- 文件大小（字节）
        uploaded_by                 NVARCHAR(50)  NULL,                   -- 上传人
        uploaded_at                 DATETIME      DEFAULT GETDATE(),      -- 上传时间
        CONSTRAINT FK_eca_claim FOREIGN KEY (claim_number)
            REFERENCES expense_claim(claim_number) ON DELETE CASCADE
    );

    CREATE INDEX IX_eca_claim ON expense_claim_attachment(claim_number);
END;
GO
