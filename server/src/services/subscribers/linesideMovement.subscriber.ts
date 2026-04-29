/**
 * 线边仓流转事件订阅者
 * 监听 WorkReportCreated 事件，记录线边仓 IN/OUT 流转
 */

import { onEvent } from '@/shared/eventBus';
import { EVENT_NAMES, type WorkReportCreatedPayload } from '@/shared/events';
import { logWorkReportLinesideMovement } from '@/services/linesideMovement.service';
import { createLogger } from '@/config/logger';

const log = createLogger('subscriber-lineside');

export const registerLinesideMovementSubscriber = (): void => {
  onEvent(EVENT_NAMES.WORK_REPORT_CREATED, async (payload: WorkReportCreatedPayload) => {
    const { process_task_number, work_report_number, qualified_quantity, username, transaction } = payload;
    await logWorkReportLinesideMovement(
      process_task_number,
      qualified_quantity,
      work_report_number,
      username,
      transaction
    );
  });

  log.info('线边仓流转订阅者已注册');
};
