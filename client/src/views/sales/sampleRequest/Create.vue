<template>
  <div class="sample-request-create">
    <a-form :model="form" layout="horizontal" ref="formRef" :label-col="{ style: { width: '110px' } }" :wrapper-col="{ style: { maxWidth: 'calc(100% - 110px)' } }">
      <!-- 基础信息 -->
      <a-card title="基础信息" :bordered="false" style="margin-bottom:16px">
        <a-row :gutter="16">
          <a-col :span="6">
            <a-form-item label="申请日期">
              <a-date-picker v-model:value="form.request_date" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="需要完成日期">
              <a-date-picker v-model:value="form.deadline_date" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="申请人">
              <a-auto-complete v-model:value="form.applicant" :options="applicantOptions" placeholder="输入姓名搜索" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="紧急程度">
              <a-select v-model:value="form.urgency">
                <a-select-option value="一般">一般</a-select-option>
                <a-select-option value="紧急">紧急</a-select-option>
                <a-select-option value="特急">特急</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="客户名称">
              <a-input v-model:value="form.customer_name" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="市场">
              <a-input v-model:value="form.market" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="竞争对手">
              <a-input v-model:value="form.competitor" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="预估售价(RMB/kg 含税)">
              <a-input-number v-model:value="form.estimated_price" style="width:100%" :min="0" :precision="4" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="潜在用量(吨/月)">
              <a-input-number v-model:value="form.potential_usage" style="width:100%" :min="0" :precision="4" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="是否已有订单">
              <a-select v-model:value="form.has_order" allow-clear placeholder="请选择">
                <a-select-option value="是">是</a-select-option>
                <a-select-option value="否">否</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
      </a-card>

      <!-- 工艺信息 -->
      <a-card title="工艺信息" :bordered="false" style="margin-bottom:16px">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="喷涂工件">
              <a-input v-model:value="form.coating_workpiece" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="基材">
              <a-input v-model:value="form.substrate" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="前处理">
              <a-input v-model:value="form.pretreatment" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="喷枪类型">
              <a-input v-model:value="form.spray_gun_type" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="回收系统">
              <a-input v-model:value="form.recovery_system" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="烤炉类型">
              <a-input v-model:value="form.oven_type" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-card>

      <!-- 技术参数 -->
      <a-card title="技术参数" :bordered="false" style="margin-bottom:16px">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="颜色">
              <a-input v-model:value="form.color_spec" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="产品类型">
              <a-input v-model:value="form.product_type" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="膜厚范围">
              <a-input v-model:value="form.film_thickness" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="光泽范围">
              <a-input v-model:value="form.gloss_range" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="固化条件">
              <a-input v-model:value="form.curing_condition" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="其它性能要求">
          <a-textarea v-model:value="form.other_requirements" :rows="3" />
        </a-form-item>
      </a-card>

      <!-- 需求样品 -->
      <a-card title="需求样品" :bordered="false" style="margin-bottom:16px">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item v-if="form.items[0]" label="样板(片)">
              <a-space>
                <a-checkbox v-model:checked="form.items[0].is_requested" />
                <a-input-number v-model:value="form.items[0].quantity" :min="0" style="width:120px" :disabled="!form.items[0].is_requested" />
              </a-space>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item v-if="form.items[1]" label="样粉(公斤)">
              <a-space>
                <a-checkbox v-model:checked="form.items[1].is_requested" />
                <a-input-number v-model:value="form.items[1].quantity" :min="0" :precision="4" style="width:120px" :disabled="!form.items[1].is_requested" />
              </a-space>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item v-if="form.items[2]" label="相溶性测试(次)">
              <a-space>
                <a-checkbox v-model:checked="form.items[2].is_requested" />
                <a-input-number v-model:value="form.items[2].quantity" :min="0" style="width:120px" :disabled="!form.items[2].is_requested" />
              </a-space>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item v-if="form.items[3]" label="测试报告(份)">
              <a-space>
                <a-checkbox v-model:checked="form.items[3].is_requested" />
                <a-input-number v-model:value="form.items[3].quantity" :min="0" style="width:120px" :disabled="!form.items[3].is_requested" />
              </a-space>
            </a-form-item>
          </a-col>
          <a-col :span="16">
            <a-form-item v-if="form.items[4]" label="其他">
              <a-space style="width:100%;display:flex">
                <a-checkbox v-model:checked="form.items[4].is_requested" />
                <a-input v-model:value="form.items[4].quantity" :disabled="!form.items[4].is_requested" placeholder="说明" style="flex:1;min-width:400px" />
              </a-space>
            </a-form-item>
          </a-col>
        </a-row>
      </a-card>

      <!-- 操作按钮 -->
      <div style="text-align:center; padding: 16px 0">
        <a-space size="large">
          <a-button @click="goBack">取消</a-button>
          <a-button type="primary" :loading="saving" @click="handleSave">保存</a-button>
        </a-space>
      </div>
    </a-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import type { Dayjs } from 'dayjs';
import * as api from '@/api/sales/sampleRequest';
import { getEmployees } from '@/api/master-data/employee';

const router = useRouter();
const route = useRoute();
const formRef = ref();
const saving = ref(false);
const isEdit = ref(false);
const editId = ref('');

// 员工列表（申请人下拉选择）
const employeeList = ref<{ employee_number: string; employee_name: string }[]>([]);
const applicantOptions = computed(() => {
  const search = (form.applicant || '').toLowerCase();
  if (!search) return employeeList.value.map(e => ({ value: e.employee_name }));
  return employeeList.value
    .filter(e => (e.employee_name || '').toLowerCase().includes(search))
    .map(e => ({ value: e.employee_name }));
});

const form = reactive({
  request_date: null as Dayjs | null,
  deadline_date: null as Dayjs | null,
  urgency: '一般',
  applicant: '',
  customer_name: '',
  market: '',
  competitor: '',
  estimated_price: null as number | null,
  potential_usage: null as number | null,
  has_order: '',
  coating_workpiece: '',
  substrate: '',
  pretreatment: '',
  spray_gun_type: '',
  recovery_system: '',
  oven_type: '',
  color_spec: '',
  product_type: '',
  film_thickness: '',
  gloss_range: '',
  curing_condition: '',
  other_requirements: '',
  items: [
    { item_type: '样板', unit: '片', is_requested: false, quantity: null as number | null, sort_order: 1 },
    { item_type: '样粉', unit: '公斤', is_requested: false, quantity: null as number | null, sort_order: 2 },
    { item_type: '相溶性测试', unit: '次', is_requested: false, quantity: null as number | null, sort_order: 3 },
    { item_type: '测试报告', unit: '份', is_requested: false, quantity: null as number | null, sort_order: 4 },
    { item_type: '其他', unit: '', is_requested: false, quantity: null as number | null, sort_order: 5 },
  ],
});

const itemColumns = [
  { title: '类型', dataIndex: 'item_type', width: 130 },
  { title: '单位', dataIndex: 'unit', width: 80 },
  { title: '是否需求', key: 'is_requested', width: 90, slots: { customRender: 'is_requested' } },
  { title: '数量', key: 'quantity', slots: { customRender: 'quantity' } },
];

function goBack() { router.push({ name: 'SampleRequestList' }); }

function formatDate(d: Dayjs | null): string | null {
  if (!d) return null;
  return d.format('YYYY-MM-DD');
}

async function handleSave() {
  saving.value = true;
  try {
    const payload: any = {
      request_date: formatDate(form.request_date),
      deadline_date: formatDate(form.deadline_date),
      urgency: form.urgency,
      applicant: form.applicant,
      customer_name: form.customer_name,
      market: form.market,
      competitor: form.competitor,
      estimated_price: form.estimated_price,
      potential_usage: form.potential_usage,
      has_order: form.has_order,
      coating_workpiece: form.coating_workpiece,
      substrate: form.substrate,
      pretreatment: form.pretreatment,
      spray_gun_type: form.spray_gun_type,
      recovery_system: form.recovery_system,
      oven_type: form.oven_type,
      color_spec: form.color_spec,
      product_type: form.product_type,
      film_thickness: form.film_thickness,
      gloss_range: form.gloss_range,
      curing_condition: form.curing_condition,
      other_requirements: form.other_requirements,
      items: form.items,
    };

    let res: any;
    if (isEdit.value) {
      res = await api.updateSampleRequest(editId.value, payload);
    } else {
      res = await api.createSampleRequest(payload);
    }
    if (res.success) {
      message.success(res.message || (isEdit.value ? '更新成功' : '创建成功'));
      router.push({ name: 'SampleRequestList' });
    }
  } finally {
    saving.value = false;
  }
}

async function loadEdit(id: string) {
  try {
    const res: any = await api.getSampleRequestDetail(id);
    if (res.success) {
      const h = res.data.header;
      Object.assign(form, {
        request_date: h.request_date ? (await import('dayjs')).default(h.request_date) : null,
        deadline_date: h.deadline_date ? (await import('dayjs')).default(h.deadline_date) : null,
        urgency: h.urgency || '一般',
        applicant: h.applicant || '',
        customer_name: h.customer_name || '',
        market: h.market || '',
        competitor: h.competitor || '',
        estimated_price: h.estimated_price,
        potential_usage: h.potential_usage,
        has_order: h.has_order || '',
        coating_workpiece: h.coating_workpiece || '',
        substrate: h.substrate || '',
        pretreatment: h.pretreatment || '',
        spray_gun_type: h.spray_gun_type || '',
        recovery_system: h.recovery_system || '',
        oven_type: h.oven_type || '',
        color_spec: h.color_spec || '',
        product_type: h.product_type || '',
        film_thickness: h.film_thickness || '',
        gloss_range: h.gloss_range || '',
        curing_condition: h.curing_condition || '',
        other_requirements: h.other_requirements || '',
        items: res.data.items?.length ? res.data.items : form.items,
      });
    }
  } catch { message.error('加载数据失败'); }
}

onMounted(async () => {
  // 加载员工列表
  try {
    const res: any = await getEmployees({ limit: 9999 });
    employeeList.value = res.data?.list || res.data?.items || res.data || [];
  } catch { /* ignore */ }

  const edit = route.query.edit as string;
  if (edit) {
    isEdit.value = true;
    editId.value = edit;
    loadEdit(edit);
  }
});
</script>
