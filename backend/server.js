const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const cors = require('cors');
const fs = require('fs').promises;
const mime = require('mime-types');
const os = require('os');

const app = express();
const PORT = 8099;

// Configuration with fixed path
const SSH_CONFIG = {
    host: 'termux.meltedcloud.cloud',
    user: 'u0_a393',
    keyPath: os.homedir() + '/.ssh/termux_monitoring_key', // Fixed path expansion
    proxyCommand: 'cloudflared access ssh --hostname termux.meltedcloud.cloud'
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Cache
let lastData = null;
let lastUpdate = null;

// Enhanced SSH Command Executor with better error handling
const executeSSH = (command) => {
    return new Promise((resolve, reject) => {
        const sshCmd = `ssh -i "${SSH_CONFIG.keyPath}" -o ProxyCommand="${SSH_CONFIG.proxyCommand}" -o ConnectTimeout=15 -o StrictHostKeyChecking=no ${SSH_CONFIG.user}@${SSH_CONFIG.host} "${command}"`;
        
        console.log(`🔧 Executing: ${command}`);
        console.log(`🔗 Using key: ${SSH_CONFIG.keyPath}`);
        
        exec(sshCmd, { timeout: 30000 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ SSH Error: ${error.message}`);
                console.error(`❌ Error Code: ${error.code}`);
                if (stderr) console.error(`❌ Stderr: ${stderr}`);
                reject(new Error(`SSH connection failed: ${error.message}`));
                return;
            }
            
            if (stderr && stderr.trim()) {
                console.warn(`⚠️  SSH Warning: ${stderr}`);
            }
            
            console.log(`✅ SSH Success, output length: ${stdout.length}`);
            if (stdout.length < 100) {
                console.log(`📤 Output preview: ${stdout}`);
            } else {
                console.log(`📤 Output preview: ${stdout.substring(0, 200)}...`);
            }
            
            resolve(stdout.trim());
        });
    });
};

// SSH File Transfer (download file from Termux)
const downloadFileFromTermux = (remotePath) => {
    return new Promise((resolve, reject) => {
        const scpCmd = `scp -i "${SSH_CONFIG.keyPath}" -o ProxyCommand="${SSH_CONFIG.proxyCommand}" -o ConnectTimeout=15 -o StrictHostKeyChecking=no ${SSH_CONFIG.user}@${SSH_CONFIG.host}:"${remotePath}" /tmp/`;
        
        console.log(`📥 Downloading: ${remotePath}`);
        
        exec(scpCmd, { timeout: 60000 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ SCP Error: ${error.message}`);
                reject(new Error(`File download failed: ${error.message}`));
                return;
            }
            
            const localPath = `/tmp/${path.basename(remotePath)}`;
            resolve(localPath);
        });
    });
};

// Enhanced Data Collection with better error handling
const collectData = async () => {
    try {
        console.log('🔄 Collecting data from Termux...');
        
        const result = await executeSSH('./main-collector.sh');
        
        // Validate JSON before parsing
        if (!result || result.length === 0) {
            throw new Error('Empty response from Termux');
        }
        
        // Find JSON boundaries
        const jsonStart = result.indexOf('{');
        const jsonEnd = result.lastIndexOf('}') + 1;
        
        if (jsonStart === -1 || jsonEnd === 0) {
            console.error('❌ No valid JSON found in response');
            console.error('📄 Raw response:', result);
            throw new Error('No valid JSON found in response');
        }
        
        const cleanJson = result.substring(jsonStart, jsonEnd);
        console.log(`🧹 Extracted JSON length: ${cleanJson.length}`);
        
        // Parse JSON response
        let data;
        try {
            data = JSON.parse(cleanJson);
        } catch (parseError) {
            console.error('❌ JSON Parse Error:', parseError.message);
            console.error('📄 JSON content:', cleanJson.substring(0, 500));
            throw new Error(`JSON parsing failed: ${parseError.message}`);
        }
        
        // Add server metadata
        data.server_timestamp = new Date().toISOString();
        data.connection_status = 'connected';
        data.collection_duration = Date.now() - Date.now(); // Will be updated by client
        
        lastData = data;
        lastUpdate = new Date();
        
        console.log('✅ Data collected successfully');
        return data;
        
    } catch (error) {
        console.error('❌ Collection failed:', error.message);
        
        return {
            timestamp: new Date().toISOString(),
            server_timestamp: new Date().toISOString(),
            connection_status: 'disconnected',
            error: error.message,
            last_success: lastUpdate ? lastUpdate.toISOString() : null,
            cached_data: lastData,
            // Basic fallback data structure
            battery: null,
            system: null,
            services: { ssh: false, tunnel: false, smart_monitor: false },
            wifi: null,
            location: null
        };
    }
};

// Debug endpoint
app.get('/api/debug', async (req, res) => {
    const fsSync = require('fs');
    
    try {
        const keyExists = fsSync.existsSync(SSH_CONFIG.keyPath);
        const keyStats = keyExists ? fsSync.statSync(SSH_CONFIG.keyPath) : null;
        
        // Test cloudflared availability
        const cloudflaredTest = await new Promise(resolve => {
            exec('which cloudflared', (error, stdout) => {
                resolve({ available: !error, path: stdout.trim() });
            });
        });
        
        res.json({
            success: true,
            debug: {
                server_info: {
                    node_version: process.version,
                    platform: os.platform(),
                    arch: os.arch(),
                    uptime: process.uptime()
                },
                ssh_config: {
                    host: SSH_CONFIG.host,
                    user: SSH_CONFIG.user,
                    key_path: SSH_CONFIG.keyPath,
                    key_exists: keyExists,
                    key_permissions: keyStats ? keyStats.mode.toString(8) : null,
                    key_size: keyStats ? keyStats.size : null
                },
                cloudflared: cloudflaredTest,
                last_update: lastUpdate ? lastUpdate.toISOString() : null,
                cache_status: lastData ? 'available' : 'empty'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test SSH connection endpoint
app.get('/api/test-ssh', async (req, res) => {
    try {
        console.log('🧪 Testing SSH connection...');
        const result = await executeSSH('echo "SSH Test: $(date)"');
        
        res.json({
            success: true,
            message: 'SSH connection successful',
            data: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            ssh_config: {
                host: SSH_CONFIG.host,
                user: SSH_CONFIG.user,
                key_path: SSH_CONFIG.keyPath
            }
        });
    }
});

// Main API Routes
app.get('/api/status', async (req, res) => {
    try {
        const data = await collectData();
        res.json({
            success: data.connection_status === 'connected',
            data: data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/api/battery', async (req, res) => {
    try {
        const result = await executeSSH('./battery-collector.sh');
        const batteryData = JSON.parse(result);
        
        res.json({
            success: true,
            data: batteryData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/system', async (req, res) => {
    try {
        const result = await executeSSH('./system-collector.sh');
        const systemData = JSON.parse(result);
        
        res.json({
            success: true,
            data: systemData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// File Browser API
app.get('/api/files', async (req, res) => {
    try {
        const folder = req.query.path || '~/storage/shared';
        console.log(`📁 Browsing folder: ${folder}`);
        
        const listCommand = `find "${folder}" -maxdepth 1 -type f -exec ls -la {} + 2>/dev/null | head -100`;
        const result = await executeSSH(listCommand);
        
        const files = [];
        const lines = result.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 9) {
                const permissions = parts[0];
                const size = parts[4];
                const date = `${parts[5]} ${parts[6]} ${parts[7]}`;
                const name = parts.slice(8).join(' ');
                const fullPath = path.posix.join(folder, path.basename(name));
                
                // Get file type
                const ext = path.extname(name).toLowerCase();
                let fileType = 'file';
                if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
                    fileType = 'image';
                } else if (['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext)) {
                    fileType = 'video';
                } else if (['.mp3', '.wav', '.ogg', '.m4a', '.aac'].includes(ext)) {
                    fileType = 'audio';
                } else if (['.txt', '.log', '.md', '.json', '.xml'].includes(ext)) {
                    fileType = 'text';
                } else if (['.pdf'].includes(ext)) {
                    fileType = 'pdf';
                }
                
                files.push({
                    name: path.basename(name),
                    fullPath: fullPath,
                    size: size,
                    date: date,
                    permissions: permissions,
                    type: fileType,
                    extension: ext
                });
            }
        }
        
        // Get folder info
        const folderInfo = await executeSSH(`ls -la "${folder}" | head -1`).catch(() => 'Unknown');
        
        console.log(`📁 Found ${files.length} files in ${folder}`);
        
        res.json({
            success: true,
            data: {
                currentPath: folder,
                files: files.sort((a, b) => b.date.localeCompare(a.date)),
                totalFiles: files.length,
                folderInfo: folderInfo
            }
        });
    } catch (error) {
        console.error('📁 File browser error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get file content/download
app.get('/api/files/download/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const folder = req.query.path || '~/storage/shared';
        const remotePath = path.posix.join(folder, filename);
        
        console.log(`📥 Download request: ${filename} from ${folder}`);
        
        // Download file to local temp
        const localPath = await downloadFileFromTermux(remotePath);
        
        // Send file
        const mimeType = mime.lookup(filename) || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        
        const fileData = await fs.readFile(localPath);
        res.send(fileData);
        
        // Cleanup temp file
        setTimeout(() => {
            fs.unlink(localPath).catch(console.error);
        }, 5000);
        
        console.log(`📥 Download successful: ${filename}`);
        
    } catch (error) {
        console.error(`📥 Download failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get file info
app.get('/api/files/info/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const folder = req.query.path || '~/storage/shared';
        const remotePath = path.posix.join(folder, filename);
        
        const fileInfo = await executeSSH(`file "${remotePath}" && stat "${remotePath}"`);
        
        res.json({
            success: true,
            data: {
                filename: filename,
                path: remotePath,
                info: fileInfo
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Capture photo via Termux API
app.post('/api/capture/photo', async (req, res) => {
    try {
        const camera = req.body.camera || 0; // 0 = back, 1 = front
        const filename = `photo_${Date.now()}.jpg`;
        const remotePath = `~/storage/shared/${filename}`;
        
        console.log(`📸 Capturing photo with camera ${camera}`);
        
        await executeSSH(`termux-camera-photo -c ${camera} "${remotePath}"`);
        
        res.json({
            success: true,
            data: {
                filename: filename,
                path: remotePath,
                camera: camera,
                message: 'Photo captured successfully'
            }
        });
        
        console.log(`📸 Photo captured: ${filename}`);
    } catch (error) {
        console.error(`📸 Photo capture failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Record audio via Termux API
app.post('/api/capture/audio', async (req, res) => {
    try {
        const duration = req.body.duration || 10; // seconds
        const filename = `audio_${Date.now()}.mp3`;
        const remotePath = `~/storage/shared/${filename}`;
        
        console.log(`🎤 Recording audio for ${duration} seconds`);
        
        await executeSSH(`termux-microphone-record -d ${duration} -f "${remotePath}"`);
        
        res.json({
            success: true,
            data: {
                filename: filename,
                path: remotePath,
                duration: duration,
                message: 'Audio recorded successfully'
            }
        });
        
        console.log(`🎤 Audio recorded: ${filename}`);
    } catch (error) {
        console.error(`🎤 Audio recording failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Logs API
app.get('/api/logs/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const lines = req.query.lines || 50;
        
        const logFiles = {
            'boot': '~/boot.log',
            'tunnel': '~/smart-tunnel.log',
            'auto': '~/tunnel-auto.log'
        };
        
        const logFile = logFiles[type] || logFiles['boot'];
        const result = await executeSSH(`tail -${lines} ${logFile} 2>/dev/null || echo "Log file not found"`);
        
        res.json({
            success: true,
            data: {
                logs: result.split('\n'),
                type: type,
                lines: lines
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Service restart API
app.post('/api/restart/:service', async (req, res) => {
    try {
        const { service } = req.params;
        
        const commands = {
            'ssh': 'pkill sshd; sleep 2; sshd',
            'tunnel': 'pkill cloudflared; sleep 2; nohup cloudflared tunnel run termux-ssh > ~/tunnel-manual.log 2>&1 &',
            'monitor': 'pkill -f smart-tunnel; sleep 2; nohup bash ~/smart-tunnel.sh &'
        };
        
        const command = commands[service];
        if (!command) {
            return res.status(400).json({
                success: false,
                error: 'Invalid service name'
            });
        }
        
        console.log(`🔧 Restarting service: ${service}`);
        await executeSSH(command);
        
        res.json({
            success: true,
            message: `${service} service restarted successfully`
        });
        
        console.log(`✅ Service restarted: ${service}`);
    } catch (error) {
        console.error(`❌ Service restart failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check API
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        last_data_update: lastUpdate ? lastUpdate.toISOString() : null,
        connection_status: lastData?.connection_status || 'unknown',
        timestamp: new Date().toISOString()
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('🚨 Server Error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        requested_path: req.path
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    process.exit(0);
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Termux Monitoring API Server v2.0`);
    console.log(`📡 API: http://localhost:${PORT}/api/status`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`🔧 Health: http://localhost:${PORT}/api/health`);
    console.log(`🐛 Debug: http://localhost:${PORT}/api/debug`);
    console.log(`🧪 SSH Test: http://localhost:${PORT}/api/test-ssh`);
    console.log(`\n📋 Available Endpoints:`);
    console.log(`   GET  /api/status     - Complete device data`);
    console.log(`   GET  /api/battery    - Battery data only`);
    console.log(`   GET  /api/system     - System data only`);
    console.log(`   GET  /api/files      - File browser`);
    console.log(`   GET  /api/files/download/:filename - Download file`);
    console.log(`   POST /api/capture/photo - Take photo`);
    console.log(`   POST /api/capture/audio - Record audio`);
    console.log(`   GET  /api/logs/:type - Log files`);
    console.log(`   POST /api/restart/:service - Restart services`);
    console.log(`   GET  /api/health     - API health check`);
    console.log(`   GET  /api/debug      - Debug information`);
    console.log(`   GET  /api/test-ssh   - Test SSH connection`);
    console.log(`\n⚙️  SSH Config: ${SSH_CONFIG.user}@${SSH_CONFIG.host}`);
    console.log(`🔑 SSH Key: ${SSH_CONFIG.keyPath}`);
    console.log(`\n🔄 Auto data collection ready...`);
});