import app from './app';
import { initDatabase, User } from './models';
import { hashPassword } from './utils/password.util';
import dotenv from 'dotenv'; // reload env

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

const startServer = async () => {
  try {
    await initDatabase();

    const adminExists = await User.findOne({
      where: {
        role: 'admin'
      }
    });

    if (!adminExists) {
      console.log('创建默认管理员账号...');
      const hashedPassword = await hashPassword('admin123');

      await User.create({
        username: 'admin',
        email: 'admin@system.com',
        password: hashedPassword,
        real_name: '系统管理员',
        role: 'admin',
        status: 'active'
      });

      console.log('默认管理员账号创建成功');
      console.log('用户名: admin');
      console.log('密码: admin123');
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`服务器运行在端口 ${PORT}`);
      console.log(`API地址: http://localhost:${PORT}/api`);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`端口 ${PORT} 已被占用，请关闭占用端口的程序后重试`);
        process.exit(1);
      }
      console.error('服务器错误:', err);
    });

    process.on('SIGTERM', () => {
      console.log('收到 SIGTERM 信号，关闭服务器...');
      server.close(() => process.exit(0));
    });

    process.on('SIGINT', () => {
      console.log('收到 SIGINT 信号，关闭服务器...');
      server.close(() => process.exit(0));
    });

  } catch (error) {
    console.error('启动服务器失败:', error);
    process.exit(1);
  }
};

startServer();
