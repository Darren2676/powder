<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import * as ticketApi from '@/api/ticket';
import * as userApi from '@/api/user';
import type { CreateTicketFormData, User } from '@/types';
import type { Rule } from 'ant-design-vue/es/form';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';

const router = useRouter();
const loading = ref(false);
const assignableUsers = ref<User[]>([]);

const formState = reactive<CreateTicketFormData>({
  title: '',
  description: '',
  priority: 'medium',
  category: '',
  assignee_id: undefined,
  due_date: undefined
});

const rules: Record<string, Rule[]> = {
  title: [
    { required: true, message: '请输入工单标题', trigger: 'blur' },
    { min: 3, max: 200, message: '标题长度应在3-200个字符之间', trigger: 'blur' }
  ],
  description: [
    { required: true, message: '请输入工单描述', trigger: 'blur' }
  ],
  priority: [
    { required: true, message: '请选择优先级', trigger: 'change' }
  ]
};

const fetchAssignableUsers = async () => {
  try {
    const response: any = await userApi.getAssignableUsers();
    if (response.success) {
      assignableUsers.value = response.data;
    }
  } catch (error) {
    console.error('Failed to fetch assignable users:', error);
  }
};

const handleSubmit = async () => {
  loading.value = true;
  try {
    const submitData = { ...formState };
    
    // Format due_date if exists
    if (submitData.due_date) {
      submitData.due_date = dayjs(submitData.due_date).format('YYYY-MM-DD');
    }

    const response: any = await ticketApi.createTicket(submitData);
    if (response.success) {
      message.success('工单创建成功');
      router.push('/tickets');
    }
  } catch (error) {
    console.error('Failed to create ticket:', error);
  } finally {
    loading.value = false;
  }
};

const handleCancel = () => {
  router.back();
};

onMounted(() => {
  fetchAssignableUsers();
});
</script>

<template>
  <div class="ticket-create-container">
    <a-card title="创建工单">
      <a-form
        :model="formState"
        :rules="rules"
        layout="vertical"
        @finish="handleSubmit"
      >
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item name="title" label="工单标题">
              <a-input
                v-model:value="formState.title"
                placeholder="请输入工单标题"
                size="large"
              />
            </a-form-item>
          </a-col>

          <a-col :span="24">
            <a-form-item name="description" label="工单描述">
              <a-textarea
                v-model:value="formState.description"
                placeholder="请详细描述工单内容"
                :rows="6"
              />
            </a-form-item>
          </a-col>

          <a-col :xs="24" :md="12">
            <a-form-item name="priority" label="优先级">
              <a-select v-model:value="formState.priority" size="large">
                <a-select-option value="low">低</a-select-option>
                <a-select-option value="medium">中</a-select-option>
                <a-select-option value="high">高</a-select-option>
                <a-select-option value="urgent">紧急</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>

          <a-col :xs="24" :md="12">
            <a-form-item name="category" label="分类(选填)">
              <a-input
                v-model:value="formState.category"
                placeholder="如: 技术支持、故障报修等"
                size="large"
              />
            </a-form-item>
          </a-col>

          <a-col :xs="24" :md="12">
            <a-form-item name="assignee_id" label="指派给(选填)">
              <a-select
                v-model:value="formState.assignee_id"
                placeholder="选择处理人"
                size="large"
                allow-clear
                show-search
                :filter-option="(input: string, option: any) => {
                  return option.label.toLowerCase().includes(input.toLowerCase());
                }"
              >
                <a-select-option
                  v-for="user in assignableUsers"
                  :key="user.id"
                  :value="user.id"
                  :label="user.real_name || user.username"
                >
                  {{ user.real_name || user.username }} ({{ user.department || '未设置部门' }})
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>

          <a-col :xs="24" :md="12">
            <a-form-item name="due_date" label="截止日期(选填)">
              <a-date-picker
                v-model:value="formState.due_date"
                style="width: 100%;"
                size="large"
                placeholder="选择截止日期"
                :disabled-date="(current: any) => current && current < dayjs().startOf('day')"
              />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item>
          <a-space>
            <a-button type="primary" html-type="submit" :loading="loading" size="large">
              创建工单
            </a-button>
            <a-button @click="handleCancel" size="large">
              取消
            </a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<style scoped>
.ticket-create-container {
  max-width: 900px;
  margin: 0 auto;
}
</style>
