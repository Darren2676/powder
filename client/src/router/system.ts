// system 域路由
import type { RouteRecordRaw } from 'vue-router';

const UserManagement = () => import('@/views/system/User/Management.vue');
const RoleList = () => import('@/views/system/Role/List.vue');
const PermissionList = () => import('@/views/system/Permission/List.vue');
const DepartmentList = () => import('@/views/system/Department/List.vue');
const WorkflowList = () => import('@/views/system/Workflow/List.vue');
const WorkflowDesigner = () => import('@/views/system/Workflow/Designer.vue');
const MyTasks = () => import('@/views/system/Workflow/MyTasks.vue');
const DocumentCompletionConfigList = () => import('@/views/system/DocumentCompletionConfig/List.vue');
const ManualClosePending = () => import('@/views/system/ManualClose/Pending.vue');
const ApiKeyList = () => import('@/views/system/ApiKey/List.vue');
const AutoStockCount = () => import('@/views/system/AutoStockCount/Index.vue');
const FactoryList = () => import('@/views/system/Factory/List.vue');
const BatchNumberRuleList = () => import('@/views/system/BatchNumberRule/List.vue');

export const systemRoutes: RouteRecordRaw[] = [
  { path: 'users', name: 'UserManagement', component: UserManagement, meta: {"title":"用户管理","permissionCode":"users"} },
  { path: 'roles', name: 'RoleList', component: RoleList, meta: {"title":"角色管理","permissionCode":"system"} },
  { path: 'permissions', name: 'PermissionList', component: PermissionList, meta: {"title":"权限菜单管理","permissionCode":"system"} },
  { path: 'departments', name: 'DepartmentList', component: DepartmentList, meta: {"title":"部门管理","permissionCode":"departments"} },
  { path: 'factories', name: 'FactoryList', component: FactoryList, meta: {"title":"工厂管理","permissionCode":"system"} },
  { path: 'batch-number-rules', name: 'BatchNumberRuleList', component: BatchNumberRuleList, meta: {"title":"产品批次号产生规则","permissionCode":"batch_number_rule"} },
  { path: 'workflow', name: 'WorkflowList', component: WorkflowList, meta: {"title":"流程定义管理","permissionCode":"workflow"} },
  { path: 'workflow/designer/:id', name: 'WorkflowDesigner', component: WorkflowDesigner, meta: {"title":"流程设计器","permissionCode":"workflow"} },
  { path: 'my-tasks', name: 'MyTasks', component: MyTasks, meta: {"title":"我的待办"} },
  { path: 'document-completion-config', name: 'DocumentCompletionConfig', component: DocumentCompletionConfigList, meta: {"title":"单据自动完成配置","permissionCode":"system"} },
  { path: 'manual-close-pending', name: 'ManualClosePending', component: ManualClosePending, meta: {"title":"手动关闭审批","permissionCode":"manual_close"} },
  { path: 'api-keys', name: 'ApiKeyList', component: ApiKeyList, meta: {"title":"API密钥管理","permissionCode":"system"} },
  { path: 'auto-stock-count', name: 'AutoStockCount', component: AutoStockCount, meta: {"title":"自动创建成品仓库月未盘点表","permissionCode":"system"} },
];
