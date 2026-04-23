import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize({
  dialect: 'mssql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME || 'XYMES',
  username: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  logging: false,
  dialectOptions: { options: { encrypt: false, trustServerCertificate: true } }
});

// ===== 保留的机加规范名称 =====
const machiningSpecs = ['机加抽检', '机加巡检', '机加全检', '机加自检'];

// ===== 主表种子数据（仅材料规范，机加规范已在数据库中保留） =====
const specSeedData = [
  'E7020', 'A650J', 'F7106M', 'M701K', 'F7106G', 'FVQ502C', 'Q603', 'FVQ704C',
  'M803K', 'N7017', 'N7016', 'Q401', 'E7501KP', 'N504G', 'E6020', 'E618',
  'F7105K', 'E6007ZR', 'Q501C', 'FVQ703C', 'E5003', 'E6004KP', 'C5001R', 'F7105KZ',
  'N7020', 'N7002Q', 'FS6501C', 'M602K', 'N7010L', 'FVQ702C', 'N8005', 'N8002',
  'N6502', 'E7005KP', 'M704K', 'N7003G', 'N6501', 'Q301', 'FVQ706C', 'E8001KPS',
  'F6002TG', 'N716K', 'N716J', 'N5502', 'F7001', 'N7011K', 'F800', 'Q503C',
  'R6001', 'N7004'
];

// ===== 明细种子数据 =====

// 材料类计量型明细辅助函数（6项完整）
function materialItems(spec_name: string,
  hardness: [number, number, number], density: [number, number, number],
  strength: [string, number, number, number], elongation: [string, number, number, number],
  tc10: [number, number, number], tc90: [number, number, number]) {
  return [
    mi(spec_name, '硬度（邵A）', hardness, 10),
    mi(spec_name, '密度', density, 20),
    mi(spec_name, strength[0], [strength[1], strength[2], strength[3]], 30),
    mi(spec_name, elongation[0], [elongation[1], elongation[2], elongation[3]], 40),
    mi(spec_name, 'TC10(秒)', tc10, 50),
    mi(spec_name, 'TC90(秒)', tc90, 60),
  ];
}

// 单个计量型明细
function mi(spec_name: string, char_name: string, vals: [number, number, number], sort_order: number) {
  return {
    spec_name, item_type: '质量特性', char_name, char_category: '', inspect_requirement: char_name,
    data_type: '计量型数据', allow_multiple: '否',
    upper_limit: vals[0], standard_value: vals[1], lower_limit: vals[2],
    single_options: '', multi_options: '', qualified_options: '',
    default_result: '', default_value: '', is_required: '是', required_range: '仅次品必填',
    applied_category: '', sort_order
  };
}

const itemSeedData = [
  // === 45个完整6项材料规范 ===
  ...materialItems('E7020', [75,70,65], [1.2,1.18,1.16], ['拉断强度≥10',30,10,10], ['拉断伸长率≥300',500,300,300], [90,70,50], [280,250,220]),
  ...materialItems('A650J', [70,65,60], [1.39,1.37,1.35], ['拉断强度≥4.5',30,4.5,4.5], ['拉断伸长率≥200',700,200,200], [70,50,30], [390,360,330]),
  ...materialItems('F7106M', [75,70,65], [1.95,1.93,1.91], ['拉断强度≥8',30,8,8], ['拉断伸长率≥175',500,175,175], [80,60,40], [300,270,240]),
  ...materialItems('M701K', [75,70,65], [1.24,1.22,1.2], ['拉断强度≥10',30,10,10], ['拉断伸长率≥140',500,140,140], [90,70,50], [330,300,270]),
  ...materialItems('F7106G', [75,70,65], [1.95,1.93,1.91], ['拉断强度≥8',30,8,8], ['拉断伸长率≥175',500,175,175], [100,80,60], [330,300,270]),
  ...materialItems('FVQ502C', [55,50,45], [1.47,1.45,1.43], ['拉断强度≥7',30,7,7], ['拉断伸长率≥200',700,200,200], [70,50,30], [230,200,170]),
  ...materialItems('Q603', [65,60,55], [1.2,1.18,1.16], ['拉断强度≥6',30,6,6], ['拉断伸长率≥200',500,200,200], [70,50,30], [210,180,150]),
  ...materialItems('M803K', [85,80,75], [1.25,1.23,1.21], ['拉断强度≥10',30,10,10], ['拉断伸长率≥140',500,140,140], [70,50,30], [310,280,250]),
  ...materialItems('N7017', [70,65,60], [1.19,1.17,1.15], ['拉断强度≥10',30,10,10], ['拉断伸长率≥220',500,220,220], [110,90,70], [290,260,230]),
  ...materialItems('N7016', [75,70,65], [1.24,1.22,1.2], ['拉断强度≥10',30,10,10], ['拉断伸长率≥220',500,220,220], [80,60,40], [200,170,140]),
  ...materialItems('Q401', [45,40,35], [1.15,1.13,1.11], ['拉断强度≥4.5',30,4.5,4.5], ['拉断伸长率≥300',500,300,300], [70,50,30], [230,200,170]),
  ...materialItems('E7501KP', [80,75,70], [1.12,1.1,1.08], ['拉断强度≥11',30,11,11], ['拉断伸长率≥160',500,160,160], [70,50,30], [330,300,270]),
  ...materialItems('N504G', [55,50,45], [1.3,1.28,1.26], ['拉断强度≥4',30,4,4], ['拉断伸长率≥300',700,300,300], [90,70,50], [180,150,120]),
  ...materialItems('E6020', [65,60,55], [1.15,1.13,1.11], ['拉断强度≥10',30,10,10], ['拉断伸长率≥300',500,300,300], [70,50,30], [280,250,220]),
  ...materialItems('E618', [68,63,58], [1.22,1.2,1.18], ['拉断强度≥10',30,10,10], ['拉断伸长率≥300',500,300,300], [70,50,30], [260,230,200]),
  ...materialItems('F7105K', [75,70,65], [1.92,1.9,1.88], ['拉断强度≥7',30,7,7], ['拉断伸长率≥200',500,200,200], [80,60,40], [280,250,220]),
  ...materialItems('E6007ZR', [65,60,55], [1.16,1.14,1.12], ['拉断强度≥6',30,6,6], ['拉断伸长率≥250',500,250,250], [120,100,80], [270,240,210]),
  ...materialItems('Q501C', [55,50,45], [1.15,1.13,1.11], ['拉断强度≥5',30,5,5], ['拉断伸长率≥300',500,300,300], [70,50,30], [230,200,170]),
  ...materialItems('E5003', [60,55,50], [1.13,1.11,1.09], ['拉断强度≥10',30,10,10], ['拉断伸长率≥400',700,400,400], [80,60,40], [270,240,210]),
  ...materialItems('E6004KP', [70,65,60], [1.04,1.02,1], ['拉断强度≥12',30,12,12], ['拉断伸长率≥250',500,250,250], [80,60,40], [330,300,270]),
  ...materialItems('C5001R', [50,47,45], [1.42,1.4,1.38], ['拉断强度≥10',30,10,10], ['拉断伸长率≥400',700,400,400], [90,70,50], [260,230,200]),
  ...materialItems('F7105KZ', [75,70,65], [1.95,1.93,1.91], ['拉断强度≥8',30,8,8], ['拉断伸长率≥200',500,200,200], [80,60,40], [280,250,220]),
  ...materialItems('N7020', [80,75,70], [1.26,1.24,1.22], ['拉断强度≥10',30,10,10], ['拉断伸长率≥225',500,225,225], [120,100,80], [270,240,210]),
  ...materialItems('N7002Q', [75,73,70], [1.32,1.3,1.28], ['拉断强度≥10',30,10,10], ['拉断伸长率≥225',500,225,225], [120,100,80], [270,240,210]),
  ...materialItems('FS6501C', [70,65,60], [1.93,1.91,1.89], ['拉断强度≥7',30,7,7], ['拉断伸长率≥200',500,200,200], [140,120,100], [370,340,310]),
  ...materialItems('M602K', [70,65,60], [1.16,1.14,1.12], ['拉断强度≥10',30,10,10], ['拉断伸长率≥140',500,140,140], [100,80,60], [330,300,270]),
  ...materialItems('N7010L', [75,70,65], [1.24,1.22,1.2], ['拉断强度≥10',30,10,10], ['拉断伸长率≥220',500,220,220], [80,60,40], [230,200,170]),
  ...materialItems('N8005', [85,83,80], [1.31,1.29,1.27], ['拉断强度≥10',30,10,10], ['拉断伸长率≥200',500,200,200], [70,50,30], [180,150,120]),
  ...materialItems('N8002', [85,83,80], [1.26,1.24,1.22], ['拉断强度≥10',30,10,10], ['拉断伸长率≥200',500,200,200], [120,100,80], [270,240,210]),
  ...materialItems('N6502', [70,65,60], [1.2,1.18,1.16], ['拉断强度≥10',30,10,10], ['拉断伸长率≥225',500,225,225], [100,80,60], [250,220,190]),
  ...materialItems('E7005KP', [75,70,65], [1.11,1.09,1.07], ['拉断强度≥10',30,10,10], ['拉断伸长率≥200',500,200,200], [70,50,30], [290,260,230]),
  ...materialItems('M704K', [75,70,65], [1.2,1.18,1.16], ['拉断强度≥10',30,10,10], ['拉断伸长率≥150',500,150,150], [70,50,30], [330,300,270]),
  ...materialItems('N7003G', [70,65,60], [1.34,1.32,1.3], ['拉断强度≥10',30,10,10], ['拉断伸长率≥225',500,225,225], [110,90,70], [280,250,220]),
  ...materialItems('N6501', [70,65,60], [1.19,1.17,1.15], ['拉断强度≥10',30,10,10], ['拉断伸长率≥225',500,225,225], [120,100,80], [300,270,240]),
  ...materialItems('Q301', [35,30,25], [1.1,1.08,1.06], ['拉断强度≥4.5',30,4.5,4.5], ['拉断伸长率≥300',600,300,300], [70,50,30], [330,300,270]),
  ...materialItems('E8001KPS', [85,80,75], [1.17,1.15,1.13], ['拉断强度≥10',30,10,10], ['拉断伸长率≥200',500,200,200], [60,40,20], [270,240,210]),
  ...materialItems('F6002TG', [65,60,55], [1.88,1.86,1.84], ['拉断强度≥8',30,8,8], ['拉断伸长率≥200',500,200,200], [80,60,40], [300,270,240]),
  ...materialItems('N716K', [80,77,75], [1.27,1.25,1.23], ['拉断强度≥14',30,14,14], ['拉断伸长率≥250',500,250,250], [100,80,60], [240,210,180]),
  ...materialItems('N716J', [80,77,75], [1.27,1.25,1.23], ['拉断强度≥11',30,11,11], ['拉断伸长率≥175',500,175,175], [80,60,40], [210,180,150]),
  ...materialItems('N5502', [60,55,50], [1.3,1.28,1.26], ['拉断强度≥10',30,10,10], ['拉断伸长率≥300',500,300,300], [70,50,30], [180,150,120]),
  ...materialItems('F7001', [80,77,75], [1.91,1.89,1.87], ['拉断强度≥8',30,8,8], ['拉断伸长率≥175',500,200,200], [80,60,40], [250,220,190]),
  ...materialItems('N7011K', [75,70,65], [1.29,1.27,1.25], ['拉断强度≥10',30,10,10], ['拉断伸长率≥220',500,220,220], [90,70,50], [230,200,170]),
  ...materialItems('F800', [90,85,80], [1.84,1.82,1.8], ['拉断强度≥8',30,8,8], ['拉断伸长率≥150',500,150,150], [100,80,60], [330,300,270]),
  ...materialItems('Q503C', [55,50,45], [1.18,1.16,1.14], ['拉断强度≥5',30,5,5], ['拉断伸长率≥300',600,300,300], [70,50,30], [230,200,170]),
  ...materialItems('R6001', [65,60,55], [1.28,1.25,1.23], ['拉断强度≥8',30,8,8], ['拉断伸长率≥250',500,250,250], [110,90,70], [250,220,190]),

  // === 4个单项材料规范 ===
  mi('FVQ704C', '拉断强度≥7', [30,7,7], 10),
  mi('FVQ703C', '拉断伸长率≥200', [700,200,200], 10),
  mi('FVQ702C', 'TC10(秒)', [70,50,30], 10),
  mi('FVQ706C', '硬度（邵A）', [75,70,65], 10),

  // === N7004（3项） ===
  mi('N7004', '硬度（邵A）', [75,73,70], 10),
  mi('N7004', '密度', [1.23,1.21,1.19], 20),
  mi('N7004', '拉断强度≥10', [30,10,10], 30),
];

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 添加 applied_category 字段（如果不存在）
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('inspection_spec_item') AND name = 'applied_category')
        ALTER TABLE inspection_spec_item ADD applied_category NVARCHAR(200) DEFAULT ''
      `);
      console.log('applied_category 字段检查完成');
    } catch (e) { console.log('applied_category 字段已存在'); }

    // 清理旧的材料规范数据（保留机加规范）
    const machiningList = machiningSpecs.map(s => `N'${s}'`).join(',');
    const [delItems]: any = await sequelize.query(
      `DELETE FROM inspection_spec_item WHERE spec_name NOT IN (${machiningList})`
    );
    console.log(`已清理旧材料明细数据`);

    const [delSpecs]: any = await sequelize.query(
      `DELETE FROM inspection_spec WHERE spec_name NOT IN (${machiningList})`
    );
    console.log(`已清理旧材料主表数据`);

    // 插入新的材料规范主表
    let specInserted = 0;
    for (const spec_name of specSeedData) {
      try {
        await sequelize.query(
          `INSERT INTO inspection_spec (spec_name, defect_categories) VALUES (:spec_name, '')`,
          { replacements: { spec_name } }
        );
        specInserted++;
      } catch (e: any) {
        console.log(`主表跳过: ${spec_name} - ${e.message}`);
      }
    }
    console.log(`主表导入完成: ${specInserted}/${specSeedData.length} 条`);

    // 插入新的材料规范明细
    let itemInserted = 0;
    for (const item of itemSeedData) {
      try {
        await sequelize.query(
          `INSERT INTO inspection_spec_item (spec_name, item_type, char_name, char_category, inspect_requirement,
            data_type, allow_multiple, upper_limit, standard_value, lower_limit,
            single_options, multi_options, qualified_options, default_result, default_value,
            is_required, required_range, applied_category, sort_order)
           VALUES (:spec_name, :item_type, :char_name, :char_category, :inspect_requirement,
            :data_type, :allow_multiple, :upper_limit, :standard_value, :lower_limit,
            :single_options, :multi_options, :qualified_options, :default_result, :default_value,
            :is_required, :required_range, :applied_category, :sort_order)`,
          { replacements: item }
        );
        itemInserted++;
      } catch (e: any) {
        console.log(`明细跳过: ${item.spec_name}/${item.char_name} - ${e.message}`);
      }
    }
    console.log(`明细导入完成: ${itemInserted}/${itemSeedData.length} 条`);

    // 验证
    const [specCount]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM inspection_spec`);
    const [itemCount]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM inspection_spec_item`);
    console.log(`最终统计: 主表 ${specCount[0].cnt} 条, 明细 ${itemCount[0].cnt} 条`);

    await sequelize.close();
    console.log('迁移完成');
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
