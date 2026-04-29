/**
 * 工序状态变更事件订阅者
 * 监听 WorkReportCreated 事件，同步更新工序任务完成数量和状态
 */

import { onEvent } from '@/shared/eventBus';
import { EVENT_NAMES, type WorkReportCreatedPayload } from '@/shared/events';
import { syncTaskCompletion } from '@/services/workReport.service';
import { createLogger } from '@/config/logger';

const log = createLogger('subscriber-taskCompletion');

export const registerTaskCompletionSubscriber = (): void => {
  onEvent(EVENT_NAMES.WORK_REPORT_CREATED, async (payload: WorkReportCreatedPayload) => {
    const { process_task_number, qualified_quantity, transaction } = payload;
    await syncTaskCompletion(process_task_number, qualified_quantity, transaction);
  });

  log.info('工序状态变更订阅者已注册');
};
