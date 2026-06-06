/**
 * 生产调度服务 - 工序任务生成 + 备料单生成
 * 从 orderDispatch.service.ts 拆分
 */
import sequelize from '@/config/database';
import dayjs from 'dayjs';
import { generateTaskNumber, generatePrepNumber, generateOutsourcingReqNumber } from '@/services/documentNumber.service';

// ==================== 工序任务生成（使用调用方事务） ====================
export const generateProcessTasks = async (params: {
  orderNumber: string; productionNumber: string; itemNumber: string;
  itemName: string; specifications: string; basicUnit: string;
  plannedQuantity: number;
}, username: string, transaction: any, factoryCode: string = ''): Promise<{
  tasksGenerated: number; skipReason: string;
  outsourcingReqLines: Array<{
    taskNumber: string; stepNumber: number;
    standardProcessNumber: string; processName: string;
    workCenterNumber: string; workCenterName: string;
    plannedQuantity: number; isOutsourced: boolean;
  }>;
  routeMaterialMap: Record<string, any>;
  routeStepNameMap: Record<number, string>;
}> => {
  const orderNo = params.orderNumber;
  let tasksGenerated = 0;
  let skipReason = '';
  const outsourcingReqLines: Array<{
    taskNumber: string; stepNumber: number;
    standardProcessNumber: string; processName: string;
    workCenterNumber: string; workCenterName: string;
    plannedQuantity: number; isOutsourced: boolean;
  }> = [];
  let routeMaterialMap: Record<string, { step_number: any; work_center_number: string; work_center_name: string; standard_process_name: string }> = {};
  let routeStepNameMap: Record<number, string> = {};

  try {
    const [routes]: any = await sequelize.query(
      `SELECT TOP 1 process_route_number, process_route_name, bom_number
      FROM routing_header
      WHERE item_number = :item_number AND condition = N'启用' AND approval_status = N'已审批'
      ORDER BY CASE WHEN is_primary = N'是' THEN 0 ELSE 1 END, creation_date DESC`,
      { replacements: { item_number: params.itemNumber }, transaction }
    );
    if (routes.length === 0) {
      skipReason = '未找到匹配的工艺路线';
    } else {
      const route = routes[0];
      const [routeDetails]: any = await sequelize.query(
        `SELECT id, step_number, standard_process_number, standard_process_name,
          post_processing_sequence_number, post_processing_sequence_name,
          work_center_number, work_center_name, excess_reporting_ratio,
          ingredient_addition_method, process_material_input_number,
          process_material_input_quantity, process_material_input_unit,
          material_wastage_rate, is_outsourced,
          inspect_type, inspect_plan_name, inspect_spec_name
        FROM routing_detail WHERE process_route_number = :prn ORDER BY step_number`,
        { replacements: { prn: route.process_route_number }, transaction }
      );
      // 构建 step_number -> standard_process_name 映射
      for (const rd of routeDetails) {
        if (rd.step_number != null) routeStepNameMap[rd.step_number] = rd.standard_process_name || '';
      }
      // 查询工艺路线物料子表，构建 material_number -> step_number 映射
      const routeDetailIds = routeDetails.map((rd: any) => rd.id).filter(Boolean);
      if (routeDetailIds.length > 0) {
        const [routeMats]: any = await sequelize.query(
          `SELECT rdm.material_number, rd.step_number, rd.work_center_number, rd.work_center_name, rd.standard_process_name
          FROM routing_detail_material rdm
          INNER JOIN routing_detail rd ON rdm.routing_detail_id = rd.id
          WHERE rd.process_route_number = :prn`,
          { replacements: { prn: route.process_route_number }, transaction }
        );
        for (const rm of routeMats) {
          if (rm.material_number && !routeMaterialMap[rm.material_number]) {
            routeMaterialMap[rm.material_number] = {
              step_number: rm.step_number,
              work_center_number: rm.work_center_number || '',
              work_center_name: rm.work_center_name || '',
              standard_process_name: rm.standard_process_name || ''
            };
          }
        }
      }
      if (routeDetails.length === 0) {
        skipReason = '工艺路线无明细数据';
      } else {
        for (const d of routeDetails) {
          const [existing]: any = await sequelize.query(
            `SELECT COUNT(*) as cnt FROM process_task WHERE production_order_number = :orderNo AND step_number = :step`,
            { replacements: { orderNo, step: d.step_number }, transaction }
          );
          if (existing[0].cnt > 0) continue;

          const taskNumber = await generateTaskNumber(factoryCode, transaction);
          await sequelize.query(
            `INSERT INTO process_task (
              process_task_number, production_order_number, production_number,
              process_route_number, step_number, item_number, item_name,
              specifications, basic_unit, planned_quantity, completed_quantity,
              standard_process_number, standard_process_name,
              work_center_number, work_center_name,
              process_material_input_number, process_material_input_quantity,
              process_material_input_unit, material_wastage_rate,
              excess_reporting_ratio, ingredient_addition_method,
              task_status, approval_status, creation_date, creation_man, is_outsourced,
              inspect_type, inspect_plan_name, inspect_spec_name, inspect_status,
              inspector_number, inspector_name, attachment_info, technical_requirement, remark,
              is_backflush
            ) VALUES (
              :taskNumber, :orderNo, :prodNum, :routeNum, :step,
              :itemNum, :itemName, :specs, :unit, :plannedQty, 0,
              :stdProcNum, :stdProcName, :wcNum, :wcName,
              :matInputNum, :matInputQty, :matInputUnit, :wastageRate,
              :excessRatio, :ingredientMethod,
              N'未开始', N'已审批', :createDate, :createMan, :isOutsourced,
              :inspectType, :inspectPlanName, :inspectSpecName, N'无需检',
              :inspectorNumber, :inspectorName, :attachmentInfo, :technicalRequirement, :remark,
              :isBackflush
            )`,
            {
              replacements: {
                taskNumber,
                orderNo,
                prodNum: params.productionNumber,
                routeNum: route.process_route_number,
                step: d.step_number,
                itemNum: params.itemNumber,
                itemName: params.itemName,
                specs: params.specifications || '',
                unit: params.basicUnit || '',
                plannedQty: params.plannedQuantity,
                stdProcNum: d.standard_process_number || '',
                stdProcName: d.standard_process_name || '',
                wcNum: d.work_center_number || '',
                wcName: d.work_center_name || '',
                matInputNum: d.process_material_input_number || '',
                matInputQty: d.process_material_input_quantity || '',
                matInputUnit: d.process_material_input_unit || '',
                wastageRate: d.material_wastage_rate || '',
                excessRatio: d.excess_reporting_ratio || '',
                ingredientMethod: d.ingredient_addition_method || '',
                createDate: dayjs().format('YYYY/MM/DD HH:mm'),
                createMan: username,
                isOutsourced: d.is_outsourced ? 1 : 0,
                inspectType: d.inspect_type || '无需检',
                inspectPlanName: d.inspect_plan_name || '',
                inspectSpecName: d.inspect_spec_name || '',
                inspectorNumber: d.inspector_number || '',
                inspectorName: d.inspector_name || '',
                attachmentInfo: d.attachment_info || '',
                technicalRequirement: d.technical_requirement || '',
                remark: d.remark || '',
                isBackflush: (d as any).flowing_backward === '是' ? 1 : 0
              },
              transaction
            }
          );
          // 若为委外工序，收集到委外申请明细列表
          if (d.is_outsourced) {
            outsourcingReqLines.push({
              taskNumber,
              stepNumber: d.step_number,
              standardProcessNumber: d.standard_process_number || '',
              processName: d.standard_process_name || '',
              workCenterNumber: d.work_center_number || '',
              workCenterName: d.work_center_name || '',
              plannedQuantity: params.plannedQuantity || 0,
              isOutsourced: true
            });
          }
          tasksGenerated++;
        }

        // 为该生产单的所有委外工序创建一张委外申请单
        if (outsourcingReqLines.length > 0) {
          try {
            const [dupReq]: any = await sequelize.query(
              `SELECT COUNT(*) as cnt FROM outsourcing_req WHERE production_order_number = :orderNo`,
              { replacements: { orderNo }, transaction }
            );
            if (dupReq[0].cnt === 0) {
              const reqNumber = await generateOutsourcingReqNumber(factoryCode, transaction);
              await sequelize.query(`
                INSERT INTO outsourcing_req (outsourcing_req_number, production_order_number, production_number, item_number, item_name, specifications, basic_unit, planned_quantity, approval_status, order_status, remark, creation_date, creation_man)
                VALUES (:reqNumber, :pon, :pn, :itemNum, :itemName, :specs, :unit, :qty, N'草稿', N'未执行', N'派发自动生成', :createDate, :createMan)
              `, {
                replacements: {
                  reqNumber, pon: orderNo, pn: params.productionNumber || '',
                  itemNum: params.itemNumber || '', itemName: params.itemName || '',
                  specs: params.specifications || '', unit: params.basicUnit || '',
                  qty: params.plannedQuantity || 0,
                  createDate: dayjs().format('YYYY/MM/DD HH:mm'), createMan: username
                }, transaction
              });
              for (let li = 0; li < outsourcingReqLines.length; li++) {
                const line = outsourcingReqLines[li];
                await sequelize.query(`
                  INSERT INTO outsourcing_req_detail (outsourcing_req_number, line_number, process_task_number, step_number, standard_process_number, standard_process_name, work_center_number, work_center_name, planned_quantity, ordered_quantity, status)
                  VALUES (:reqNumber, :lineNum, :ptn, :step, :spn, :spname, :wcn, :wcname, :qty, 0, N'未执行')
                `, {
                  replacements: {
                    reqNumber, lineNum: (li + 1) * 10, ptn: line.taskNumber, step: line.stepNumber,
                    spn: line.standardProcessNumber, spname: line.processName,
                    wcn: line.workCenterNumber, wcname: line.workCenterName, qty: line.plannedQuantity
                  }, transaction
                });
              }
            }
          } catch (reqErr: any) { /* 委外申请创建失败不阻断派发 */ }
        }
      }
    }
  } catch (taskErr: any) {
    skipReason = `工序任务生成异常: ${taskErr.message}`;
  }

  return { tasksGenerated, skipReason, outsourcingReqLines, routeMaterialMap, routeStepNameMap };
};

// ==================== 备料单生成（使用调用方事务） ====================
export const generateMaterialPreparation = async (params: {
  orderNumber: string; productionNumber: string; itemNumber: string;
  itemName: string; specifications: string; basicUnit: string;
  plannedQuantity: number; routeMaterialMap: Record<string, any>;
  routeStepNameMap: Record<number, string>; taskMap: Record<number, any>;
}, username: string, transaction: any, factoryCode: string = ''): Promise<{
  materialsGenerated: number; skipReason: string;
  prepNumberForCleanup: string;
}> => {
  const orderNo = params.orderNumber;
  let materialsGenerated = 0;
  let prepSkipReason = '';
  let prepNumberForCleanup = '';

  try {
    const [existingPrep]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM material_preparation WHERE production_order_number = :orderNo`,
      { replacements: { orderNo }, transaction }
    );
    if (existingPrep[0].cnt > 0) {
      prepSkipReason = '该生产单已存在备料单';
    } else {
      // 优先使用工艺路线关联的 BOM，若未关联则按产品查找最新版本 BOM
      let bomQuery = `SELECT TOP 1 bom_number, bom_name, bom_version, base_quantity FROM bom_header WHERE item_number = :item_number AND [condition] = N'启用' AND approval_status = N'已审批' ORDER BY bom_version DESC`;
      let bomReplacements: any = { item_number: params.itemNumber };

      const [routeBom]: any = await sequelize.query(
        `SELECT TOP 1 bom_number FROM routing_header WHERE item_number = :item_number AND condition = N'启用' AND approval_status = N'已审批' ORDER BY CASE WHEN is_primary = N'是' THEN 0 ELSE 1 END, creation_date DESC`,
        { replacements: { item_number: params.itemNumber }, transaction }
      );
      if (routeBom.length > 0 && routeBom[0].bom_number) {
        bomQuery = `SELECT TOP 1 bom_number, bom_name, bom_version, base_quantity FROM bom_header WHERE bom_number = :bomNumber AND [condition] = N'启用' AND approval_status = N'已审批'`;
        bomReplacements = { bomNumber: routeBom[0].bom_number };
      }

      const [boms]: any = await sequelize.query(bomQuery, { replacements: bomReplacements, transaction });
      if (boms.length === 0) {
        prepSkipReason = '未找到匹配的BOM';
      } else {
        const bom = boms[0];
        const bomBaseQty = parseFloat(bom.base_quantity) || 1;

        // 只取第一层BOM明细（不递归展开到底层）
        const [firstLevelDetails]: any = await sequelize.query(
          `SELECT material_number, material_name, material_type, unit,
                  standard_quantity, wastage_rate, actual_quantity,
                  step_number, is_key_material, substitute_group,
                  substitute_priority, supply_type, default_warehouse, line_number
           FROM bom_detail WHERE bom_number = :bomNumber ORDER BY line_number`,
          { replacements: { bomNumber: bom.bom_number }, transaction }
        );

        if (firstLevelDetails.length === 0) {
          prepSkipReason = 'BOM无物料明细';
        } else {
          const prepNumber = await generatePrepNumber(factoryCode, transaction);
          prepNumberForCleanup = prepNumber;
          const plannedQty = parseFloat(String(params.plannedQuantity)) || 0;
          const multiplier = bomBaseQty > 0 ? plannedQty / bomBaseQty : 0;

          await sequelize.query(
            `INSERT INTO material_preparation (
              preparation_number, production_order_number, production_number,
              item_number, item_name, specifications, basic_unit,
              bom_number, bom_version, planned_quantity, bom_base_quantity,
              total_material_types, preparation_status, approval_status,
              remark, creation_date, creation_man
            ) VALUES (
              :prepNum, :orderNo, :prodNum, :itemNum, :itemName, :specs, :unit,
              :bomNum, :bomVer, :plannedQty, :bomBaseQty,
              :totalTypes, N'未领料', N'已审批', N'派发自动审批', :createDate, :createMan
            )`,
            {
              replacements: {
                prepNum: prepNumber, orderNo,
                prodNum: params.productionNumber,
                itemNum: params.itemNumber, itemName: params.itemName,
                specs: params.specifications || '', unit: params.basicUnit || '',
                bomNum: bom.bom_number, bomVer: bom.bom_version,
                plannedQty: params.plannedQuantity, bomBaseQty: bom.base_quantity,
                totalTypes: firstLevelDetails.length,
                createDate: dayjs().format('YYYY/MM/DD HH:mm'),
                createMan: username
              },
              transaction
            }
          );

          for (let i = 0; i < firstLevelDetails.length; i++) {
            const bd = firstLevelDetails[i];
            const routeMatInfo = params.routeMaterialMap[bd.material_number];
            // step_number: 优先使用工艺路线物料映射的数值步骤号;
            // bom_detail.step_number 可能是文本工序编码(如'TJ','BZ')，需解析为int
            let step: number | null = null;
            let procName = '';
            if (routeMatInfo && routeMatInfo.step_number != null) {
              step = parseInt(routeMatInfo.step_number, 10);
              if (isNaN(step)) step = null;
              procName = routeMatInfo.standard_process_name || '';
            } else {
              const rawStep = bd.step_number || null;
              if (rawStep != null) {
                const parsed = parseInt(rawStep, 10);
                step = isNaN(parsed) ? null : parsed;
              }
            }
            // 从 routeStepNameMap 获取 standard_process_name（回退）
            if (!procName && step != null) {
              procName = params.routeStepNameMap[step] || '';
            }
            const wc = step && params.taskMap[step] ? params.taskMap[step]
              : (routeMatInfo ? { work_center_number: routeMatInfo.work_center_number, work_center_name: routeMatInfo.work_center_name } : {});
            const actualQty = parseFloat(bd.actual_quantity) || 0;
            const requiredQty = Math.round(multiplier * actualQty * 10000) / 10000;

            await sequelize.query(
              `INSERT INTO material_preparation_detail (
                preparation_number, line_number, material_number, material_name,
                material_type, unit, bom_standard_quantity, bom_wastage_rate,
                bom_actual_quantity, required_quantity, adjusted_quantity, issued_quantity,
                step_number, work_center_number, work_center_name, standard_process_name,
                is_key_material, substitute_group, substitute_priority,
                supply_type, default_warehouse, bom_path, remark
              ) VALUES (
                :prepNum, :lineNum, :matNum, :matName,
                :matType, :unit, :bomStdQty, :bomWaste,
                :bomActQty, :reqQty, :adjQty, 0,
                :step, :wcNum, :wcName, :procName,
                :isKey, :subGrp, :subPri,
                :supply, :warehouse, :bomPath, ''
              )`,
              {
                replacements: {
                  prepNum: prepNumber, lineNum: (i + 1) * 10,
                  matNum: bd.material_number, matName: bd.material_name,
                  matType: bd.material_type || '', unit: bd.unit || '',
                  bomStdQty: bd.standard_quantity || actualQty,
                  bomWaste: bd.wastage_rate || 0,
                  bomActQty: actualQty,
                  reqQty: requiredQty, adjQty: requiredQty,
                  step: step, wcNum: wc.work_center_number || '',
                  wcName: wc.work_center_name || '',
                  procName: procName,
                  isKey: bd.is_key_material || 0,
                  subGrp: bd.substitute_group || '',
                  subPri: bd.substitute_priority || 0,
                  supply: bd.supply_type || '',
                  warehouse: bd.default_warehouse || '',
                  bomPath: bom.bom_number
                },
                transaction
              }
            );
          }
          materialsGenerated = firstLevelDetails.length;
        }
      }
    }
  } catch (prepErr: any) {
    prepSkipReason = `备料单生成异常: ${prepErr.message}`;
    // 如果头记录已插入但明细失败，清理孤立的头记录
    if (prepNumberForCleanup) {
      try {
        await sequelize.query(
          `DELETE FROM material_preparation WHERE preparation_number = :prepNum`,
          { replacements: { prepNum: prepNumberForCleanup }, transaction }
        );
      } catch (_) { /* 清理失败不影响主流程 */ }
    }
  }

  return { materialsGenerated, skipReason: prepSkipReason, prepNumberForCleanup };
};
