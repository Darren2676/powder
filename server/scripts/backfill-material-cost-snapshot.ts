/**
 * 历史数据回填脚本：为已有领料记录回填 production_material_cost_snapshot
 * 
 * 逻辑：
 * 1. 查询所有 material_issue（已领料状态）
 * 2. 对每个领料单，查询其明细
 * 3. 匹配领料创建时间时的标准成本单价表
 * 4. 写入 production_material_cost_snapshot
 * 
 * 用法: npx tsx server/scripts/backfill-material-cost-snapshot.ts
 */

import sequelize from '../src/config/database';
import dayjs from 'dayjs';

// 缓存: dateStr -> { costMap, costListNumber, costListName }
const COST_CACHE = new Map<string, { costMap: Map<string, { standard_cost: number; cost_list_number: string; cost_list_name: string }>; costListNumber: string; costListName: string }>();

// 获取指定日期有效的标准成本Map
const getCostMapAtDate = async (dateStr: string): Promise<{
  costMap: Map<string, { standard_cost: number; cost_list_number: string; cost_list_name: string }>;
  costListNumber: string;
  costListName: string;
}> => {
  if (COST_CACHE.has(dateStr)) {
    return COST_CACHE.get(dateStr)!;
  }

  const costMap = new Map<string, { standard_cost: number; cost_list_number: string; cost_list_name: string }>();

  // 取领料创建日期时有效的标准成本单价表
  const [costHeaders]: any = await sequelize.query(`
    SELECT TOP 1 cost_list_number, cost_list_name
    FROM standard_cost_header
    WHERE approval_status = N'已审批'
      AND effective_date <= :refDate
      AND (expiration_date IS NULL OR expiration_date >= :refDate)
    ORDER BY effective_date DESC
  `, { replacements: { refDate: dateStr } });

  let costListNumber = '';
  let costListName = '';

  if (costHeaders.length > 0) {
    costListNumber = costHeaders[0].cost_list_number;
    costListName = costHeaders[0].cost_list_name || '';

    const [costDetails]: any = await sequelize.query(`
      SELECT item_number, standard_cost
      FROM standard_cost_detail
      WHERE cost_list_number = :costListNumber
        AND standard_cost > 0
    `, { replacements: { costListNumber } });

    for (const d of costDetails) {
      costMap.set(d.item_number, {
        standard_cost: parseFloat(d.standard_cost) || 0,
        cost_list_number: costListNumber,
        cost_list_name: costListName,
      });
    }
  }

  const result = { costMap, costListNumber, costListName };
  COST_CACHE.set(dateStr, result);

  return result;
};

const generateSnapshotNumber = async (): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `MCS-${today}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(snapshot_number) as max_num FROM production_material_cost_snapshot WHERE snapshot_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(3, '0');
};

async function backfill() {
  console.log('========================================');
  console.log('生产单材料成本快照历史数据回填');
  console.log('========================================');

  // 1. 查询所有已领料的领料单
  const [issues]: any = await sequelize.query(`
    SELECT mi.issue_number, mi.preparation_number, mi.production_order_number,
           mi.creation_date, mi.creation_man
    FROM material_issue mi
    WHERE mi.issue_status = N'已领料'
    ORDER BY mi.creation_date ASC
  `);

  console.log(`找到 ${issues.length} 条领料单需要回填`);

  if (issues.length === 0) {
    console.log('无需回填，退出');
    return;
  }

  // 2. 检查已有快照，跳过已回填的
  const [existingSnapshots]: any = await sequelize.query(`
    SELECT DISTINCT issue_number FROM production_material_cost_snapshot
  `);
  const existingIssueNumbers = new Set(existingSnapshots.map((r: any) => r.issue_number));

  const needBackfill = issues.filter((i: any) => !existingIssueNumbers.has(i.issue_number));
  console.log(`其中 ${needBackfill.length} 条需要回填（${existingIssueNumbers.size} 条已有快照）`);

  if (needBackfill.length === 0) {
    console.log('全部已回填，退出');
    return;
  }

  // 3. 逐条回填
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  let snapshotSeq = 0;

  // 获取当前起始编号
  let snapshotNumber = await generateSnapshotNumber();
  const seqMatch = snapshotNumber.match(/MCS-\d{8}-(\d{3})/);
  let seqNum = seqMatch ? parseInt(seqMatch[1]) : 1;
  const today = dayjs().format('YYYYMMDD');
  const prefix = `MCS-${today}-`;

  for (const issue of needBackfill) {
    try {
      // 查询领料明细
      const [details]: any = await sequelize.query(`
        SELECT mid.material_number, mid.material_name, mid.material_type, mid.unit,
               mid.actual_quantity, mid.step_number, mid.work_center_name
        FROM material_issue_detail mid
        WHERE mid.issue_number = :issueNumber
        ORDER BY mid.line_number
      `, { replacements: { issueNumber: issue.issue_number } });

      if (details.length === 0) {
        skipCount++;
        continue;
      }

      // 解析领料创建日期
      const createDate = issue.creation_date || '';
      const dateOnly = typeof createDate === 'string' ? createDate.split(' ')[0] : dayjs().format('YYYY-MM-DD');

      // 获取该日期有效的标准成本
      const { costMap, costListNumber, costListName } = await getCostMapAtDate(dateOnly);

      // 查询备料单编号
      const prepNumber = issue.preparation_number || '';

      // 生成快照编号
      snapshotSeq++;
      const snapNum = prefix + String(seqNum).padStart(3, '0');
      seqNum++;

      // 逐行写入快照
      for (const d of details) {
        const costInfo = costMap.get(d.material_number);
        const standardCost = costInfo ? costInfo.standard_cost : 0;
        const issuedQty = parseFloat(d.actual_quantity) || 0;
        const materialCost = Math.round(issuedQty * standardCost * 100) / 100;
        const hasCost = costInfo ? 1 : 0;

        await sequelize.query(`
          INSERT INTO production_material_cost_snapshot (
            snapshot_number, production_order_number, preparation_number, issue_number,
            material_number, material_name, material_type, unit,
            issued_quantity, standard_cost, material_cost,
            cost_list_number, cost_list_name, has_cost,
            step_number, work_center_name,
            source_type, source_number, creation_date, creation_man, remark
          ) VALUES (
            :snapshot_number, :production_order_number, :preparation_number, :issue_number,
            :material_number, :material_name, :material_type, :unit,
            :issued_quantity, :standard_cost, :material_cost,
            :cost_list_number, :cost_list_name, :has_cost,
            :step_number, :work_center_name,
            :source_type, :source_number, GETDATE(), :creation_man, :remark
          )
        `, {
          replacements: {
            snapshot_number: snapNum,
            production_order_number: issue.production_order_number,
            preparation_number: prepNumber,
            issue_number: issue.issue_number,
            material_number: d.material_number || '',
            material_name: d.material_name || '',
            material_type: d.material_type || '',
            unit: d.unit || '',
            issued_quantity: issuedQty,
            standard_cost: standardCost,
            material_cost: materialCost,
            cost_list_number: costInfo ? costInfo.cost_list_number : costListNumber,
            cost_list_name: costInfo ? costInfo.cost_list_name : costListName,
            has_cost: hasCost,
            step_number: d.step_number || null,
            work_center_name: d.work_center_name || '',
            source_type: '领料',
            source_number: issue.issue_number,
            creation_man: issue.creation_man || 'backfill',
            remark: `历史回填-${issue.creation_date || ''}`,
          },
        });
      }

      successCount++;
      if (successCount % 10 === 0) {
        console.log(`已回填 ${successCount}/${needBackfill.length} ...`);
      }
    } catch (err) {
      errorCount++;
      console.error(`回填领料单 ${issue.issue_number} 失败:`, err);
    }
  }

  console.log('========================================');
  console.log(`回填完成: 成功 ${successCount}, 跳过 ${skipCount}, 失败 ${errorCount}`);
  console.log('========================================');
}

// 执行
backfill()
  .then(() => {
    console.log('脚本执行完毕');
    process.exit(0);
  })
  .catch((err) => {
    console.error('脚本执行失败:', err);
    process.exit(1);
  });
