<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as ticketApi from '@/api/ticket';
import * as commentApi from '@/api/comment';
import * as attachmentApi from '@/api/attachment';
import * as userApi from '@/api/user';
import type { Ticket, Comment, Attachment, User } from '@/types';
import { useAuthStore } from '@/store/auth';
import { STATUS_MAP, PRIORITY_MAP, STATUS_COLORS, PRIORITY_COLORS, ROLE_MAP } from '@/utils/constants';
import { message, Modal } from 'ant-design-vue';
import { DownloadOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const loading = ref(false);
const ticket = ref<Ticket | null>(null);
const comments = ref<Comment[]>([]);
const attachments = ref<Attachment[]>([]);
const assignableUsers = ref<User[]>([]);

const commentContent = ref('');
const commentLoading = ref(false);
const uploadLoading = ref(false);

const ticketId = computed(() => parseInt(route.params.id as string));
const currentUser = computed(() => authStore.user);
const isCreator = computed(() => ticket.value?.creator_id === currentUser.value?.id);
const isAssignee = computed(() => ticket.value?.assignee_id === currentUser.value?.id);
const canEdit = computed(() => authStore.isAdmin || authStore.isManager || isCreator.value);
const canManage = computed(() => authStore.isAdmin || authStore.isManager);

const fetchTicketDetail = async () => {
  loading.value = true;
  try {
    const response: any = await ticketApi.getTicketById(ticketId.value);
    if (response.success) {
      ticket.value = response.data;
    }
  } catch (error) {
    console.error('Failed to fetch ticket:', error);
    message.error('获取工单详情失败');
  } finally {
    loading.value = false;
  }
};

const fetchComments = async () => {
  try {
    const response: any = await commentApi.getComments(ticketId.value);
    if (response.success) {
      comments.value = response.data;
    }
  } catch (error) {
    console.error('Failed to fetch comments:', error);
  }
};

const fetchAttachments = async () => {
  try {
    const response: any = await attachmentApi.getAttachments(ticketId.value);
    if (response.success) {
      attachments.value = response.data;
    }
  } catch (error) {
    console.error('Failed to fetch attachments:', error);
  }
};

const fetchAssignableUsers = async () => {
  try {
    const response: any = await userApi.getAssignableUsers();
    if (response.success) {
      assignableUsers.value = response.data;
    }
  } catch (error) {
    console.error('Failed to fetch users:', error);
  }
};

const handleStatusChange = async (status: string) => {
  try {
    const response: any = await ticketApi.updateTicketStatus(ticketId.value, status);
    if (response.success) {
      message.success('状态更新成功');
      await fetchTicketDetail();
    }
  } catch (error) {
    console.error('Failed to update status:', error);
  }
};

const handleAssign = async (userId: number) => {
  try {
    const response: any = await ticketApi.assignTicket(ticketId.value, userId);
    if (response.success) {
      message.success('分配成功');
      await fetchTicketDetail();
    }
  } catch (error) {
    console.error('Failed to assign ticket:', error);
  }
};

const handleDelete = () => {
  Modal.confirm({
    title: '确认删除',
    content: '确定要删除此工单吗?此操作不可恢复。',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        const response: any = await ticketApi.deleteTicket(ticketId.value);
        if (response.success) {
          message.success('删除成功');
          router.push('/tickets');
        }
      } catch (error) {
        console.error('Failed to delete ticket:', error);
      }
    }
  });
};

const handleAddComment = async () => {
  if (!commentContent.value.trim()) {
    message.warning('请输入评论内容');
    return;
  }

  commentLoading.value = true;
  try {
    const response: any = await commentApi.createComment(ticketId.value, commentContent.value);
    if (response.success) {
      message.success('评论添加成功');
      commentContent.value = '';
      await fetchComments();
    }
  } catch (error) {
    console.error('Failed to add comment:', error);
  } finally {
    commentLoading.value = false;
  }
};

const handleDeleteComment = (commentId: number) => {
  Modal.confirm({
    title: '确认删除',
    content: '确定要删除此评论吗?',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        const response: any = await commentApi.deleteComment(commentId);
        if (response.success) {
          message.success('删除成功');
          await fetchComments();
        }
      } catch (error) {
        console.error('Failed to delete comment:', error);
      }
    }
  });
};

const handleUpload = async (file: File) => {
  uploadLoading.value = true;
  try {
    const response: any = await attachmentApi.uploadAttachment(ticketId.value, file);
    if (response.success) {
      message.success('上传成功');
      await fetchAttachments();
    }
  } catch (error) {
    console.error('Failed to upload file:', error);
  } finally {
    uploadLoading.value = false;
  }
  return false; // Prevent default upload behavior
};

const handleDownload = async (attachment: Attachment) => {
  try {
    const response: any = await attachmentApi.downloadAttachment(attachment.id);
    const url = window.URL.createObjectURL(new Blob([response]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', attachment.original_name);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    console.error('Failed to download file:', error);
    message.error('下载失败');
  }
};

const handleDeleteAttachment = (attachmentId: number) => {
  Modal.confirm({
    title: '确认删除',
    content: '确定要删除此附件吗?',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        const response: any = await attachmentApi.deleteAttachment(attachmentId);
        if (response.success) {
          message.success('删除成功');
          await fetchAttachments();
        }
      } catch (error) {
        console.error('Failed to delete attachment:', error);
      }
    }
  });
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

onMounted(() => {
  fetchTicketDetail();
  fetchComments();
  fetchAttachments();
  fetchAssignableUsers();
});
</script>

<template>
  <div class="ticket-detail-container">
    <a-spin :spinning="loading">
      <a-card v-if="ticket" title="工单详情">
        <!-- Ticket Info -->
        <a-descriptions bordered :column="{ xs: 1, sm: 1, md: 2 }">
          <a-descriptions-item label="标题" :span="2">
            <strong style="font-size: 16px;">{{ ticket.title }}</strong>
          </a-descriptions-item>
          
          <a-descriptions-item label="状态">
            <a-badge :status="STATUS_COLORS[ticket.status]" :text="STATUS_MAP[ticket.status]" />
          </a-descriptions-item>
          
          <a-descriptions-item label="优先级">
            <a-tag :color="PRIORITY_COLORS[ticket.priority]">
              {{ PRIORITY_MAP[ticket.priority] }}
            </a-tag>
          </a-descriptions-item>
          
          <a-descriptions-item label="分类">
            {{ ticket.category || '未分类' }}
          </a-descriptions-item>
          
          <a-descriptions-item label="创建人">
            {{ ticket.creator?.real_name || ticket.creator?.username }}
          </a-descriptions-item>
          
          <a-descriptions-item label="处理人">
            {{ ticket.assignee?.real_name || ticket.assignee?.username || '未分配' }}
          </a-descriptions-item>
          
          <a-descriptions-item label="创建时间">
            {{ dayjs(ticket.created_at).format('YYYY-MM-DD HH:mm:ss') }}
          </a-descriptions-item>
          
          <a-descriptions-item label="截止日期">
            {{ ticket.due_date ? dayjs(ticket.due_date).format('YYYY-MM-DD') : '未设置' }}
          </a-descriptions-item>
          
          <a-descriptions-item label="完成时间">
            {{ ticket.completed_at ? dayjs(ticket.completed_at).format('YYYY-MM-DD HH:mm:ss') : '-' }}
          </a-descriptions-item>
          
          <a-descriptions-item label="描述" :span="2">
            <div style="white-space: pre-wrap;">{{ ticket.description }}</div>
          </a-descriptions-item>
        </a-descriptions>

        <!-- Action Buttons -->
        <div style="margin-top: 16px;">
          <a-space wrap>
            <a-dropdown v-if="canManage || isAssignee">
              <a-button type="primary">
                更改状态
              </a-button>
              <template #overlay>
                <a-menu @click="({ key }) => handleStatusChange(key)">
                  <a-menu-item key="pending">待处理</a-menu-item>
                  <a-menu-item key="in_progress">处理中</a-menu-item>
                  <a-menu-item key="completed">已完成</a-menu-item>
                  <a-menu-item key="closed">已关闭</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>

            <a-select
              v-if="canManage"
              :value="ticket.assignee_id"
              placeholder="分配给..."
              style="width: 180px;"
              @change="handleAssign"
            >
              <a-select-option
                v-for="user in assignableUsers"
                :key="user.id"
                :value="user.id"
              >
                {{ user.real_name || user.username }}
              </a-select-option>
            </a-select>

            <a-button v-if="canEdit" danger @click="handleDelete">
              删除工单
            </a-button>
          </a-space>
        </div>
      </a-card>

      <!-- Comments Section -->
      <a-card title="评论" style="margin-top: 16px;">
        <a-list
          v-if="comments.length > 0"
          :data-source="comments"
          item-layout="horizontal"
        >
          <template #renderItem="{ item }">
            <a-list-item>
              <a-list-item-meta>
                <template #avatar>
                  <a-avatar>{{ item.user?.real_name?.charAt(0) || item.user?.username?.charAt(0) || 'U' }}</a-avatar>
                </template>
                <template #title>
                  <span>{{ item.user?.real_name || item.user?.username }}</span>
                  <span style="margin-left: 8px; font-size: 12px; color: #999;">
                    {{ dayjs(item.created_at).format('YYYY-MM-DD HH:mm:ss') }}
                  </span>
                </template>
                <template #description>
                  <div style="white-space: pre-wrap;">{{ item.content }}</div>
                </template>
              </a-list-item-meta>
              <template #actions v-if="item.user_id === currentUser?.id || authStore.isAdmin">
                <a-button type="link" danger size="small" @click="handleDeleteComment(item.id)">
                  删除
                </a-button>
              </template>
            </a-list-item>
          </template>
        </a-list>
        <a-empty v-else description="暂无评论" />

        <!-- Add Comment -->
        <div style="margin-top: 16px;">
          <a-textarea
            v-model:value="commentContent"
            placeholder="添加评论..."
            :rows="3"
          />
          <a-button
            type="primary"
            :loading="commentLoading"
            style="margin-top: 8px;"
            @click="handleAddComment"
          >
            发表评论
          </a-button>
        </div>
      </a-card>

      <!-- Attachments Section -->
      <a-card title="附件" style="margin-top: 16px;">
        <a-list
          v-if="attachments.length > 0"
          :data-source="attachments"
          item-layout="horizontal"
        >
          <template #renderItem="{ item }">
            <a-list-item>
              <a-list-item-meta>
                <template #title>
                  {{ item.original_name }}
                </template>
                <template #description>
                  大小: {{ formatFileSize(item.file_size) }} | 
                  上传者: {{ item.uploader?.real_name || item.uploader?.username }} | 
                  上传时间: {{ dayjs(item.created_at).format('YYYY-MM-DD HH:mm:ss') }}
                </template>
              </a-list-item-meta>
              <template #actions>
                <a-button type="link" @click="handleDownload(item)">
                  <template #icon>
                    <DownloadOutlined />
                  </template>
                  下载
                </a-button>
                <a-button
                  v-if="item.uploader_id === currentUser?.id || authStore.isAdmin"
                  type="link"
                  danger
                  @click="handleDeleteAttachment(item.id)"
                >
                  <template #icon>
                    <DeleteOutlined />
                  </template>
                  删除
                </a-button>
              </template>
            </a-list-item>
          </template>
        </a-list>
        <a-empty v-else description="暂无附件" />

        <!-- Upload -->
        <div style="margin-top: 16px;">
          <a-upload
            :before-upload="handleUpload"
            :show-upload-list="false"
          >
            <a-button :loading="uploadLoading">
              <template #icon>
                <UploadOutlined />
              </template>
              上传附件
            </a-button>
          </a-upload>
        </div>
      </a-card>
    </a-spin>
  </div>
</template>

<style scoped>
.ticket-detail-container {
  max-width: 1200px;
  margin: 0 auto;
}
</style>
