-- ============================================================
-- 工程更改（产品生命周期）— 数据库表创建脚本
-- 版本: v1.0
-- 日期: 2026-05-29
-- ============================================================

-- 1. 工程更改主表（按产品聚合）
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'engineering_change_lifecycle')
BEGIN
    CREATE TABLE engineering_change_lifecycle (
        id                          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        product_number              NVARCHAR(50)  NOT NULL,                 -- 产品编号（关联 item_master.item_number）
        product_name                NVARCHAR(200) NULL,                     -- 产品名称（冗余）
        customer_number             NVARCHAR(50)  NULL,                     -- 客户编号（关联 customer.customer_number）
        customer_name               NVARCHAR(200) NULL,                     -- 客户名称（冗余）
        origin_sample_request_no    NVARCHAR(30)  NULL,                     -- 起源样品申请单号
        sample_pass_date            DATE          NULL,                     -- 样件通过日期
        lifecycle_status            NVARCHAR(20)  NOT NULL DEFAULT N'进行中', -- 进行中/已完成/已关闭
        latest_change_type          NVARCHAR(50)  NULL,                     -- 最近一次变更类型（冗余）
        latest_change_at            DATETIME      NULL,                     -- 最近一次变更时间（冗余）
        change_count                INT           NOT NULL DEFAULT 0,       -- 变更次数（冗余）
        remark                      NVARCHAR(1000) NULL,                    -- 备注
        created_by                  NVARCHAR(50)  NULL,                     -- 创建人
        created_at                  DATETIME      DEFAULT GETDATE(),        -- 创建时间
        updated_by                  NVARCHAR(50)  NULL,                     -- 更新人
        updated_at                  DATETIME      DEFAULT GETDATE()         -- 更新时间
    );

    CREATE UNIQUE INDEX UX_ec_lifecycle_product ON engineering_change_lifecycle(product_number);
    CREATE INDEX IX_ec_lifecycle_status   ON engineering_change_lifecycle(lifecycle_status);
    CREATE INDEX IX_ec_lifecycle_customer ON engineering_change_lifecycle(customer_number);
END;
GO

-- 2. 工程更改日志（变更履历子表）
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'engineering_change_log')
BEGIN
    CREATE TABLE engineering_change_log (
        id                          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        lifecycle_id                INT           NOT NULL,                 -- 关联主表
        product_number              NVARCHAR(50)  NOT NULL,                 -- 产品编号（冗余）
        change_seq                  INT           NULL,                     -- 同一产品的变更序号
        change_date                 DATE          NOT NULL,                 -- 变更日期
        change_type                 NVARCHAR(50)  NOT NULL,                 -- 样件通过/客户要求变更/工艺调整/其他
        change_summary              NVARCHAR(200) NOT NULL,                 -- 变更摘要
        change_detail               NVARCHAR(MAX) NULL,                     -- 变更详情
        before_value                NVARCHAR(MAX) NULL,                     -- 变更前
        after_value                 NVARCHAR(MAX) NULL,                     -- 变更后
        related_sample_request_no   NVARCHAR(30)  NULL,                     -- 关联样品申请单号
        related_routing_id          NVARCHAR(50)  NULL,                     -- 关联工艺路线编号
        related_bom_id              NVARCHAR(50)  NULL,                     -- 关联BOM编号
        handled_by                  NVARCHAR(50)  NULL,                     -- 处理人
        attachment_url              NVARCHAR(500) NULL,                     -- 附件URL
        created_by                  NVARCHAR(50)  NULL,                     -- 创建人
        created_at                  DATETIME      DEFAULT GETDATE(),        -- 创建时间
        CONSTRAINT FK_ec_log_lifecycle FOREIGN KEY (lifecycle_id)
            REFERENCES engineering_change_lifecycle(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_ec_log_lifecycle ON engineering_change_log(lifecycle_id);
    CREATE INDEX IX_ec_log_product   ON engineering_change_log(product_number);
    CREATE INDEX IX_ec_log_date      ON engineering_change_log(change_date);
END;
GO
