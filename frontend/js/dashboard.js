// Techy Dashboard JavaScript
class TermuxDashboard {
    constructor() {
        this.autoRefresh = true;
        this.refreshInterval = null;
        this.chart = null;
        this.map = null;
        this.mapMarker = null;
        this.batteryHistory = [];
        this.systemHistory = [];
        this.isConnected = false;
        this.currentLocation = null;
        this.currentFolder = '~/storage/shared';
        this.init();
    }

// Global functions for file operations
async function downloadFile(filename) {
    try {
        const folder = window.dashboard.currentFolder;
        const url = `/api/files/download/${encodeURIComponent(filename)}?path=${encodeURIComponent(folder)}`;
        
        // Create temporary link and click it
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification(`💾 DOWNLOADING: ${filename.toUpperCase()}`, 'success');
    } catch (error) {
        showNotification(`❌ DOWNLOAD FAILED: ${error.message.toUpperCase()}`, 'error');
    }
}

async function getFileInfo(filename) {
    try {
        const folder = window.dashboard.currentFolder;
        const response = await fetch(`/api/files/info/${encodeURIComponent(filename)}?path=${encodeURIComponent(folder)}`);
        const result = await response.json();
        
        if (result.success) {
            showNotification(`ℹ️ FILE INFO: ${filename.toUpperCase()}`, 'info');
            console.log('File Info:', result.data);
        }
    } catch (error) {
        showNotification(`❌ INFO FAILED: ${error.message.toUpperCase()}`, 'error');
    }
}

async function capturePhoto() {
    try {
        const camera = confirm('📸 USE FRONT CAMERA?\n\nOK = Front Camera\nCancel = Back Camera') ? 1 : 0;
        
        showNotification(`📸 CAPTURING PHOTO WITH ${camera ? 'FRONT' : 'BACK'} CAMERA...`, 'info');
        
        const response = await fetch('/api/capture/photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ camera })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`📸 PHOTO CAPTURED: ${result.data.filename.toUpperCase()}`, 'success');
            
            // Refresh files after 2 seconds
            setTimeout(() => {
                if (window.dashboard) {
                    window.dashboard.loadFiles();
                }
            }, 2000);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showNotification(`❌ PHOTO CAPTURE FAILED: ${error.message.toUpperCase()}`, 'error');
    }
}

async function recordAudio() {
    try {
        const duration = prompt('🎤 RECORD DURATION (SECONDS):', '10');
        if (!duration || isNaN(duration)) return;
        
        const durationNum = parseInt(duration);
        if (durationNum < 1 || durationNum > 300) {
            showNotification('❌ DURATION MUST BE 1-300 SECONDS', 'error');
            return;
        }
        
        showNotification(`🎤 RECORDING AUDIO FOR ${durationNum} SECONDS...`, 'info');
        
        const response = await fetch('/api/capture/audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duration: durationNum })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`🎤 AUDIO RECORDED: ${result.data.filename.toUpperCase()}`, 'success');
            
            // Refresh files after recording
            setTimeout(() => {
                if (window.dashboard) {
                    window.dashboard.loadFiles();
                }
            }, (durationNum + 2) * 1000);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showNotification(`❌ AUDIO RECORDING FAILED: ${error.message.toUpperCase()}`, 'error');
    }
}

async function refreshFiles() {
    if (window.dashboard) {
        await window.dashboard.loadFiles();
        showNotification('📁 FILES REFRESHED', 'success');
    }
}

async function refreshLocation() {
    try {
        const response = await fetch('/api/status');
        const result = await response.json();
        
        if (result.success && result.data.location) {
            window.dashboard.updateMap(result.data.location);
            
            // Update location display
            const location = result.data.location;
            document.getElementById('location-lat').textContent = location.latitude?.toFixed(6) || '--';
            document.getElementById('location-lng').textContent = location.longitude?.toFixed(6) || '--';
            document.getElementById('location-accuracy').textContent = location.accuracy ? `${location.accuracy}M` : '--M';
            document.getElementById('location-provider').textContent = (location.provider || '--').toUpperCase();
            
            showNotification('📍 LOCATION REFRESHED', 'success');
        }
    } catch (error) {
        showNotification(`❌ LOCATION REFRESH FAILED: ${error.message.toUpperCase()}`, 'error');
    }
}

function toggleMapView() {
    const mapContainer = document.getElementById('map-container');
    const isHidden = mapContainer.style.display === 'none';
    
    if (isHidden) {
        mapContainer.style.display = 'block';
        showNotification('🗺️ MAP SHOWN', 'info');
        
        // Refresh map size after showing
        setTimeout(() => {
            if (window.dashboard && window.dashboard.map) {
                window.dashboard.map.invalidateSize();
            }
        }, 100);
    } else {
        mapContainer.style.display = 'none';
        showNotification('🗺️ MAP HIDDEN', 'info');
    }
}

// Enhanced service restart function with better UX
async function restartService(service) {
    const serviceNames = {
        'ssh': 'SSH SERVER',
        'tunnel': 'CLOUDFLARE TUNNEL', 
        'monitor': 'SMART MONITOR'
    };
    
    const serviceName = serviceNames[service] || service.toUpperCase();
    
    if (!confirm(`⚠️ RESTART ${serviceName}?\n\nThis will temporarily disconnect the service.`)) {
        return;
    }

    try {
        // Show loading state
        const statusEl = document.getElementById(`${service}-status`);
        if (statusEl) {
            const text = statusEl.querySelector('.status-text');
            const originalText = text.textContent;
            text.textContent = 'RESTARTING...';
            text.style.color = '#ff6b35';
        }

        const response = await fetch(`/api/restart/${service}`, { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Show success notification
            showNotification(`✅ ${serviceName} RESTARTED SUCCESSFULLY`, 'success');
            
            // Refresh data after 3 seconds
            setTimeout(() => {
                if (window.dashboard) {
                    window.dashboard.fetchData();
                }
            }, 3000);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showNotification(`❌ FAILED TO RESTART ${serviceName}: ${error.message.toUpperCase()}`, 'error');
        console.error('Restart error:', error);
    }
}

// Enhanced battery refresh function
async function refreshBattery() {
    try {
        const response = await fetch('/api/battery');
        const result = await response.json();
        
        if (result.success && window.dashboard) {
            window.dashboard.updateBattery(result.data);
            showNotification('🔋 BATTERY DATA REFRESHED', 'success');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showNotification(`❌ BATTERY REFRESH FAILED: ${error.message.toUpperCase()}`, 'error');
    }
}

// Enhanced logs refresh function
function refreshLogs() {
    if (window.dashboard) {
        window.dashboard.loadLogs();
        showNotification('📋 LOGS REFRESHED', 'success');
    }
}

// Enhanced notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notif => notif.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span class="notification-text">${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">✕</button>
    `;
    
    // Add notification styles if not exists
    if (!document.getElementById('notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 8px;
                color: white;
                font-weight: bold;
                font-family: 'JetBrains Mono', monospace;
                font-size: 0.9rem;
                letter-spacing: 1px;
                z-index: 1000;
                display: flex;
                align-items: center;
                gap: 15px;
                min-width: 300px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                backdrop-filter: blur(10px);
                animation: slideIn 0.3s ease-out;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            }
            
            .notification-success {
                background: linear-gradient(135deg, #00ff41, #00d4ff);
                color: #0a0f1c;
            }
            
            .notification-error {
                background: linear-gradient(135deg, #ff073a, #ff6b35);
            }
            
            .notification-info {
                background: linear-gradient(135deg, #00d4ff, #667eea);
                color: #0a0f1c;
            }
            
            .notification-close {
                background: none;
                border: none;
                color: inherit;
                cursor: pointer;
                font-size: 1.2rem;
                padding: 0;
                opacity: 0.7;
                transition: opacity 0.2s ease;
            }
            
            .notification-close:hover {
                opacity: 1;
            }
            
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

// Enhanced toggle chart function
function toggleChart(type) {
    if (window.dashboard) {
        window.dashboard.toggleChart(type);
        
        // Update button states
        const buttons = document.querySelectorAll('.chart-controls .btn');
        buttons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.textContent.toLowerCase().includes(type)) {
                btn.classList.add('active');
            }
        });
        
        showNotification(`📊 CHART SWITCHED TO ${type.toUpperCase()}`, 'info');
    }
}

// Add active button styles
const chartButtonStyles = document.createElement('style');
chartButtonStyles.textContent = `
    .chart-controls .btn.active {
        background: linear-gradient(135deg, var(--accent), var(--accent-secondary)) !important;
        color: var(--dark) !important;
        box-shadow: 0 0 20px var(--glow);
    }
`;
document.head.appendChild(chartButtonStyles);

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Add loading animation
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
    
    setTimeout(() => {
        document.body.style.opacity = '1';
        window.dashboard = new TermuxDashboard();
        showNotification('🚀 TERMUX MONITOR INITIALIZED', 'success');
    }, 100);
});

// Add some Easter eggs for fun
let konamiCode = [];
const konamiSequence = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]; // ↑↑↓↓←→←→BA

document.addEventListener('keydown', (e) => {
    konamiCode.push(e.keyCode);
    if (konamiCode.length > konamiSequence.length) {
        konamiCode.shift();
    }
    
    if (konamiCode.join(',') === konamiSequence.join(',')) {
        showNotification('🎮 KONAMI CODE ACTIVATED! HACKER MODE ON', 'success');
        document.documentElement.style.filter = 'hue-rotate(180deg)';
        setTimeout(() => {
            document.documentElement.style.filter = '';
        }, 5000);
        konamiCode = [];
    }
});

// Console welcome message
console.log(`
%c🚀 TERMUX MONITOR - TECHY EDITION v2.0
%cBuilt with ❤️ for Android enthusiasts
%c
Keyboard Shortcuts:
• Ctrl+R: Refresh data
• Space: Toggle auto-refresh  
• Ctrl+M: Toggle map view
• ↑↑↓↓←→←→BA: Secret mode

New Features:
🗺️ OpenStreetMap integration
📁 File browser with preview
📸 Remote photo capture
🎤 Remote audio recording
`, 
'color: #00d4ff; font-size: 20px; font-weight: bold;',
'color: #00ff41; font-size: 12px;',
'color: #c5d1de; font-size: 11px; font-family: monospace;'
);

    init() {
        this.setupEventListeners();
        this.initChart();
        this.initMap();
        this.fetchData();
        this.startAutoRefresh();
        this.loadLogs();
        this.loadFiles();
    }

    setupEventListeners() {
        document.getElementById('refresh-btn').addEventListener('click', () => this.fetchData());
        document.getElementById('auto-refresh-btn').addEventListener('click', () => this.toggleAutoRefresh());
        document.getElementById('log-type').addEventListener('change', () => this.loadLogs());
        document.getElementById('folder-select').addEventListener('change', (e) => {
            this.currentFolder = e.target.value;
            this.loadFiles();
        });
        
        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'r' && e.ctrlKey) {
                e.preventDefault();
                this.fetchData();
            }
            if (e.key === ' ') {
                e.preventDefault();
                this.toggleAutoRefresh();
            }
            if (e.key === 'm' && e.ctrlKey) {
                e.preventDefault();
                this.toggleMapView();
            }
        });
    }

    async fetchData() {
        try {
            this.updateConnectionStatus('connecting');
        async fetchData() {
        try {
            this.updateConnectionStatus('connecting');
            const response = await fetch('/api/status');
            const result = await response.json();

            if (result.success) {
                this.updateDashboard(result.data);
                this.updateConnectionStatus('connected');
                this.isConnected = true;
                this.addToHistory(result.data);
                this.updateChart();
                this.updateMap(result.data.location);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Fetch error:', error);
            this.updateConnectionStatus('disconnected');
            this.isConnected = false;
            this.showAlert(`CONNECTION FAILED: ${error.message.toUpperCase()}`);
        }
    }

    updateDashboard(data) {
        // Update battery with detailed function
        this.updateBattery(data.battery);
        
        // System metrics
        document.getElementById('system-uptime').textContent = data.uptime || '--';
        document.getElementById('system-load').textContent = data.system?.load_avg || '--';
        document.getElementById('memory-usage').textContent = data.memory?.usage_percent ? `${data.memory.usage_percent}%` : '--%';
        document.getElementById('storage-usage').textContent = data.storage?.usage_percent ? `${data.storage.usage_percent}%` : '--%';
        document.getElementById('processes-count').textContent = data.processes?.total || '--';
        document.getElementById('network-connections').textContent = data.network?.tcp_connections || '--';

        // Network info
        if (data.wifi) {
            document.getElementById('wifi-ssid').textContent = data.wifi.ssid || '--';
            document.getElementById('wifi-signal').textContent = data.wifi.rssi ? `${data.wifi.rssi}DBM` : '--DBM';
            document.getElementById('wifi-ip').textContent = data.wifi.ip || '--';
            document.getElementById('wifi-speed').textContent = data.wifi.link_speed_mbps ? `${data.wifi.link_speed_mbps}MBPS` : '--';
        }

        // Location info
        if (data.location) {
            document.getElementById('location-lat').textContent = data.location.latitude?.toFixed(6) || '--';
            document.getElementById('location-lng').textContent = data.location.longitude?.toFixed(6) || '--';
            document.getElementById('location-accuracy').textContent = data.location.accuracy ? `${data.location.accuracy}M` : '--M';
            document.getElementById('location-provider').textContent = (data.location.provider || '--').toUpperCase();
            
            // Store current location
            this.currentLocation = data.location;
        }

        // Services status
        this.updateServiceStatus('ssh', data.services?.ssh);
        this.updateServiceStatus('tunnel', data.services?.tunnel);
        this.updateServiceStatus('monitor', data.services?.smart_monitor);

        // Update timestamp
        const now = new Date();
        document.getElementById('last-update').innerHTML = `LAST UPDATE: ${now.toLocaleTimeString().toUpperCase()}`;
    }

    // Initialize OpenStreetMap with Leaflet
    initMap() {
        try {
            // Initialize map centered on Jakarta (default)
            this.map = L.map('location-map').setView([-6.2088, 106.8456], 13);
            
            // Add OpenStreetMap tile layer with dark theme
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap contributors'
            }).addTo(this.map);
            
            // Add custom marker icon
            const customIcon = L.divIcon({
                className: 'custom-marker',
                html: '<div style="background: #00d4ff; width: 20px; height: 20px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 20px #00d4ff;"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            
            console.log('🗺️ Map initialized successfully');
        } catch (error) {
            console.error('❌ Map initialization failed:', error);
        }
    }

    updateMap(location) {
        if (!this.map || !location || !location.latitude || !location.longitude) {
            return;
        }

        try {
            const lat = location.latitude;
            const lng = location.longitude;
            const accuracy = location.accuracy || 0;

            // Remove existing marker
            if (this.mapMarker) {
                this.map.removeLayer(this.mapMarker);
            }

            // Create custom marker
            const customIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background: linear-gradient(45deg, #00d4ff, #00ff41); width: 20px; height: 20px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 20px #00d4ff; animation: pulse 2s infinite;"></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            // Add new marker
            this.mapMarker = L.marker([lat, lng], { icon: customIcon }).addTo(this.map);
            
            // Add popup with location info
            this.mapMarker.bindPopup(`
                <div style="color: #c5d1de; font-family: 'JetBrains Mono', monospace; font-size: 0.9rem;">
                    <strong style="color: #00d4ff;">📍 CURRENT LOCATION</strong><br>
                    <strong>LAT:</strong> ${lat.toFixed(6)}<br>
                    <strong>LNG:</strong> ${lng.toFixed(6)}<br>
                    <strong>ACCURACY:</strong> ±${accuracy}m<br>
                    <strong>PROVIDER:</strong> ${(location.provider || 'UNKNOWN').toUpperCase()}<br>
                    <strong>TIME:</strong> ${new Date().toLocaleTimeString()}
                </div>
            `).openPopup();

            // Add accuracy circle if available
            if (accuracy > 0) {
                L.circle([lat, lng], {
                    radius: accuracy,
                    color: '#00d4ff',
                    fillColor: '#00d4ff',
                    fillOpacity: 0.1,
                    weight: 2
                }).addTo(this.map);
            }

            // Center map on location
            this.map.setView([lat, lng], 16);
            
            console.log(`🗺️ Map updated: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        } catch (error) {
            console.error('❌ Map update failed:', error);
        }
    }

    async loadFiles() {
        try {
            const response = await fetch(`/api/files?path=${encodeURIComponent(this.currentFolder)}`);
            const result = await response.json();

            if (result.success) {
                this.displayFiles(result.data);
                showNotification(`📁 FILES LOADED: ${result.data.totalFiles} ITEMS`, 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('File loading error:', error);
            document.getElementById('file-stats').textContent = `ERROR: ${error.message.toUpperCase()}`;
            document.getElementById('file-grid').innerHTML = '<div style="text-align: center; color: var(--danger); padding: 50px;">📁 NO FILES FOUND</div>';
        }
    }

    displayFiles(data) {
        const statsEl = document.getElementById('file-stats');
        const gridEl = document.getElementById('file-grid');

        // Update stats
        statsEl.innerHTML = `
            📂 ${data.currentPath.toUpperCase()} • 
            📄 ${data.totalFiles} FILES • 
            🕒 ${new Date().toLocaleTimeString()}
        `;

        // Clear grid
        gridEl.innerHTML = '';

        if (data.files.length === 0) {
            gridEl.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 50px; grid-column: 1 / -1;">📁 NO FILES FOUND</div>';
            return;
        }

        // Display files
        data.files.forEach(file => {
            const fileEl = document.createElement('div');
            fileEl.className = 'file-item';
            fileEl.onclick = () => this.openFile(file);

            const icon = this.getFileIcon(file.type);
            const sizeFormatted = this.formatFileSize(file.size);

            fileEl.innerHTML = `
                <div class="file-actions">
                    <button class="file-action-btn" onclick="event.stopPropagation(); downloadFile('${file.name}')">💾</button>
                    <button class="file-action-btn" onclick="event.stopPropagation(); getFileInfo('${file.name}')">ℹ️</button>
                </div>
                <div class="file-type-badge">${file.extension.toUpperCase() || 'FILE'}</div>
                <div class="file-icon ${file.type}">${icon}</div>
                <div class="file-name">${file.name}</div>
                <div class="file-details">
                    <div class="file-size">${sizeFormatted}</div>
                    <div class="file-date">${file.date}</div>
                </div>
            `;

            gridEl.appendChild(fileEl);
        });
    }

    getFileIcon(type) {
        const icons = {
            'image': '🖼️',
            'video': '🎬',
            'audio': '🎵',
            'text': '📄',
            'pdf': '📕',
            'file': '📄'
        };
        return icons[type] || '📄';
    }

    formatFileSize(sizeStr) {
        // Parse size string like "1.2M", "150K", "2.5G"
        if (!sizeStr || sizeStr === '-') return 'N/A';
        
        const match = sizeStr.match(/^(\d+\.?\d*)([KMGT]?)$/);
        if (!match) return sizeStr;
        
        const size = parseFloat(match[1]);
        const unit = match[2];
        
        const units = { '': 'B', 'K': 'KB', 'M': 'MB', 'G': 'GB', 'T': 'TB' };
        return `${size}${units[unit] || unit}`;
    }

    openFile(file) {
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'file-modal active';
        modal.innerHTML = `
            <div class="file-modal-content">
                <div class="file-modal-header">
                    <div class="file-modal-title">${file.name}</div>
                    <button class="file-modal-close" onclick="this.closest('.file-modal').remove()">✕</button>
                </div>
                <div class="file-modal-body">
                    ${this.getFilePreview(file)}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Close on escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    getFilePreview(file) {
        const downloadUrl = `/api/files/download/${encodeURIComponent(file.name)}?path=${encodeURIComponent(this.currentFolder)}`;
        
        switch (file.type) {
            case 'image':
                return `<img src="${downloadUrl}" alt="${file.name}" class="file-preview" />`;
            
            case 'video':
                return `
                    <video controls class="file-preview">
                        <source src="${downloadUrl}" type="video/mp4">
                        Your browser does not support video playback.
                    </video>
                `;
            
            case 'audio':
                return `
                    <div class="audio-player">
                        <audio controls style="width: 100%;">
                            <source src="${downloadUrl}" type="audio/mpeg">
                            Your browser does not support audio playback.
                        </audio>
                    </div>
                `;
            
            case 'text':
                // For text files, we'll fetch content
                fetch(downloadUrl)
                    .then(response => response.text())
                    .then(text => {
                        const preview = document.querySelector('.text-preview');
                        if (preview) {
                            preview.textContent = text.substring(0, 5000) + (text.length > 5000 ? '\n\n... (FILE TRUNCATED)' : '');
                        }
                    })
                    .catch(error => {
                        const preview = document.querySelector('.text-preview');
                        if (preview) {
                            preview.textContent = `ERROR LOADING FILE: ${error.message}`;
                        }
                    });
                
                return `<div class="text-preview">LOADING TEXT...</div>`;
            
            default:
                return `
                    <div style="text-align: center; padding: 50px;">
                        <div style="font-size: 4rem; margin-bottom: 20px;">${this.getFileIcon(file.type)}</div>
                        <div style="font-size: 1.2rem; margin-bottom: 10px; color: var(--accent);">${file.name}</div>
                        <div style="color: var(--muted); margin-bottom: 20px;">
                            ${file.type.toUpperCase()} FILE • ${this.formatFileSize(file.size)}
                        </div>
                        <a href="${downloadUrl}" download="${file.name}" class="btn btn-primary">
                            💾 DOWNLOAD FILE
                        </a>
                    </div>
                `;
        }
    }const response = await fetch('/api/status');
            const result = await response.json();

            if (result.success) {
                this.updateDashboard(result.data);
                this.updateConnectionStatus('connected');
                this.isConnected = true;
                this.addToHistory(result.data);
                this.updateChart();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Fetch error:', error);
            this.updateConnectionStatus('disconnected');
            this.isConnected = false;
            this.showAlert(`CONNECTION FAILED: ${error.message.toUpperCase()}`);
        }
    }

    updateDashboard(data) {
        // Update battery with detailed function
        this.updateBattery(data.battery);
        
        // System metrics
        document.getElementById('system-uptime').textContent = data.uptime || '--';
        document.getElementById('system-load').textContent = data.system?.load_avg || '--';
        document.getElementById('memory-usage').textContent = data.memory?.usage_percent ? `${data.memory.usage_percent}%` : '--%';
        document.getElementById('storage-usage').textContent = data.storage?.usage_percent ? `${data.storage.usage_percent}%` : '--%';
        document.getElementById('processes-count').textContent = data.processes?.total || '--';
        document.getElementById('network-connections').textContent = data.network?.tcp_connections || '--';

        // Network info
        if (data.wifi) {
            document.getElementById('wifi-ssid').textContent = data.wifi.ssid || '--';
            document.getElementById('wifi-signal').textContent = data.wifi.rssi ? `${data.wifi.rssi}DBM` : '--DBM';
            document.getElementById('wifi-ip').textContent = data.wifi.ip || '--';
            document.getElementById('wifi-speed').textContent = data.wifi.link_speed_mbps ? `${data.wifi.link_speed_mbps}MBPS` : '--';
        }

        // Location info
        if (data.location) {
            document.getElementById('location-lat').textContent = data.location.latitude?.toFixed(6) || '--';
            document.getElementById('location-lng').textContent = data.location.longitude?.toFixed(6) || '--';
            document.getElementById('location-accuracy').textContent = data.location.accuracy ? `${data.location.accuracy}M` : '--M';
            document.getElementById('location-provider').textContent = (data.location.provider || '--').toUpperCase();
        }

        // Services status
        this.updateServiceStatus('ssh', data.services?.ssh);
        this.updateServiceStatus('tunnel', data.services?.tunnel);
        this.updateServiceStatus('monitor', data.services?.smart_monitor);

        // Update timestamp
        const now = new Date();
        document.getElementById('last-update').innerHTML = `LAST UPDATE: ${now.toLocaleTimeString().toUpperCase()}`;
    }

    updateBattery(battery) {
        if (!battery) {
            this.setBatteryDefaults();
            return;
        }

        // Main display
        document.getElementById('battery-level').textContent = battery.percentage || '--';
        
        // Set battery level bar with color coding
        const levelBar = document.getElementById('battery-level-bar');
        const percentage = battery.percentage || 0;
        levelBar.style.setProperty('--battery-level', `${percentage}%`);
        
        // Status badge with enhanced styling
        const statusBadge = document.getElementById('battery-status-badge');
        statusBadge.textContent = (battery.status || 'UNKNOWN').toUpperCase();
        statusBadge.className = `status-badge ${(battery.status || '').toLowerCase()}`;
        
        // Plugged status
        document.getElementById('plugged-status').textContent = (battery.plugged || 'UNKNOWN').toUpperCase();
        
        // Charging icon with enhanced animation
        const chargingIcon = document.getElementById('charging-icon');
        chargingIcon.classList.toggle('hidden', !battery.is_charging);
        
        // Power details with enhanced formatting
        document.getElementById('battery-voltage').textContent = battery.voltage_v ? `${battery.voltage_v}V` : '--V';
        
        const currentEl = document.getElementById('battery-current');
        const currentValue = battery.current_ma || 0;
        currentEl.textContent = currentValue ? `${currentValue}MA` : '--MA';
        currentEl.className = `value current-value ${currentValue > 0 ? 'positive' : 'negative'}`;
        
        document.getElementById('battery-current-avg').textContent = battery.current_average ? `${battery.current_average}MA` : '--MA';
        document.getElementById('battery-capacity').textContent = battery.charge_counter_mah ? `${battery.charge_counter_mah}MAH` : '--MAH';
        
        // Environment with color coding
        const tempEl = document.getElementById('battery-temp');
        const tempValue = battery.temperature_c;
        tempEl.textContent = tempValue ? `${tempValue}°C` : '--°C';
        if (tempValue) {
            tempEl.className = `value temp-value ${tempValue > 40 ? 'hot' : tempValue > 35 ? 'warm' : 'cool'}`;
        }
        
        const healthEl = document.getElementById('battery-health');
        healthEl.textContent = (battery.health || '--').toUpperCase();
        healthEl.className = `value health-value ${(battery.health || '').toLowerCase()}`;
        
        document.getElementById('battery-tech').textContent = (battery.technology || '--').toUpperCase();
        document.getElementById('battery-cycles').textContent = battery.cycle || '--';
        
        // Statistics
        document.getElementById('battery-scale').textContent = battery.scale || '--';
        document.getElementById('battery-level-raw').textContent = battery.level || '--';
        document.getElementById('battery-present').textContent = battery.present ? 'YES' : 'NO';
        document.getElementById('battery-energy').textContent = battery.energy || 'N/A';
        
        // Status indicators with enhanced animations
        const chargingIndicator = document.getElementById('charging-indicator');
        chargingIndicator.className = `indicator-dot ${battery.is_charging ? 'active' : ''}`;
        document.getElementById('charging-text').textContent = battery.is_charging ? 'CHARGING' : 'NOT CHARGING';
        
        const pluggedIndicator = document.getElementById('plugged-indicator');
        pluggedIndicator.className = `indicator-dot ${battery.is_plugged ? 'active' : ''}`;
        document.getElementById('plugged-text').textContent = battery.is_plugged ? 'PLUGGED IN' : 'UNPLUGGED';
        
        // Enhanced power draw calculation
        const powerDraw = battery.voltage_v && battery.current_ma ? 
            (battery.voltage_v * Math.abs(battery.current_ma) / 1000).toFixed(2) : '--';
        const powerEl = document.getElementById('power-draw');
        powerEl.textContent = powerDraw !== '--' ? `${powerDraw}W` : '--W';
        if (powerDraw !== '--') {
            const power = parseFloat(powerDraw);
            powerEl.className = `value power-value ${power > 15 ? 'high' : power > 8 ? 'medium' : 'low'}`;
        }
        
        // Enhanced time estimates
        this.calculateTimeEstimates(battery);
    }

    calculateTimeEstimates(battery) {
        if (!battery.current_ma || !battery.charge_counter_mah) {
            document.getElementById('time-to-full').textContent = '--';
            document.getElementById('time-remaining').textContent = '--';
            return;
        }

        if (battery.is_charging && battery.current_ma > 0) {
            const remainingCapacity = battery.charge_counter_mah - (battery.charge_counter_mah * battery.percentage / 100);
            const timeToFull = (remainingCapacity / battery.current_ma).toFixed(1);
            document.getElementById('time-to-full').textContent = `${timeToFull}H`;
        } else {
            document.getElementById('time-to-full').textContent = '--';
        }
        
        if (!battery.is_charging && battery.current_ma < 0) {
            const usedCapacity = (battery.charge_counter_mah * battery.percentage / 100);
            const timeRemaining = (usedCapacity / Math.abs(battery.current_ma)).toFixed(1);
            document.getElementById('time-remaining').textContent = `${timeRemaining}H`;
        } else {
            document.getElementById('time-remaining').textContent = '--';
        }
    }

    setBatteryDefaults() {
        const elements = [
            'battery-level', 'battery-voltage', 'battery-current', 'battery-current-avg',
            'battery-capacity', 'battery-temp', 'battery-health', 'battery-tech',
            'battery-cycles', 'battery-scale', 'battery-level-raw', 'battery-present',
            'battery-energy', 'power-draw', 'time-to-full', 'time-remaining'
        ];
        
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '--';
        });
        
        document.getElementById('battery-status-badge').textContent = 'UNKNOWN';
        document.getElementById('plugged-status').textContent = 'UNKNOWN';
        document.getElementById('charging-text').textContent = 'UNKNOWN';
        document.getElementById('plugged-text').textContent = 'UNKNOWN';
    }

    updateServiceStatus(service, isRunning) {
        const statusEl = document.getElementById(`${service}-status`);
        if (!statusEl) return;
        
        const dot = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('.status-text');

        dot.className = `status-dot ${isRunning ? 'online' : 'offline'}`;
        text.textContent = isRunning ? 'RUNNING' : 'STOPPED';
    }

    updateConnectionStatus(status) {
        const statusEl = document.getElementById('connection-status');
        const dot = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('span:last-child');

        dot.className = `status-dot ${status === 'connected' ? 'online' : 'offline'}`;
        
        const statusText = {
            'connecting': 'CONNECTING...',
            'connected': 'CONNECTED',
            'disconnected': 'DISCONNECTED'
        };

        text.textContent = statusText[status] || status.toUpperCase();
    }

    showAlert(message) {
        const banner = document.getElementById('alert-banner');
        banner.textContent = message;
        banner.classList.remove('hidden');
        
        // Auto-hide after 8 seconds
        setTimeout(() => {
            banner.classList.add('hidden');
        }, 8000);
    }

    toggleAutoRefresh() {
        this.autoRefresh = !this.autoRefresh;
        const btn = document.getElementById('auto-refresh-btn');
        const statusEl = document.getElementById('auto-refresh-status');
        
        if (this.autoRefresh) {
            btn.textContent = '⏸️ AUTO';
            btn.style.background = 'linear-gradient(135deg, #00ff41, #00d4ff)';
            this.startAutoRefresh();
            
            // Update status indicator
            statusEl.innerHTML = '<span class="status-dot online"></span><span>AUTO: ON</span>';
            showNotification('▶️ AUTO-REFRESH ENABLED (30S)', 'success');
        } else {
            btn.textContent = '▶️ AUTO';
            btn.style.background = 'linear-gradient(135deg, var(--secondary), var(--primary))';
            this.stopAutoRefresh();
            
            // Update status indicator
            statusEl.innerHTML = '<span class="status-dot offline"></span><span>AUTO: OFF</span>';
            showNotification('⏸️ AUTO-REFRESH DISABLED', 'info');
        }
    }

    showAlert(message) {
        showNotification(message, 'error');
    }

    startAutoRefresh() {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        this.refreshInterval = setInterval(() => {
            console.log('🔄 Auto-refresh triggered...');
            this.fetchData();
        }, 30000); // 30 seconds
        console.log('✅ Auto-refresh started (30s interval)');
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            console.log('⏸️ Auto-refresh stopped');
        }
    }

    async loadLogs() {
        const type = document.getElementById('log-type').value;
        const logContent = document.getElementById('log-content');
        
        try {
            logContent.textContent = 'LOADING LOGS...';
            const response = await fetch(`/api/logs/${type}`);
            const result = await response.json();
            
            if (result.success) {
                const logs = result.data.logs.join('\n');
                logContent.textContent = logs || 'NO LOGS AVAILABLE';
                
                // Auto-scroll to bottom
                logContent.scrollTop = logContent.scrollHeight;
            } else {
                logContent.textContent = `ERROR: ${result.error.toUpperCase()}`;
            }
        } catch (error) {
            logContent.textContent = `ERROR LOADING LOGS: ${error.message.toUpperCase()}`;
        }
    }

    addToHistory(data) {
        const timestamp = new Date();
        
        // Battery history
        if (data.battery) {
            this.batteryHistory.push({
                time: timestamp,
                percentage: data.battery.percentage || 0,
                voltage: data.battery.voltage_v || 0,
                current: data.battery.current_ma || 0,
                temperature: data.battery.temperature_c || 0
            });
        }
        
        // System history
        this.systemHistory.push({
            time: timestamp,
            memory: data.memory?.usage_percent || 0,
            storage: data.storage?.usage_percent || 0,
            processes: data.processes?.total || 0,
            connections: data.network?.tcp_connections || 0
        });
        
        // Keep last 50 data points
        if (this.batteryHistory.length > 50) this.batteryHistory.shift();
        if (this.systemHistory.length > 50) this.systemHistory.shift();
    }

    initChart() {
        const ctx = document.getElementById('performance-chart');
        if (!ctx) return;
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'BATTERY %',
                        data: [],
                        borderColor: '#00d4ff',
                        backgroundColor: 'rgba(0, 212, 255, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'MEMORY %',
                        data: [],
                        borderColor: '#00ff41',
                        backgroundColor: 'rgba(0, 255, 65, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#c5d1de',
                            font: {
                                family: 'JetBrains Mono',
                                weight: 'bold'
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'minute',
                            displayFormats: {
                                minute: 'HH:mm'
                            }
                        },
                        grid: {
                            color: '#2a3441'
                        },
                        ticks: {
                            color: '#7a8b99',
                            font: {
                                family: 'JetBrains Mono'
                            }
                        }
                    },
                    y: {
                        min: 0,
                        max: 100,
                        grid: {
                            color: '#2a3441'
                        },
                        ticks: {
                            color: '#7a8b99',
                            font: {
                                family: 'JetBrains Mono'
                            }
                        }
                    }
                },
                elements: {
                    point: {
                        radius: 3,
                        hoverRadius: 6
                    }
                }
            }
        });
    }

    updateChart() {
        if (!this.chart || this.batteryHistory.length === 0) return;
        
        this.chart.data.datasets[0].data = this.batteryHistory.map(point => ({
            x: point.time,
            y: point.percentage
        }));
        
        this.chart.data.datasets[1].data = this.systemHistory.map(point => ({
            x: point.time,
            y: point.memory
        }));
        
        this.chart.update('none');
    }

    toggleChart(type) {
        if (!this.chart) return;
        
        const datasets = this.chart.data.datasets;
        
        if (type === 'battery') {
            // Show battery metrics
            datasets[0].data = this.batteryHistory.map(point => ({
                x: point.time,
                y: point.percentage
            }));
            datasets[0].label = 'BATTERY %';
            datasets[0].borderColor = '#00d4ff';
            
            if (datasets[1]) {
                datasets[1].data = this.batteryHistory.map(point => ({
                    x: point.time,
                    y: point.temperature
                }));
                datasets[1].label = 'TEMPERATURE °C';
                datasets[1].borderColor = '#ff6b35';
            }
        } else if (type === 'system') {
            // Show system metrics
            datasets[0].data = this.systemHistory.map(point => ({
                x: point.time,
                y: point.memory
            }));
            datasets[0].label = 'MEMORY %';
            datasets[0].borderColor = '#00ff41';
            
            if (datasets[1]) {
                datasets[1].data = this.systemHistory.map(point => ({
                    x: point.time,
                    y: point.storage
                }));
                datasets[1].label = 'STORAGE %';
                datasets[1].borderColor = '#00d4ff';
            }
        }
        
        this.chart.update();
    }
}

// Enhanced service restart function with better UX
async function restartService(service) {
    const serviceNames = {
        'ssh': 'SSH SERVER',
        'tunnel': 'CLOUDFLARE TUNNEL', 
        'monitor': 'SMART MONITOR'
    };
    
    const serviceName = serviceNames[service] || service.toUpperCase();
    
    if (!confirm(`⚠️ RESTART ${serviceName}?\n\nThis will temporarily disconnect the service.`)) {
        return;
    }

    try {
        // Show loading state
        const statusEl = document.getElementById(`${service}-status`);
        if (statusEl) {
            const text = statusEl.querySelector('.status-text');
            const originalText = text.textContent;
            text.textContent = 'RESTARTING...';
            text.style.color = '#ff6b35';
        }

        const response = await fetch(`/api/restart/${service}`, { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Show success notification
            showNotification(`✅ ${serviceName} RESTARTED SUCCESSFULLY`, 'success');
            
            // Refresh data after 3 seconds
            setTimeout(() => {
                if (window.dashboard) {
                    window.dashboard.fetchData();
                }
            }, 3000);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showNotification(`❌ FAILED TO RESTART ${serviceName}: ${error.message.toUpperCase()}`, 'error');
        console.error('Restart error:', error);
    }
}

// Enhanced battery refresh function
async function refreshBattery() {
    try {
        const response = await fetch('/api/battery');
        const result = await response.json();
        
        if (result.success && window.dashboard) {
            window.dashboard.updateBattery(result.data);
            showNotification('🔋 BATTERY DATA REFRESHED', 'success');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showNotification(`❌ BATTERY REFRESH FAILED: ${error.message.toUpperCase()}`, 'error');
    }
}

// Enhanced logs refresh function
function refreshLogs() {
    if (window.dashboard) {
        window.dashboard.loadLogs();
        showNotification('📋 LOGS REFRESHED', 'success');
    }
}

// Enhanced notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notif => notif.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span class="notification-text">${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">✕</button>
    `;
    
    // Add notification styles if not exists
    if (!document.getElementById('notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 8px;
                color: white;
                font-weight: bold;
                font-family: 'JetBrains Mono', monospace;
                font-size: 0.9rem;
                letter-spacing: 1px;
                z-index: 1000;
                display: flex;
                align-items: center;
                gap: 15px;
                min-width: 300px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                backdrop-filter: blur(10px);
                animation: slideIn 0.3s ease-out;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            }
            
            .notification-success {
                background: linear-gradient(135deg, #00ff41, #00d4ff);
                color: #0a0f1c;
            }
            
            .notification-error {
                background: linear-gradient(135deg, #ff073a, #ff6b35);
            }
            
            .notification-info {
                background: linear-gradient(135deg, #00d4ff, #667eea);
                color: #0a0f1c;
            }
            
            .notification-close {
                background: none;
                border: none;
                color: inherit;
                cursor: pointer;
                font-size: 1.2rem;
                padding: 0;
                opacity: 0.7;
                transition: opacity 0.2s ease;
            }
            
            .notification-close:hover {
                opacity: 1;
            }
            
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

// Enhanced toggle chart function
function toggleChart(type) {
    if (window.dashboard) {
        window.dashboard.toggleChart(type);
        
        // Update button states
        const buttons = document.querySelectorAll('.chart-controls .btn');
        buttons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.textContent.toLowerCase().includes(type)) {
                btn.classList.add('active');
            }
        });
        
        showNotification(`📊 CHART SWITCHED TO ${type.toUpperCase()}`, 'info');
    }
}

// Add active button styles
const chartButtonStyles = document.createElement('style');
chartButtonStyles.textContent = `
    .chart-controls .btn.active {
        background: linear-gradient(135deg, var(--accent), var(--accent-secondary)) !important;
        color: var(--dark) !important;
        box-shadow: 0 0 20px var(--glow);
    }
`;
document.head.appendChild(chartButtonStyles);

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Add loading animation
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
    
    setTimeout(() => {
        document.body.style.opacity = '1';
        window.dashboard = new TermuxDashboard();
        showNotification('🚀 TERMUX MONITOR INITIALIZED', 'success');
    }, 100);
});

// Add some Easter eggs for fun
let konamiCode = [];
const konamiSequence = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]; // ↑↑↓↓←→←→BA

document.addEventListener('keydown', (e) => {
    konamiCode.push(e.keyCode);
    if (konamiCode.length > konamiSequence.length) {
        konamiCode.shift();
    }
    
    if (konamiCode.join(',') === konamiSequence.join(',')) {
        showNotification('🎮 KONAMI CODE ACTIVATED! HACKER MODE ON', 'success');
        document.documentElement.style.filter = 'hue-rotate(180deg)';
        setTimeout(() => {
            document.documentElement.style.filter = '';
        }, 5000);
        konamiCode = [];
    }
});

// Console welcome message
console.log(`
%c🚀 TERMUX MONITOR - TECHY EDITION
%cBuilt with ❤️ for Android enthusiasts
%c
Keyboard Shortcuts:
• Ctrl+R: Refresh data
• Space: Toggle auto-refresh
• ↑↑↓↓←→←→BA: Secret mode
`, 
'color: #00d4ff; font-size: 20px; font-weight: bold;',
'color: #00ff41; font-size: 12px;',
'color: #c5d1de; font-size: 11px; font-family: monospace;'
);