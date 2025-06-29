#!/data/data/com.termux/files/usr/bin/bash

# System Data Collector
# Returns clean JSON with system information

# Helper function to get memory usage percentage
get_memory_usage() {
    if command -v free >/dev/null 2>&1; then
        free | grep Mem | awk '{printf "%.0f", ($3/$2)*100}'
    else
        echo "0"
    fi
}

# Helper function to get storage usage
get_storage_usage() {
    df -h "$HOME" | tail -1 | awk '{print $5}' | sed 's/%//'
}

# Get WiFi info with timeout
get_wifi_info() {
    timeout 3 termux-wifi-connectioninfo 2>/dev/null || echo '{
        "ssid": null,
        "bssid": null,
        "rssi": null,
        "link_speed": null,
        "ip": null,
        "supplicant_state": "DISCONNECTED"
    }'
}

# Get location info with timeout
get_location_info() {
    timeout 5 termux-location -p network 2>/dev/null || echo '{
        "latitude": null,
        "longitude": null,
        "accuracy": null,
        "provider": "unavailable"
    }'
}

# Build JSON response
cat << EOF
{
    "timestamp": "$(date -Iseconds)",
    "hostname": "$(hostname)",
    "uptime": "$(uptime -p)",
    "system": {
        "load_avg": "$(uptime | awk -F'load average:' '{print $2}' | xargs)",
        "users": $(ps aux | grep -v grep | grep -c bash || echo 1),
        "boot_time": "$(uptime -s 2>/dev/null || echo 'unknown')",
        "architecture": "$(uname -m)",
        "kernel": "$(uname -r)"
    },
    "memory": {
        "total": "$(free -h | grep Mem | awk '{print $2}' 2>/dev/null || echo 'N/A')",
        "used": "$(free -h | grep Mem | awk '{print $3}' 2>/dev/null || echo 'N/A')",
        "free": "$(free -h | grep Mem | awk '{print $4}' 2>/dev/null || echo 'N/A')",
        "usage_percent": $(get_memory_usage)
    },
    "storage": {
        "home_total": "$(df -h $HOME | tail -1 | awk '{print $2}')",
        "home_used": "$(df -h $HOME | tail -1 | awk '{print $3}')",
        "home_free": "$(df -h $HOME | tail -1 | awk '{print $4}')",
        "usage_percent": $(get_storage_usage)
    },
    "network": {
        "tcp_connections": $(netstat -tn 2>/dev/null | grep ESTABLISHED | wc -l),
        "listening_ports": $(netstat -tln 2>/dev/null | grep LISTEN | wc -l),
        "internet_connectivity": $(ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1 && echo 'true' || echo 'false')
    },
    "processes": {
        "total": $(ps aux | wc -l),
        "running": $(ps aux | awk '$8 ~ /^R/ { count++ } END { print count+0 }'),
        "sleeping": $(ps aux | awk '$8 ~ /^S/ { count++ } END { print count+0 }')
    },
    "services": {
        "ssh": $(pgrep sshd >/dev/null && echo 'true' || echo 'false'),
        "tunnel": $(pgrep -f cloudflared >/dev/null && echo 'true' || echo 'false'),
        "smart_monitor": $(pgrep -f smart-tunnel >/dev/null && echo 'true' || echo 'false'),
        "ssh_pid": $(SSH_PID=$(pgrep sshd | head -1); echo ${SSH_PID:-null}),
        "tunnel_pid": $(TUNNEL_PID=$(pgrep -f cloudflared | head -1); echo ${TUNNEL_PID:-null}),
        "monitor_pid": $(MONITOR_PID=$(pgrep -f smart-tunnel | head -1); echo ${MONITOR_PID:-null})
    },
    "wifi": $(get_wifi_info),
    "location": $(get_location_info),
    "device": {
        "model": "$(getprop ro.product.model 2>/dev/null || echo 'unknown')",
        "brand": "$(getprop ro.product.brand 2>/dev/null || echo 'unknown')",
        "android_version": "$(getprop ro.build.version.release 2>/dev/null || echo 'unknown')",
        "cpu_cores": $(nproc 2>/dev/null || echo 1)
    },
    "termux": {
        "prefix": "$PREFIX",
        "packages_installed": $(dpkg -l 2>/dev/null | wc -l),
        "storage_permission": $([ -d ~/storage ] && echo 'true' || echo 'false'),
        "api_available": $(command -v termux-battery-status >/dev/null && echo 'true' || echo 'false')
    }
}
EOF
