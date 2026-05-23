<template>
  <div>
    <a-page-header title="自动创建成品仓库月未盘点表" style="padding: 0; margin-bottom: 16px;" />

    <a-card :bordered="false" size="small">
      <a-space direction="vertical" :size="16" style="width: 100%;">
        <a-alert
          message="功能说明"
          description="系统在每个会计期间第一天 00:30 自动为成品仓库创建上一期间的全盘盘点单。点击下方按钮可手动触发执行（用于测试）。"
          type="info"
          show-icon
        />

        <a-card size="small" title="手动触发">
          <a-space direction="vertical" :size="12" style="width: 100%;">
            <div>
              <span style="color: #666;">触发后将为当前日期所在的会计期间创建成品仓全盘盘点单。</span>
            </div>
            <div>
              <a-button type="primary" :loading="loading" @click="handleTrigger">
                立即执行
              </a-button>
            </div>
          </a-space>
        </a-card>

        <a-card v-if="lastResult" size="small" title="执行结果">
          <a-descriptions :column="1" bordered size="small">
            <a-descriptions-item label="是否触发">
              <a-tag :color="lastResult.triggered ? 'green' : 'orange'">
                {{ lastResult.triggered ? '是' : '否（无已开启的会计期间）' }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="详细信息">
              <div v-for="(item, idx) in lastResult.results" :key="idx" style="margin-bottom: 4px;">
                <span v-if="item.countNumber">
                  <a-tag color="success">创建成功</a-tag>
                  期间: {{ item.periodCode }}，盘点单号: <b>{{ item.countNumber }}</b>
                </span>
                <span v-else-if="item.skipped">
                  <a-tag color="warning">跳过</a-tag>
                  {{ item.periodCode ? `期间: ${item.periodCode}，` : '' }}原因: {{ item.skipped }}
                </span>
                <span v-else-if="item.error">
                  <a-tag color="error">失败</a-tag>
                  {{ item.periodCode ? `期间: ${item.periodCode}，` : '' }}错误: {{ item.error }}
                </span>
              </div>
            </a-descriptions-item>
          </a-descriptions>
        </a-card>
      </a-space>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { triggerAutoStockCount } from '@/api/system/autoStockCount';

const loading = ref(false);
const lastResult = ref<any>(null);

const handleTrigger = async () => {
  loading.value = true;
  try {
    const res: any = await triggerAutoStockCount();
    if (res?.success) {
      lastResult.value = res.data;
      if (res.data?.results?.some((r: any) => r.countNumber)) {
        message.success('盘点单创建成功');
      } else {
        message.info(res.message || '执行完成');
      }
    } else {
      message.error(res?.message || '执行失败');
    }
  } catch (err: any) {
    message.error(err?.message || '请求失败');
  } finally {
    loading.value = false;
  }
};
</script>
