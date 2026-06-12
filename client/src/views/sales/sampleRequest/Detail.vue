<template>
  <div class="sample-request-detail">
    <a-card :bordered="false" :loading="loading">
      <template #title>
        <span>样品申请详情 — {{ header?.request_number }}</span>
        <a-tag :color="statusColor(header?.status)" style="margin-left:12px">{{ header?.status }}</a-tag>
      </template>
      <template #extra>
        <a-space>
          <a-button @click="goBack">返回</a-button>
          <template v-if="header?.status === '草稿'">
            <a-button type="primary" @click="handleEdit">编辑</a-button>
          </template>
          <template v-if="header?.status === '已完成'">
            <a-button type="primary" @click="handleConvertOrder">转化订单</a-button>
          </template>
        </a-space>
      </template>

      <!-- 上半部分：销售部填写信息 -->
      <a-descriptions :column="3" bordered size="small" title="基本信息">
        <a-descriptions-item label="申请编号">{{ header?.request_number }}</a-descriptions-item>
        <a-descriptions-item label="申请日期">{{ header?.request_date }}</a-descriptions-item>
        <a-descriptions-item label="需完成日期">{{ header?.deadline_date }}</a-descriptions-item>
        <a-descriptions-item label="申请人">{{ header?.applicant }}</a-descriptions-item>
        <a-descriptions-item label="紧急程度">{{ header?.urgency }}</a-descriptions-item>
        <a-descriptions-item label="客户名称">{{ header?.customer_name }}</a-descriptions-item>
        <a-descriptions-item label="市场">{{ header?.market }}</a-descriptions-item>
        <a-descriptions-item label="竞争对手">{{ header?.competitor }}</a-descriptions-item>
        <a-descriptions-item label="是否已有订单">{{ header?.has_order }}</a-descriptions-item>
        <a-descriptions-item label="预估售价(RMB/kg)">{{ header?.estimated_price }}</a-descriptions-item>
        <a-descriptions-item label="潜在用量(吨/月)">{{ header?.potential_usage }}</a-descriptions-item>
      </a-descriptions>

      <a-divider />

      <a-descriptions :column="3" bordered size="small" title="喷涂工艺">
        <a-descriptions-item label="喷涂工件">{{ header?.coating_workpiece }}</a-descriptions-item>
        <a-descriptions-item label="基材">{{ header?.substrate }}</a-descriptions-item>
        <a-descriptions-item label="前处理">{{ header?.pretreatment }}</a-descriptions-item>
        <a-descriptions-item label="喷枪类型">{{ header?.spray_gun_type }}</a-descriptions-item>
        <a-descriptions-item label="回收系统">{{ header?.recovery_system }}</a-descriptions-item>
        <a-descriptions-item label="烤炉类型">{{ header?.oven_type }}</a-descriptions-item>
      </a-descriptions>

      <a-divider />

      <a-descriptions :column="2" bordered size="small" title="技术参数">
        <a-descriptions-item label="颜色">{{ header?.color_spec }}</a-descriptions-item>
        <a-descriptions-item label="产品类型">{{ header?.product_type }}</a-descriptions-item>
        <a-descriptions-item label="膜厚范围">{{ header?.film_thickness }}</a-descriptions-item>
        <a-descriptions-item label="光泽范围">{{ header?.gloss_range }}</a-descriptions-item>
        <a-descriptions-item label="固化条件">{{ header?.curing_condition }}</a-descriptions-item>
        <a-descriptions-item label="其它性能要求">{{ header?.other_requirements }}</a-descriptions-item>
      </a-descriptions>

      <a-divider />

      <!-- 样品需求项 -->
      <h4>样品需求项</h4>
      <a-table :columns="itemColumns" :data-source="items" :pagination="false" size="small" row-key="item_type" style="margin-bottom:24px">
        <template #bodyCell="{ column, record, text }">
          <template v-if="column.dataIndex === 'is_requested'">
            <a-checkbox :checked="!!text" disabled />
          </template>
          <template v-else-if="column.dataIndex === 'quantity'">
            {{ record.is_requested ? text : '-' }}
          </template>
        </template>
      </a-table>

      <!-- 关联样件BOM -->
      <a-divider />
      <a-card title="关联样件BOM" size="small" style="margin-top:16px">
        <template #extra>
          <a-button v-if="header?.approval_status === '已审核'" type="primary" size="small" @click="goCreateSampleBom">创建样件BOM</a-button>
        </template>
        <a-table v-if="relatedBoms.length > 0" :columns="bomColumns" :data-source="relatedBoms" :pagination="false" size="small" row-key="id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'sample_bom_number'">
              <a-button type="link" size="small" style="padding:0" @click="router.push(`/sample-boms/${record.id}`)">{{ record.sample_bom_number }}</a-button>
            </template>
            <template v-if="column.dataIndex === 'status'">
              <a-tag :color="record.status === '已导入' ? 'green' : record.status === '已确定' ? 'blue' : 'orange'">{{ record.status }}</a-tag>
            </template>
          </template>
        </a-table>
        <a-empty v-else description="暂无关联样件BOM" />
      </a-card>

      <!-- 下半部分：实验室数据 -->
      <a-divider />
      <a-card title="实验室数据（技术部填写）" size="small" style="background:#fff7e6">
        <!-- 草稿：提示 -->
        <template v-if="header?.status === '草稿'">
          <p style="color:#999">提交后由技术部填写</p>
        </template>

        <!-- 待研发：提示 -->
        <template v-else-if="header?.status === '待研发'">
          <p style="color:#999">等待技术部接收</p>
          <a-descriptions :column="2" bordered size="small" style="margin-top:12px">
            <a-descriptions-item label="接收人">{{ lab?.received_by || '-' }}</a-descriptions-item>
            <a-descriptions-item label="接收时间">{{ lab?.received_at || '-' }}</a-descriptions-item>
          </a-descriptions>
        </template>

        <!-- 研发中：可编辑表单 -->
        <template v-else-if="header?.status === '研发中'">
          <a-descriptions :column="2" bordered size="small" style="margin-bottom:16px">
            <a-descriptions-item label="接收人">{{ lab?.received_by || '-' }}</a-descriptions-item>
            <a-descriptions-item label="接收时间">{{ lab?.received_at || '-' }}</a-descriptions-item>
          </a-descriptions>
          <a-form :model="labForm" layout="horizontal" :label-col="{ style: { width: '130px' } }" :wrapper-col="{ style: { maxWidth: 'calc(100% - 130px)' } }">
            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item label="寄出样板数量">
                  <a-input-number v-model:value="labForm.lab_panel_qty" :min="0" style="width:100%" />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="寄出样粉数量(kg)">
                  <a-input-number v-model:value="labForm.lab_powder_qty" :min="0" style="width:100%" />
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item label="完成日期">
                  <a-date-picker v-model:value="labForm.completion_date" style="width:100%" />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="产品编号">
                  <a-input v-model:value="labForm.product_number" />
                </a-form-item>
              </a-col>
            </a-row>
            <a-form-item label="配方成本">
              <a-input-number v-model:value="labForm.formula_cost" :min="0" :precision="4" style="width:200px" />
            </a-form-item>
            <a-form-item label="备注">
              <a-textarea v-model:value="labForm.lab_remark" :rows="3" />
            </a-form-item>
          </a-form>
          <div style="text-align:right;margin-top:16px">
            <a-space>
              <a-button @click="handleSaveLab" :loading="labSaving">保存</a-button>
              <a-button type="primary" @click="handleComplete" :loading="labSaving">完成研发</a-button>
            </a-space>
          </div>
        </template>

        <!-- 已完成：只读展示 -->
        <template v-else-if="header?.status === '已完成'">
          <a-descriptions :column="3" bordered size="small">
            <a-descriptions-item label="接收人">{{ lab?.received_by || '-' }}</a-descriptions-item>
            <a-descriptions-item label="接收时间">{{ lab?.received_at || '-' }}</a-descriptions-item>
            <a-descriptions-item label="完成人">{{ lab?.completed_by || '-' }}</a-descriptions-item>
            <a-descriptions-item label="完成时间">{{ lab?.completed_at || '-' }}</a-descriptions-item>
            <a-descriptions-item label="寄出样板数量">{{ lab?.lab_panel_qty ?? '-' }}</a-descriptions-item>
            <a-descriptions-item label="寄出样粉数量(kg)">{{ lab?.lab_powder_qty ?? '-' }}</a-descriptions-item>
            <a-descriptions-item label="完成日期">{{ lab?.completion_date || '-' }}</a-descriptions-item>
            <a-descriptions-item label="产品编号">{{ lab?.product_number || '-' }}</a-descriptions-item>
            <a-descriptions-item label="配方成本">{{ lab?.formula_cost ?? '-' }}</a-descriptions-item>
            <a-descriptions-item label="备注" :span="3">{{ lab?.lab_remark || '-' }}</a-descriptions-item>
          </a-descriptions>
        </template>
      </a-card>
    </a-card>

    <!-- 转化订单弹窗 -->
    <a-modal v-model:visible="convertVisible" title="转化订单" @ok="handleConvertConfirm" :confirm-loading="convertLoading" width="400px">
      <a-form :model="convertForm" layout="vertical">
        <a-form-item label="申请编号">
          <span style="font-weight:600">{{ header?.request_number }}</span>
        </a-form-item>
        <a-form-item label="是否已有订单" required>
          <a-select v-model:value="convertForm.has_order" placeholder="请选择">
            <a-select-option value="是">是 — 已有订单</a-select-option>
            <a-select-option value="否">否 — 暂无订单</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { ExclamationCircleOutlined } from '@ant-design/icons-vue';
import * as api from '@/api/sales/sampleRequest';
import { getSampleBomsByRequest } from '@/api/sales/sampleBom';

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const labSaving = ref(false);
const header = ref<any>(null);
const items = ref<any[]>([]);
const lab = ref<any>(null);
const relatedBoms = ref<any[]>([]);

const bomColumns = [
  { title: '样件BOM编号', dataIndex: 'sample_bom_number', width: 160 },
  { title: 'BOM名称', dataIndex: 'bom_name', width: 140 },
  { title: '产品编号', dataIndex: 'item_number', width: 110 },
  { title: '当前版本', dataIndex: 'current_version', width: 80 },
  { title: '最终版本', dataIndex: 'final_version', width: 80 },
  { title: '状态', dataIndex: 'status', width: 90 },
];

const labForm = reactive({
  lab_panel_qty: null as number | null,
  lab_powder_qty: null as number | null,
  completion_date: null as string | null,
  product_number: '',
  formula_cost: null as number | null,
  lab_remark: '',
});

const itemColumns = [
  { title: '类型', dataIndex: 'item_type', width: 160 },
  { title: '是否需要', dataIndex: 'is_requested', width: 100 },
  { title: '数量', dataIndex: 'quantity', width: 120 },
  { title: '单位', dataIndex: 'unit', width: 80 },
];

function statusColor(status: string) {
  const map: Record<string, string> = { '草稿': 'default', '待研发': 'orange', '研发中': 'processing', '已完成': 'success' };
  return map[status] || 'default';
}

function goBack() { router.push({ name: 'SampleRequestList' }); }
function handleEdit() { router.push({ name: 'SampleRequestCreate', query: { edit: header.value?.request_number } }); }
function goCreateSampleBom() {
  router.push({ name: 'SampleBomList' });
}

function fillLabForm(labData: any) {
  Object.assign(labForm, {
    lab_panel_qty: labData?.lab_panel_qty ?? null,
    lab_powder_qty: labData?.lab_powder_qty ?? null,
    completion_date: labData?.completion_date || null,
    product_number: labData?.product_number || '',
    formula_cost: labData?.formula_cost ?? null,
    lab_remark: labData?.lab_remark || '',
  });
}

async function fetchDetail() {
  loading.value = true;
  try {
    const id = route.params.id as string;
    const res: any = await api.getSampleRequestDetail(id);
    if (res.success) {
      header.value = res.data.header;
      items.value = res.data.items || [];
      lab.value = res.data.lab;
      if (res.data.lab) fillLabForm(res.data.lab);
      // 加载关联样件BOM
      if (res.data.header?.request_number) {
        try {
          const bomRes: any = await getSampleBomsByRequest(res.data.header.request_number);
          relatedBoms.value = bomRes.data || [];
        } catch { /* ignore */ }
      }
    }
  } finally {
    loading.value = false;
  }
}

async function handleSaveLab() {
  const id = route.params.id as string;
  labSaving.value = true;
  try {
    const res: any = await api.updateLabData(id, labForm);
    if (res.success) { message.success('实验室数据已保存'); fetchDetail(); }
    else { message.error(res.message || '保存失败'); }
  } catch { message.error('保存失败'); }
  finally { labSaving.value = false; }
}

function handleComplete() {
  Modal.confirm({
    title: '确认完成研发',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要完成样品申请「${(header.value?.request_number || '').trim()}」的研发吗？完成后将通知销售部。`,
    okText: '确定完成',
    cancelText: '取消',
    async onOk() {
      const id = route.params.id as string;
      labSaving.value = true;
      try {
        const res: any = await api.completeSampleRequest(id, labForm);
        if (res.success) { message.success(res.message || '完成研发'); fetchDetail(); }
      } catch { message.error('操作失败'); }
      finally { labSaving.value = false; }
    }
  });
}

// 转化订单
const convertVisible = ref(false);
const convertLoading = ref(false);
const convertForm = reactive({ has_order: '' });

function handleConvertOrder() {
  convertForm.has_order = header.value?.has_order || '';
  convertVisible.value = true;
}

async function handleConvertConfirm() {
  const id = route.params.id as string;
  convertLoading.value = true;
  try {
    const res: any = await api.convertToOrder(id, { has_order: convertForm.has_order });
    if (res.success) { message.success(res.message || '转化订单成功'); convertVisible.value = false; fetchDetail(); }
    else { message.error(res.message || '转化订单失败'); }
  } catch { message.error('转化订单失败'); }
  finally { convertLoading.value = false; }
}

onMounted(fetchDetail);
</script>

<style scoped>
h4 { margin: 8px 0; }
</style>
