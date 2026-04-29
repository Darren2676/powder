import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config/database', () => ({
  default: {
    query: vi.fn(),
    transaction: vi.fn(async (work: any) => {
      const tx = { commit: vi.fn(), rollback: vi.fn() };
      return await work(tx);
    }),
  },
}));
vi.mock('@/services/documentNumber.service', () => ({
  generateWRNumber: vi.fn().mockResolvedValue('WR-20260423-001'),
}));
vi.mock('@/services/linesideMovement.service', () => ({
  logWorkReportLinesideMovement: vi.fn().mockResolvedValue(undefined),
  logWorkReportReverseLinesideMovement: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/salesOrderSync.service', () => ({
  syncProductionStatus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/modules/quality/productionInspection/productionInspection.controller', () => ({
  createInspectionFromWorkReport: vi.fn().mockResolvedValue('QI-001'),
}));

import { createWorkReport } from '@/services/workReport.service';
import { createInspectionFromWorkReport } from '@/modules/quality/productionInspection/productionInspection.controller';
import sequelize from '@/config/database';

const queryFn = sequelize.query as ReturnType<typeof vi.fn>;
const createInspectionMock = createInspectionFromWorkReport as ReturnType<typeof vi.fn>;

/** 构建 createWorkReport 所需的完整 mock 查询链（检验门控之前） */
function mockPreGateQueries(prevInspectStatus: string | null) {
  queryFn
    // 1. SELECT process_task
    .mockResolvedValueOnce([[{
      process_task_number: 'PT-002', production_order_number: 'P-001',
      step_number: 20, standard_process_name: '工序2',
      item_number: '110103', item_name: '密封件', specifications: 'Φ50',
      basic_unit: '个', work_center_number: 'WC-001', work_center_name: '中心1',
      planned_quantity: 100, completed_quantity: 0, excess_reporting_ratio: 0,
      task_status: '进行中', approval_status: '已审批',
    }]])
    // 2. SELECT plan_status
    .mockResolvedValueOnce([[{ plan_status: '生产中' }]])
    // 3. SELECT first_step
    .mockResolvedValueOnce([[{ first_step: 10 }]])
    // 4. 物料门控
    .mockResolvedValueOnce([[{ mat_count: 0, issued_count: 0 }]])
    // 5. SELECT actual_daily_output (超额校验)
    .mockResolvedValueOnce([[{ actual_daily_output: 0 }]])
    // 6. SELECT all steps (跨工序验证，只有2道工序，跳过中间校验)
    .mockResolvedValueOnce([[{ process_task_number: 'PT-001', step_number: 10, completed_quantity: 50, standard_process_name: '工序1' }, { process_task_number: 'PT-002', step_number: 20, completed_quantity: 0, standard_process_name: '工序2' }]])
    // 7. SELECT actual_daily_output (班产上限)
    .mockResolvedValueOnce([[{ actual_daily_output: 0 }]])
    // 8. 检验门控：上道工序
    .mockResolvedValueOnce(prevInspectStatus != null
      ? [[{ process_task_number: 'PT-001', step_number: 10, inspect_status: prevInspectStatus, standard_process_name: '工序1' }]]
      : [[]]);
}

/** 构建检验门控通过后的 mock 查询链 */
function mockPostGateQueries() {
  queryFn
    // 9. INSERT work_report
    .mockResolvedValueOnce([])
    // 10. syncTaskCompletion 中的 UPDATE qty
    .mockResolvedValueOnce([[], 1])
    // 11. syncTaskCompletion 中的 SELECT task
    .mockResolvedValueOnce([[{ task_status: '进行中', completed_quantity: '10', planned_quantity: '100' }]])
    // 12. syncTaskCompletion 中的 SELECT order
    .mockResolvedValueOnce([[{ production_order_number: 'P-001' }]])
    // 13. syncTaskCompletion 中的 UPDATE plan_status 已备料→生产中
    .mockResolvedValueOnce([[], 1])
    // 14. syncTaskCompletion 中的 SELECT pendingTasks
    .mockResolvedValueOnce([[{ cnt: 1 }]])
    // 15. syncTaskCompletion 中的 SELECT pendingInspect
    .mockResolvedValueOnce([[{ cnt: 0 }]])
    // 16. autoCreateInspections 中的 SELECT process_task inspect fields
    .mockResolvedValueOnce([[{
      process_task_number: 'PT-002', production_order_number: 'P-001',
      step_number: 20, standard_process_name: '工序2',
      item_number: '110103', item_name: '密封件', specifications: 'Φ50',
      inspect_type: '自检', inspect_plan_name: '自检方案A', inspect_spec_name: '',
    }]])
    // 17. autoCreateInspections 中的 SELECT inspection_plan
    .mockResolvedValueOnce([[{ is_full_inspect: '是', is_sampling: '否', sampling_type: '', sampling_ratio: 0, sampling_quantity: 0 }]])
    // 18. autoCreateInspections 中的 UPDATE process_task inspect_status
    .mockResolvedValueOnce([]);
}

describe('createWorkReport - inspection gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should BLOCK reporting when prev step inspect_status is 待检验', async () => {
    mockPreGateQueries('待检验');

    await expect(createWorkReport({
      process_task_number: 'PT-002', qualified_quantity: 10,
    }, { username: 'admin' })).rejects.toThrow('上道工序「工序1」检验状态为「待检验」，请先完成检验或处理');
  });

  it('should BLOCK reporting when prev step inspect_status is 检验不合格', async () => {
    mockPreGateQueries('检验不合格');

    await expect(createWorkReport({
      process_task_number: 'PT-002', qualified_quantity: 10,
    }, { username: 'admin' })).rejects.toThrow('上道工序「工序1」检验状态为「检验不合格」，请先完成检验或处理');
  });

  it('should ALLOW reporting when prev step inspect_status is 无需检', async () => {
    mockPreGateQueries('无需检');
    mockPostGateQueries();

    const result = await createWorkReport({
      process_task_number: 'PT-002', qualified_quantity: 10,
    }, { username: 'admin' });

    expect(result.workReportNumber).toBe('WR-20260423-001');
  });

  it('should ALLOW reporting when prev step inspect_status is 检验合格', async () => {
    mockPreGateQueries('检验合格');
    mockPostGateQueries();

    const result = await createWorkReport({
      process_task_number: 'PT-002', qualified_quantity: 10,
    }, { username: 'admin' });

    expect(result.workReportNumber).toBe('WR-20260423-001');
  });

  it('should ALLOW reporting when prev step inspect_status is 已处理', async () => {
    mockPreGateQueries('已处理');
    mockPostGateQueries();

    const result = await createWorkReport({
      process_task_number: 'PT-002', qualified_quantity: 10,
    }, { username: 'admin' });

    expect(result.workReportNumber).toBe('WR-20260423-001');
  });

  it('should ALLOW reporting when there is no prev step (first step)', async () => {
    // 首道工序：step_number = 10，没有前道工序
    queryFn
      .mockResolvedValueOnce([[{
        process_task_number: 'PT-001', production_order_number: 'P-001',
        step_number: 10, standard_process_name: '工序1',
        item_number: '110103', item_name: '密封件', specifications: 'Φ50',
        basic_unit: '个', work_center_number: 'WC-001', work_center_name: '中心1',
        planned_quantity: 100, completed_quantity: 0, excess_reporting_ratio: 0,
        task_status: '进行中', approval_status: '已审批',
      }]])
      // plan_status = '生产中' (首道工序物料门控要求不是 未开始/已派发)
      .mockResolvedValueOnce([[{ plan_status: '生产中' }]])
      .mockResolvedValueOnce([[{ first_step: 10 }]]) // 首道工序
      // 班产上限验证
      .mockResolvedValueOnce([[{ actual_daily_output: 0 }]])
      // 所有工序查询（跨工序验证）
      .mockResolvedValueOnce([[{ process_task_number: 'PT-001', step_number: 10, completed_quantity: 0, standard_process_name: '工序1' }]])
      // 班产上限验证
      .mockResolvedValueOnce([[{ actual_daily_output: 0 }]])
      // 检验门控：没有前道工序
      .mockResolvedValueOnce([[]]);

    // 首道工序通过后的后续查询
    mockPostGateQueries();

    const result = await createWorkReport({
      process_task_number: 'PT-001', qualified_quantity: 10,
    }, { username: 'admin' });

    expect(result.workReportNumber).toBe('WR-20260423-001');
  });
});

describe('createWorkReport - autoCreateInspections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** 通用前置查询（检验门控通过） */
  function mockBaseQueries() {
    queryFn
      .mockResolvedValueOnce([[{
        process_task_number: 'PT-002', production_order_number: 'P-001',
        step_number: 20, standard_process_name: '工序2',
        item_number: '110103', item_name: '密封件', specifications: 'Φ50',
        basic_unit: '个', work_center_number: 'WC-001', work_center_name: '中心1',
        planned_quantity: 100, completed_quantity: 0, excess_reporting_ratio: 0,
        task_status: '进行中', approval_status: '已审批',
      }]])
      .mockResolvedValueOnce([[{ plan_status: '生产中' }]])
      .mockResolvedValueOnce([[{ first_step: 10 }]])
      .mockResolvedValueOnce([[{ mat_count: 0, issued_count: 0 }]])
      .mockResolvedValueOnce([[{ actual_daily_output: 0 }]])
      .mockResolvedValueOnce([[{ process_task_number: 'PT-001', step_number: 10, completed_quantity: 50, standard_process_name: '工序1' }, { process_task_number: 'PT-002', step_number: 20, completed_quantity: 0, standard_process_name: '工序2' }]])
      .mockResolvedValueOnce([[{ actual_daily_output: 0 }]])
      .mockResolvedValueOnce([[{ process_task_number: 'PT-001', step_number: 10, inspect_status: '检验合格', standard_process_name: '工序1' }]]);
  }

  /** 通用后置查询（报工插入 + syncTaskCompletion + autoCreateInspections 后续） */
  function mockPostInsertQueries(inspectType: string, planName: string, inspectQty: number) {
    queryFn
      .mockResolvedValueOnce([]) // INSERT work_report
      // syncTaskCompletion queries
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ task_status: '进行中', completed_quantity: '10', planned_quantity: '100' }]])
      .mockResolvedValueOnce([[{ production_order_number: 'P-001' }]])
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ cnt: 1 }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      // autoCreateInspections: SELECT process_task
      .mockResolvedValueOnce([[{
        process_task_number: 'PT-002', production_order_number: 'P-001',
        step_number: 20, standard_process_name: '工序2',
        item_number: '110103', item_name: '密封件', specifications: 'Φ50',
        inspect_type: inspectType, inspect_plan_name: planName, inspect_spec_name: '',
      }]])
      // autoCreateInspections: UPDATE inspect_status (无需检时) 或 SELECT inspection_plan (自检/专检时)
      .mockResolvedValueOnce([]);
  }

  it('should skip inspection creation and set inspect_status when inspect_type is 无需检', async () => {
    mockBaseQueries();
    mockPostInsertQueries('无需检', '', 0);

    const result = await createWorkReport({
      process_task_number: 'PT-002', qualified_quantity: 10, unqualified_quantity: 0,
    }, { username: 'admin' });

    expect(result.workReportNumber).toBe('WR-20260423-001');
    expect(createInspectionMock).not.toHaveBeenCalled();
    // Verify inspect_status was set to 无需检 via UPDATE process_task
    const inspectStatusUpdate = queryFn.mock.calls.find((c: any) =>
      (c[0] as string).includes('UPDATE process_task') && (c[0] as string).includes('inspect_status = N\'无需检\'')
    );
    expect(inspectStatusUpdate).toBeDefined();
  });

  it('should create inspection with full quantity when is_full_inspect = 是', async () => {
    mockBaseQueries();
    queryFn
      .mockResolvedValueOnce([]) // INSERT work_report
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ task_status: '进行中', completed_quantity: '10', planned_quantity: '100' }]])
      .mockResolvedValueOnce([[{ production_order_number: 'P-001' }]])
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ cnt: 1 }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{
        process_task_number: 'PT-002', production_order_number: 'P-001',
        step_number: 20, standard_process_name: '工序2',
        item_number: '110103', item_name: '密封件', specifications: 'Φ50',
        inspect_type: '自检', inspect_plan_name: '方案A', inspect_spec_name: '',
      }]])
      .mockResolvedValueOnce([[{ is_full_inspect: '是', is_sampling: '否', sampling_type: '', sampling_ratio: 0, sampling_quantity: 0 }]])
      .mockResolvedValueOnce([]); // UPDATE inspect_status

    const result = await createWorkReport({
      process_task_number: 'PT-002', qualified_quantity: 10, unqualified_quantity: 2,
    }, { username: 'admin' });

    expect(result.workReportNumber).toBe('WR-20260423-001');
    expect(createInspectionMock).toHaveBeenCalledTimes(1);
    expect(createInspectionMock).toHaveBeenCalledWith(expect.objectContaining({
      inspect_type: '自检',
      inspection_plan_name: '方案A',
      total_quantity: 12, // 10 + 2 = 12 (全检)
    }), expect.anything());
  });

  it('should create inspection with sampling ratio when is_sampling = 按比例', async () => {
    mockBaseQueries();
    queryFn
      .mockResolvedValueOnce([]) // INSERT work_report
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ task_status: '进行中', completed_quantity: '10', planned_quantity: '100' }]])
      .mockResolvedValueOnce([[{ production_order_number: 'P-001' }]])
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ cnt: 1 }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{
        process_task_number: 'PT-002', production_order_number: 'P-001',
        step_number: 20, standard_process_name: '工序2',
        item_number: '110103', item_name: '密封件', specifications: 'Φ50',
        inspect_type: '专检', inspect_plan_name: '方案B', inspect_spec_name: '',
      }]])
      .mockResolvedValueOnce([[{ is_full_inspect: '否', is_sampling: '是', sampling_type: '按比例', sampling_ratio: 20, sampling_quantity: 0 }]])
      .mockResolvedValueOnce([]); // UPDATE inspect_status

    const result = await createWorkReport({
      process_task_number: 'PT-002', qualified_quantity: 50, unqualified_quantity: 0,
    }, { username: 'admin' });

    expect(result.workReportNumber).toBe('WR-20260423-001');
    expect(createInspectionMock).toHaveBeenCalledTimes(1);
    expect(createInspectionMock).toHaveBeenCalledWith(expect.objectContaining({
      inspect_type: '专检',
      inspection_plan_name: '方案B',
      total_quantity: 10, // ceil(50 * 20 / 100) = 10
    }), expect.anything());
  });

  it('should create inspection with fixed quantity when is_sampling = 按固定数量', async () => {
    mockBaseQueries();
    queryFn
      .mockResolvedValueOnce([]) // INSERT work_report
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ task_status: '进行中', completed_quantity: '10', planned_quantity: '100' }]])
      .mockResolvedValueOnce([[{ production_order_number: 'P-001' }]])
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ cnt: 1 }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{
        process_task_number: 'PT-002', production_order_number: 'P-001',
        step_number: 20, standard_process_name: '工序2',
        item_number: '110103', item_name: '密封件', specifications: 'Φ50',
        inspect_type: '自检', inspect_plan_name: '方案C', inspect_spec_name: '',
      }]])
      .mockResolvedValueOnce([[{ is_full_inspect: '否', is_sampling: '是', sampling_type: '按固定数量', sampling_ratio: 0, sampling_quantity: 5 }]])
      .mockResolvedValueOnce([]); // UPDATE inspect_status

    const result = await createWorkReport({
      process_task_number: 'PT-002', qualified_quantity: 100, unqualified_quantity: 0,
    }, { username: 'admin' });

    expect(result.workReportNumber).toBe('WR-20260423-001');
    expect(createInspectionMock).toHaveBeenCalledTimes(1);
    expect(createInspectionMock).toHaveBeenCalledWith(expect.objectContaining({
      inspect_type: '自检',
      inspection_plan_name: '方案C',
      total_quantity: 5, // min(100, 5) = 5
    }), expect.anything());
  });

  it('should create inspection with min 1 qty when sampling ratio rounds to 0', async () => {
    mockBaseQueries();
    queryFn
      .mockResolvedValueOnce([]) // INSERT work_report
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ task_status: '进行中', completed_quantity: '10', planned_quantity: '100' }]])
      .mockResolvedValueOnce([[{ production_order_number: 'P-001' }]])
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([[{ cnt: 1 }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{
        process_task_number: 'PT-002', production_order_number: 'P-001',
        step_number: 20, standard_process_name: '工序2',
        item_number: '110103', item_name: '密封件', specifications: 'Φ50',
        inspect_type: '自检', inspect_plan_name: '方案D', inspect_spec_name: '',
      }]])
      .mockResolvedValueOnce([[{ is_full_inspect: '否', is_sampling: '是', sampling_type: '按比例', sampling_ratio: 1, sampling_quantity: 0 }]])
      .mockResolvedValueOnce([]); // UPDATE inspect_status

    const result = await createWorkReport({
      process_task_number: 'PT-002', qualified_quantity: 2, unqualified_quantity: 0,
    }, { username: 'admin' });

    expect(result.workReportNumber).toBe('WR-20260423-001');
    expect(createInspectionMock).toHaveBeenCalledTimes(1);
    expect(createInspectionMock).toHaveBeenCalledWith(expect.objectContaining({
      inspect_type: '自检',
      inspection_plan_name: '方案D',
      total_quantity: 1, // ceil(2 * 1 / 100) = 1 (minimum 1)
    }), expect.anything());
  });
});
