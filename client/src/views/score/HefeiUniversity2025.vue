<template>
  <div>
    <a-card :bordered="false">
      <a-page-header title="合肥大学2025" sub-title="录取分数" style="padding: 0; margin-bottom: 16px;" />
      <a-table
        :columns="columns"
        :data-source="scoreData"
        :pagination="{ pageSize: 10, pageSizeOptions: ['10', '20', '30', '50'], showSizeChanger: true, showQuickJumper: true, showTotal: (total: number) => `共 ${total} 条` }"
        row-key="major"
        :scroll="{ x: 1000, y: 'calc(100vh - 240px)' }"
        size="small"
      />
    </a-card>
  </div>
</template>

<script setup lang="ts">
const columns = [
  { title: '年份', dataIndex: 'year', key: 'year', width: 80 },
  { title: '专业名称', dataIndex: 'major', key: 'major', width: 200 },
  { title: '选考科目要求', dataIndex: 'subject', key: 'subject', width: 120 },
  { title: '录取最高分/排名', dataIndex: 'highest', key: 'highest', width: 150 },
  { title: '录取平均分', dataIndex: 'average', key: 'average', width: 110 },
  { title: '录取最低分/排名', dataIndex: 'lowest', key: 'lowest', width: 150 },
  { title: '说明', dataIndex: 'note', key: 'note', width: 100 },
]

const scoreData = [
  { year: 2025, major: '车辆工程', subject: '化学', highest: '553 / 67212', average: '545.22', lowest: '544 / 76463', note: '' },
  { year: 2025, major: '电子信息工程', subject: '化学', highest: '598 / 28042', average: '553.41', lowest: '550 / 70108', note: '' },
  { year: 2025, major: '工业设计', subject: '化学', highest: '545 / 75479', average: '542.02', lowest: '540 / 80938', note: '' },
  { year: 2025, major: '化学工程与工艺', subject: '化学', highest: '553 / 66286', average: '541.93', lowest: '540 / 80991', note: '' },
  { year: 2025, major: '环境工程', subject: '化学', highest: '545 / 75669', average: '542.92', lowest: '542 / 79501', note: '' },
  { year: 2025, major: '机械电子工程', subject: '化学', highest: '561 / 58939', average: '547.19', lowest: '545 / 75027', note: '' },
  { year: 2025, major: '机械设计制造及其自动化', subject: '化学', highest: '571 / 49135', average: '549.75', lowest: '547 / 73367', note: '' },
  { year: 2025, major: '集成电路设计与集成系统', subject: '化学', highest: '561 / 58020', average: '547.29', lowest: '545 / 75369', note: '' },
  { year: 2025, major: '计算机科学与技术', subject: '化学', highest: '574 / 46726', average: '557.54', lowest: '553 / 66264', note: '' },
  { year: 2025, major: '交通工程', subject: '化学', highest: '550 / 70479', average: '543.73', lowest: '540 / 80863', note: '' },
  { year: 2025, major: '能源化学工程', subject: '化学', highest: '555 / 65150', average: '543.65', lowest: '542 / 79575', note: '' },
  { year: 2025, major: '软件工程', subject: '化学', highest: '567 / 52928', average: '550.99', lowest: '548 / 72472', note: '' },
  { year: 2025, major: '生物工程', subject: '化学', highest: '548 / 71990', average: '541.49', lowest: '540 / 80816', note: '' },
  { year: 2025, major: '生物制药', subject: '化学', highest: '546 / 74654', average: '542.02', lowest: '540 / 80929', note: '' },
  { year: 2025, major: '食品科学与工程', subject: '化学', highest: '550 / 70173', average: '542.19', lowest: '540 / 80973', note: '' },
  { year: 2025, major: '数据科学与大数据技术', subject: '化学', highest: '570 / 50493', average: '546', lowest: '544 / 76709', note: '' },
  { year: 2025, major: '数学与应用数学(师范)', subject: '化学', highest: '565 / 54258', average: '543.66', lowest: '540 / 81004', note: '' },
  { year: 2025, major: '通信工程', subject: '化学', highest: '563 / 56624', average: '547.23', lowest: '546 / 74767', note: '' },
  { year: 2025, major: '土木工程', subject: '化学', highest: '544 / 76474', average: '543.95', lowest: '543 / 78140', note: '' },
  { year: 2025, major: '网络工程', subject: '化学', highest: '554 / 65671', average: '545.06', lowest: '544 / 76976', note: '' },
  { year: 2025, major: '无机非金属材料工程', subject: '化学', highest: '560 / 59947', average: '542.61', lowest: '540 / 80865', note: '' },
  { year: 2025, major: '新能源材料与器件', subject: '化学', highest: '555 / 64335', average: '544.49', lowest: '543 / 77903', note: '' },
  { year: 2025, major: '信息与计算科学(中外合作办学)', subject: '化学', highest: '542 / 78670', average: '536.2', lowest: '533 / 90071', note: '' },
  { year: 2025, major: '应用统计学', subject: '化学', highest: '549 / 70765', average: '543.25', lowest: '541 / 75994', note: '' },
  { year: 2025, major: '智慧交通', subject: '化学', highest: '544 / 76556', average: '542.5', lowest: '540 / 80978', note: '' },
  { year: 2025, major: '智能建造', subject: '化学', highest: '550 / 70228', average: '541.13', lowest: '540 / 81008', note: '' },
  { year: 2025, major: '智能科学与技术', subject: '化学', highest: '581 / 40968', average: '545.78', lowest: '544 / 77037', note: '' },
  { year: 2025, major: '智能制造工程', subject: '化学', highest: '554 / 65753', average: '545.29', lowest: '544 / 76745', note: '' },
  { year: 2025, major: '自动化', subject: '化学', highest: '568 / 52125', average: '550.68', lowest: '548 / 72398', note: '' },
]
</script>
