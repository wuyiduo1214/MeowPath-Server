const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();  
app.use(cors());
app.use(express.json());

// 数据库连接配置（改成自己的密码）
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'wuyiduo00',  // 改成自己的 MySQL 密码
    database: 'game_db',
    waitForConnections: true,
    connectionLimit: 10
});

// ========== 注册接口 ==========
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.json({ success: false, message: '用户名或密码不能为空' });
    }
    
    try {
        // 检查用户名是否已存在（注意字段名：username）
        const [existing] = await pool.query('SELECT user_id FROM users WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.json({ success: false, message: '用户名已存在' });
        }
        
        // 加密密码
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 1. 插入新用户
        const [result] = await pool.query(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username, hashedPassword]
        );
         const userId = result.insertId;
        
        // 2. 为新用户创建空的 game_data 记录
        //await pool.query('INSERT INTO game_data (user_id, data_json) VALUES (?, ?)', [result.insertId, '{}']);
        // await pool.query('INSERT INTO game_data (user_id, data_json, updated_at) VALUES (?, ?, NOW())',[result.insertId, '{}']);
        await pool.query(
            'INSERT INTO game_data (user_id, data_json) VALUES (?, ?)',
            [userId, '{}']
        );

         // 3. 创建 player_stats 记录（初始化默认值）
        await pool.query(
            'INSERT INTO player_stats (user_id) VALUES (?)',
            [userId]
        );

         // 4. 为 5 个关卡创建初始记录
        for (let i = 1; i <= 5; i++) {
            await pool.query(
                'INSERT INTO level_records (user_id, level_number) VALUES (?, ?)',
                [userId, i]
            );
        }
        
        res.json({ success: true, message: '注册成功' });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: '服务器错误' });
    }
});

// ========== 登录接口 ==========
app.post('/api/login', async (req, res) => {
    const { username, password, deviceInfo } = req.body;
    
    if (!username || !password) {
        return res.json({ success: false, message: '用户名或密码不能为空' });
    }

    // 获取客户端 IP（本地开发环境可能是 ::1 或 127.0.0.1）
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
    const clientDeviceInfo = deviceInfo || null;  // 设备信息（从 Unity 传来）
    
    try {
        // 查询用户（同时检查 status = 1 正常状态）
        const [users] = await pool.query(
            'SELECT user_id, password_hash, status FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            // 记录失败日志：用户名不存在
            await pool.query(
                'INSERT INTO login_logs (user_id, ip_address, device_info, login_result) VALUES (?, ?, ?, 0)',
                [0, ipAddress, clientDeviceInfo]
            );
            return res.json({ success: false, message: '用户名不存在' });
        }
        
        const user = users[0];

        // 检查账号状态
        if (user.status === 0) {
            // 记录失败日志：账号被禁用
            await pool.query(
                'INSERT INTO login_logs (user_id, ip_address, device_info, login_result) VALUES (?, ?, ?, 0)',
                [user.user_id, ipAddress, clientDeviceInfo]
            );
            return res.json({ success: false, message: '账号已被禁用' });
        }
        
        // 验证密码
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            // 记录失败日志：密码错误
            await pool.query(
                'INSERT INTO login_logs (user_id, ip_address, device_info, login_result) VALUES (?, ?, ?, 0)',
                [user.user_id, ipAddress, clientDeviceInfo]
            );
            return res.json({ success: false, message: '密码错误' });
        }

        // 更新最后登录时间和IP
        await pool.query(
            'UPDATE users SET last_login_time = NOW(), last_login_ip = ? WHERE user_id = ?',
            [ipAddress, user.user_id]
        );

        // 记录成功日志
        await pool.query(
            'INSERT INTO login_logs (user_id, ip_address, device_info, login_result) VALUES (?, ?, ?, 1)',
            [user.user_id, ipAddress, clientDeviceInfo]
        );
        
        res.json({ success: true, message: '登录成功', userId: user.user_id });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: '登录失败，请重试' });
    }
});

// ========== 上传存档接口 ==========
app.post('/api/upload', async (req, res) => {
    const { userId, gameData } = req.body;
    
    if (!userId || !gameData) {
        return res.json({ success: false, message: '缺少必要参数' });
    }
    
    try {
        // 更新 game_data 表
        await pool.query(
            'UPDATE game_data SET data_json = ?, updated_at = NOW() WHERE user_id = ?',
            [gameData, userId]
        );
        
        res.json({ success: true, message: '存档上传成功' });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: '服务器错误' });
    }
});

// ========== 下载存档接口 ==========
app.post('/api/download', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.json({ success: false, message: '缺少用户ID' });
    }
    
    try {
        // 查询 game_data 表
        // 使用 CAST 强制将 JSON 转为字符串
        const [rows] = await pool.query(
            'SELECT CAST(data_json AS CHAR) as data_json FROM game_data WHERE user_id = ?',
            [userId]
        );
        
        if (rows.length === 0) {
            return res.json({ success: false, message: '未找到存档' });
        }

        const gameData = rows[0].data_json;
        console.log(`用户ID ${userId} 的存档:`, gameData);  // 调试日志
        
        res.json({ success: true, gameData: rows[0].data_json });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: '服务器错误' });
    }
});

// ========== 批量更新玩家统计接口 ==========
app.post('/api/updateStatsBatch', async (req, res) => {
    const { userId, fishCount, deathCount, jumpCount, itemCount, completedCount, playtimeSeconds, distance } = req.body;
    
    if (!userId) {
        return res.json({ success: false, message: '缺少用户ID' });
    }
    
    try {
        // 构建动态 SQL（只更新有变化的字段）
        const updates = [];
        const values = [];
        
        if (fishCount && fishCount !== 0) {
            updates.push('total_fish = total_fish + ?');
            values.push(fishCount);
        }
        if (deathCount && deathCount !== 0) {
            updates.push('total_deaths = total_deaths + ?');
            values.push(deathCount);
        }
        if (jumpCount && jumpCount !== 0) {
            updates.push('total_jumps = total_jumps + ?');
            values.push(jumpCount);
        }
        if (itemCount && itemCount !== 0) {
            updates.push('items_collected = items_collected + ?');
            values.push(itemCount);
        }
        if (completedCount && completedCount !== 0) {
            updates.push('completed_levels = completed_levels + ?');
            values.push(completedCount);
        }
        if (playtimeSeconds && playtimeSeconds !== 0) {
            updates.push('total_playtime = total_playtime + ?');
            values.push(playtimeSeconds);
        }
        if (distance && distance !== 0) {
            updates.push('total_distance = total_distance + ?');
            values.push(distance);
        }
        
        if (updates.length === 0) {
            return res.json({ success: true, message: '无数据需要更新' });
        }
        
        values.push(userId);
        const query = `UPDATE player_stats SET ${updates.join(', ')} WHERE user_id = ?`;
        
        await pool.query(query, values);
        res.json({ success: true, message: '统计更新成功' });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: '服务器错误' });
    }
});

// ========== 更新关卡记录接口 ==========
app.post('/api/updateLevelRecord', async (req, res) => {
    const { userId, levelNumber, attempts, deaths, fishCollected, isFirstComplete, completeTime } = req.body;
    
    if (!userId || !levelNumber) {
        return res.json({ success: false, message: '缺少必要参数' });
    }
    
    try {
        // 检查是否已有记录
        const [existing] = await pool.query(
            'SELECT first_complete FROM level_records WHERE user_id = ? AND level_number = ?',
            [userId, levelNumber]
        );
        
        if (existing.length === 0) {
            return res.json({ success: false, message: '未找到关卡记录' });
        }
        
        // 构建更新语句
        const updates = [];
        const values = [];
        
        updates.push('attempts = attempts + ?');
        values.push(attempts);
        
        updates.push('deaths = deaths + ?');
        values.push(deaths);
        
        updates.push('fish_collected = fish_collected + ?');
        values.push(fishCollected);
        
        updates.push('last_play = NOW()');
        
        // 如果是首次通关且还没有记录首次时间
        if (isFirstComplete && !existing[0].first_complete) {
            updates.push('first_complete = ?');
            values.push(completeTime || new Date().toISOString().slice(0, 19).replace('T', ' '));
        }
        
        values.push(userId);
        values.push(levelNumber);
        
        const query = `UPDATE level_records SET ${updates.join(', ')} WHERE user_id = ? AND level_number = ?`;
        
        await pool.query(query, values);
        res.json({ success: true, message: '关卡记录更新成功' });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: '服务器错误' });
    }
});

// 启动服务器
app.listen(8080,'0.0.0.0',() => {
    console.log('服务器已启动：http://192.168.1.36:8080');
    console.log('可用接口：');
    console.log('  POST /api/register');
    console.log('  POST /api/login');
    console.log('  POST /api/upload');
    console.log('  POST /api/download');
    console.log('  POST /api/updateStatsBatch');
    console.log('  POST /api/updateLevelRecord');
});