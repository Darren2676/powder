-- ============================================================
-- 样品申请管理 — 数据库表创建脚本
-- 版本: v1.0
-- 日期: 2026-05-15
-- ============================================================

-- 1. 样品申请主表
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'sample_request')
BEGIN
    CREATE TABLE sample_request (
        request_number      NVARCHAR(30)  NOT NULL PRIMARY KEY,   -- 编号: SR-YYYYMMDD-NNN
        request_date        DATE          NULL,                   -- 申请日期
        deadline_date       DATE          NULL,                   -- 需要完成日期
        applicant           NVARCHAR(50)  NULL,                   -- 申请人
        urgency             NVARCHAR(20)  DEFAULT N'一般',        -- 紧急程度: 一般/紧急/特急
        customer_name       NVARCHAR(200) NULL,                   -- 客户名称
        market              NVARCHAR(100) NULL,                   -- 市场
        competitor          NVARCHAR(200) NULL,                   -- 竞争对手
        estimated_price     DECIMAL(18,4) NULL,                   -- 预估售价(RMB/kg)
        potential_usage     DECIMAL(18,4) NULL,                   -- 潜在用量(吨/月)
        has_order           NVARCHAR(10)  NULL,                   -- 是否已有订单
        coating_workpiece   NVARCHAR(200) NULL,                   -- 喷涂工件
        substrate           NVARCHAR(100) NULL,                   -- 基材
        pretreatment        NVARCHAR(100) NULL,                   -- 前处理
        spray_gun_type      NVARCHAR(100) NULL,                   -- 喷枪类型
        recovery_system     NVARCHAR(100) NULL,                   -- 回收系统
        oven_type           NVARCHAR(100) NULL,                   -- 烤炉类型
        color_spec          NVARCHAR(500) NULL,                   -- 颜色
        product_type        NVARCHAR(200) NULL,                   -- 产品类型
        film_thickness      NVARCHAR(100) NULL,                   -- 膜厚范围
        gloss_range         NVARCHAR(100) NULL,                   -- 光泽范围
        curing_condition    NVARCHAR(100) NULL,                   -- 固化条件
        other_requirements  NVARCHAR(1000) NULL,                  -- 其它性能要求
        status              NVARCHAR(20)  DEFAULT N'草稿',        -- 流程状态
        approval_status     NVARCHAR(20)  DEFAULT N'草稿',        -- 审批状态
        created_by          NVARCHAR(50)  NULL,                   -- 创建人
        created_at          DATETIME      DEFAULT GETDATE(),      -- 创建时间
        updated_at          DATETIME      DEFAULT GETDATE()       -- 更新时间
    );

    CREATE INDEX IX_sample_request_status ON sample_request(status);
    CREATE INDEX IX_sample_request_approval ON sample_request(approval_status);
    CREATE INDEX IX_sample_request_created ON sample_request(created_by);
END;
GO

-- 2. 样品申请明细表（样品需求类型）
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'sample_request_item')
BEGIN
    CREATE TABLE sample_request_item (
        id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        request_number  NVARCHAR(30) NOT NULL,                     -- 关联主表
        item_type       NVARCHAR(50)  NULL,                        -- 类型: 样板/样粉/相溶性测试/测试报告/其他
        quantity        DECIMAL(18,4) NULL,                        -- 数量
        unit            NVARCHAR(20)  NULL,                        -- 单位: 片/公斤/次/份
        is_requested    BIT DEFAULT 0,                             -- 是否勾选
        sort_order      INT DEFAULT 0,                             -- 排序
        CONSTRAINT FK_item_request FOREIGN KEY (request_number) REFERENCES sample_request(request_number) ON DELETE CASCADE
    );

    CREATE INDEX IX_item_request_number ON sample_request_item(request_number);
END;
GO

-- 3. 实验室结果表（技术部填写）
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'sample_request_lab')
BEGIN
    CREATE TABLE sample_request_lab (
        id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        request_number  NVARCHAR(30) NOT NULL,                     -- 关联主表
        lab_panel_qty   DECIMAL(18,4) NULL,                        -- 寄出样板数量
        lab_powder_qty  DECIMAL(18,4) NULL,                        -- 寄出样粉数量(kg)
        completion_date DATE         NULL,                         -- 完成日期
        product_number  NVARCHAR(50)  NULL,                        -- 产品编号
        formula_cost    DECIMAL(18,4) NULL,                        -- 配方成本
        lab_remark      NVARCHAR(2000) NULL,                       -- 备注
        received_by     NVARCHAR(50)  NULL,                        -- 接收人
        received_at     DATETIME     NULL,                         -- 接收时间
        completed_by    NVARCHAR(50)  NULL,                        -- 完成人
        completed_at    DATETIME     NULL,                         -- 完成时间
        CONSTRAINT FK_lab_request FOREIGN KEY (request_number) REFERENCES sample_request(request_number) ON DELETE CASCADE
    );

    CREATE INDEX IX_lab_request_number ON sample_request_lab(request_number);
END;
GO
