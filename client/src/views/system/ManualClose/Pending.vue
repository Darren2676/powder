<template>
  <div>
    <a-page-header title="手动关闭审批" style="padding: 0; margin-bottom: 16px;" />

    <a-card :bordered="false" size="small">
      <a-spin :spinning="loading">
        <a-empty v-if="pendingGroups.length === 0" description="暂无待审批的关闭申请" />

        <a-collapse v-else v-model:activeKey="activeKeys">
          <a-collapse-panel v-for="group in pendingGroups" :key="group.batch_group" :header="`批次: ${group.batch_group} - ${group.module === 'sales_order' ? '销售订单' : group.module === 'production_order' ? '生产订单' : '采购订单'}`">
            <template #extra>
              <a-space>
                <span style="color: #999; font-size: 12px;">申请人: {{ group.submitted_by }} | {{ group.submitted_at?.substring(0, 16) }}</span>
              </a-space>
            </template>

            <p style="margin-bottom: 8px;">涉及单据: <b>{{ group.record_ids }}</b></p>
            <p style="margin-bottom: 16px; color: #999;">异常分类: {{ group.all_exceptions }}</p>

            <a-space>
              <a-button type="primary" danger @click="handleApprove(group.batch_group)">审批通过并执行关闭</a-button>
              <a-button @click="handleReject(group.batch_group)">拒绝</a-button>
            </a-space>
          </a-collapse-panel>
        </a-collapse>
      </a-spin>
    </a-card>

    <!-- 分页 -->
    <div v-if="pagination.total > pagination.pageSize" style="margin-top: 16px; text-align: right;">
      <a-pagination
        v-model:current="pagination.current"
        :total="pagination.total"
        :page-size="pagination.pageSize"
        @change="fetchData"
        size="small"
        show-quick-jumper
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { getPendingManualCloses, approveManualClose, rejectManualClose } from '@/api/system/manualClose';

const loading = ref(false);
const pendingGroups = ref<any[]>([]);
const activeKeys = ref<string[]>([]);
const pagination = reactive({ current: 1, pageSize: 20, total: 0 });

async function fetchData() {
  loading.value = true;
  try {
    const res = await getPendingManualCloses({ page: pagination.current, limit: pagination.pageSize });
    const data = (res as any).data;
    pendingGroups.value = data?.items || [];
    pagination.total = data?.pagination?.total || 0;
    if (pendingGroups.value.length > 0) {
      activeKeys.value = [pendingGroups.value[0].batch_group];
    }
  } finally {
    loading.value = false;
  }
}

async function handleApprove(batchGroup: string) {
  Modal.confirm({
    title: '确认审批通过',
    content: `确认通过批次 ${batchGroup} 的关闭申请？审批后将立即执行关闭并级联影响下游单据。`,
    okText: '确认通过',
    okType: 'danger',
    onOk: async () => {
      try {
        const res = await approveManualClose(batchGroup);
        const result = (res as any).data;
        message.success(`审批完成：成功 ${result?.succeeded?.length || 0}，失败 ${result?.failed?.length || 0}`);
        if (result?.failed?.length) {
          result.failed.slice(0, 3).forEach((f: any) => message.warning(`${f.recordId}: ${f.message}`));
        }
        fetchData();
      } catch {
        message.error('审批失败');
      }
    },
  });
}

async function handleReject(batchGroup: string) {
  Modal.confirm({
    title: '确认拒绝',
    content: `确认拒绝批次 ${batchGroup} 的关闭申请？`,
    okText: '确认拒绝',
    onOk: async () => {
      try {
        await rejectManualClose(batchGroup);
        message.success('已拒绝');
        fetchData();
      } catch {
        message.error('操作失败');
      }
    },
  });
}

onMounted(fetchData);
</script>
