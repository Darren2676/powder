<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import * as ticketApi from '@/api/ticket';
import type { Ticket, TicketQueryParams } from '@/types';
import { STATUS_MAP, PRIORITY_MAP, STATUS_COLORS, PRIORITY_COLORS, DEFAULT_PAGE_SIZE } from '@/utils/constants';
import { EditOutlined, DeleteOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import dayjs from 'dayjs';

const router = useRouter();
const loading = ref(false);
const tickets = ref<Ticket[]>([]);
const total = ref(0);

const queryParams = reactive<TicketQueryParams>({
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  status: undefined,
  priority: undefined,
  search: '',
  sortBy: 'created_at',
  sortOrder: 'desc'
});

const searchTimeout = ref<number | null>(null);

const columns = [
  {
    title: 'ID',
    dataIndex: 'id',
    key: 'id',
    width: 80
  },
  {
    title: '标题',
    dataIndex: 'title',
    key: 'title',
    ellipsis: true
  },
  {
    title: '优先级',
    dataIndex: 'priority',
    key: 'priority',
    width: 100
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 100
  },
  {
    title: '创建人',
    dataIndex: 'creator',
    key: 'creator',
    width: 120
  },
  {
    title: '处理人',
    dataIndex: 'assignee',
    key: 'assignee',
    width: 120
  },
  {
    title: '创建时间',
    dataIndex: 'created_at',
    key: 'created_at',
    width: 180,
    sorter: true
  },
  {
    title: '操作',
    key: 'action',
    fixed: 'right',
    width: 180
  }
];

const fetchTickets = async () => {
  loading.value = true;
  try {
    const response: any = await ticketApi.getTickets(queryParams);
    if (response.success) {
      tickets.value = response.data.items;
      total.value = response.data.pagination.total;
    }
  } catch (error) {
    console.error('Failed to fetch tickets:', error);
  } finally {
    loading.value = false;
  }
};

const handleTableChange = (pagination: any, filters: any, sorter: any) => {
  queryParams.page = pagination.current;
  queryParams.limit = pagination.pageSize;
  
  if (sorter.field) {
    queryParams.sortBy = sorter.field;
    queryParams.sortOrder = sorter.order === 'ascend' ? 'asc' : 'desc';
  }
  
  fetchTickets();
};

const handleSearch = (value: string) => {
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value);
  }
  
  searchTimeout.value = window.setTimeout(() => {
    queryParams.search = value;
    queryParams.page = 1;
    fetchTickets();
  }, 500);
};

const handleStatusChange = (value: string) => {
  queryParams.status = value || undefined;
  queryParams.page = 1;
  fetchTickets();
};

const handlePriorityChange = (value: string) => {
  queryParams.priority = value || undefined;
  queryParams.page = 1;
  fetchTickets();
};

const handleView = (record: Ticket) => {
  router.push(`/tickets/${record.id}`);
};

const handleEdit = (record: Ticket) => {
  router.push(`/tickets/${record.id}?edit=true`);
};

const handleDelete = (record: Ticket) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除工单 "${record.title}" 吗?`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        const response: any = await ticketApi.deleteTicket(record.id);
        if (response.success) {
          message.success('删除成功');
          fetchTickets();
        }
      } catch (error) {
        console.error('Failed to delete ticket:', error);
      }
    }
  });
};

const handleCreate = () => {
  router.push('/tickets/create');
};

onMounted(() => {
  fetchTickets();
});
</script>

<template>
  <div class="ticket-list-container">
    <a-card>
      <!-- Filter Bar -->
      <div style="margin-bottom: 16px;">
        <a-space wrap>
          <a-select
            v-model:value="queryParams.status"
            placeholder="筛选状态"
            style="width: 120px;"
            allow-clear
            @change="handleStatusChange"
          >
            <a-select-option value="pending">待处理</a-select-option>
            <a-select-option value="in_progress">处理中</a-select-option>
            <a-select-option value="completed">已完成</a-select-option>
            <a-select-option value="closed">已关闭</a-select-option>
          </a-select>

          <a-select
            v-model:value="queryParams.priority"
            placeholder="筛选优先级"
            style="width: 120px;"
            allow-clear
            @change="handlePriorityChange"
          >
            <a-select-option value="low">低</a-select-option>
            <a-select-option value="medium">中</a-select-option>
            <a-select-option value="high">高</a-select-option>
            <a-select-option value="urgent">紧急</a-select-option>
          </a-select>

          <a-input-search
            v-model:value="queryParams.search"
            placeholder="搜索工单标题"
            style="width: 300px;"
            @search="handleSearch"
            @change="e => handleSearch(e.target.value)"
          />

          <a-button type="primary" @click="handleCreate">
            <template #icon>
              <PlusOutlined />
            </template>
            创建工单
          </a-button>
        </a-space>
      </div>

      <!-- Table -->
      <a-table
        :columns="columns"
        :data-source="tickets"
        :loading="loading"
        :pagination="{
          current: queryParams.page,
          pageSize: queryParams.limit,
          total: total,
          showSizeChanger: true,
          showTotal: (total: number) => `共 ${total} 条`
        }"
        :scroll="{ x: 1200 }"
        row-key="id"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'priority'">
            <a-tag :color="PRIORITY_COLORS[record.priority]">
              {{ PRIORITY_MAP[record.priority] }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'status'">
            <a-badge :status="STATUS_COLORS[record.status]" :text="STATUS_MAP[record.status]" />
          </template>

          <template v-else-if="column.key === 'creator'">
            {{ record.creator?.real_name || record.creator?.username || '-' }}
          </template>

          <template v-else-if="column.key === 'assignee'">
            {{ record.assignee?.real_name || record.assignee?.username || '未分配' }}
          </template>

          <template v-else-if="column.key === 'created_at'">
            {{ dayjs(record.created_at).format('YYYY-MM-DD HH:mm:ss') }}
          </template>

          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleView(record)">
                <template #icon>
                  <EyeOutlined />
                </template>
                查看
              </a-button>
              <a-button type="link" size="small" @click="handleEdit(record)">
                <template #icon>
                  <EditOutlined />
                </template>
                编辑
              </a-button>
              <a-button type="link" danger size="small" @click="handleDelete(record)">
                <template #icon>
                  <DeleteOutlined />
                </template>
                删除
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<style scoped>
.ticket-list-container {
  background: #fff;
  border-radius: 8px;
}
</style>
