# 毕业设计游戏项目《猫途》(MeowPath)
# MeowPath-Server

《猫途》游戏的后端服务，基于 Node.js + Express + MySQL。

## 功能

提供 6 个 RESTful API 接口：

| 接口                   | 方法 | 功能                           |
| ---------------------- | ---- | ------------------------------ |
| /api/register          | POST | 用户注册                       |
| /api/login             | POST | 用户登录（记录 IP 与设备信息） |
| /api/upload            | POST | 上传存档                       |
| /api/download          | POST | 下载存档                       |
| /api/updateStatsBatch  | POST | 批量统计上报                   |
| /api/updateLevelRecord | POST | 关卡记录上报                   |

## 技术栈

- Node.js v24.15.0 + Express 11.12.1
- MySQL 8.0
- bcryptjs（密码加密）

## 如何运行

1. 确保已安装 Node.js 和 MySQL
2. 在 MySQL 中创建数据库和表
3. 修改 `index.js` 中的数据库连接配置（host、user、password）
4. 执行：
```bash
npm install
node index.js
```

## 相关仓库

- 客户端：[MeowPath](https://github.com/wuyiduo1214/MeowPath)

## 作者

吴一多 | 男 | 24岁 | 银川科技学院 | 软件工程专业 | 2026届
