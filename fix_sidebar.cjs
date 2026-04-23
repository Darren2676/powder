const fs = require('fs');
let c = fs.readFileSync('d:/rubber/Seals MES System/client/src/components/Layout/AppSidebar.vue', 'utf8');

const marker = '<a-sub-menu v-if="authStore.isAdmin" key="system-settings">';
const markerIdx = c.indexOf(marker);
if (markerIdx === -1) {
  console.log('Could not find marker');
  process.exit(1);
}

const beforeMarker = c.substring(0, markerIdx);
const subMenuCloseIdx = beforeMarker.lastIndexOf('</a-sub-menu>');
if (subMenuCloseIdx === -1) {
  console.log('Could not find sub-menu close');
  process.exit(1);
}

const newItems = `
      <a-menu-item key="equipment-downtime">
        <router-link :to="pathMap['equipment-downtime']" class="menu-link" @click.prevent>
          <PauseCircleOutlined />
          <span>\u8bbe\u5907\u505c\u673a\u8bb0\u5f55</span>
        </router-link>
      </a-menu-item>
      <a-menu-item key="equipment-maintenance-plan">
        <router-link :to="pathMap['equipment-maintenance-plan']" class="menu-link" @click.prevent>
          <ScheduleOutlined />
          <span>\u8bbe\u5907\u4fdd\u517b\u8ba1\u5212</span>
        </router-link>
      </a-menu-item>
      <a-menu-item key="equipment-oee">
        <router-link :to="pathMap['equipment-oee']" class="menu-link" @click.prevent>
          <DashboardOutlined />
          <span>OEE\u5206\u6790</span>
        </router-link>
      </a-menu-item>
    </a-sub-menu>`;

const before = c.substring(0, subMenuCloseIdx);
const after = c.substring(subMenuCloseIdx + '</a-sub-menu>'.length);
c = before + newItems + after;

fs.writeFileSync('d:/rubber/Seals MES System/client/src/components/Layout/AppSidebar.vue', c, 'utf8');
console.log('Menu items added successfully');
