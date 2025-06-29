#!/data/data/com.termux/files/usr/bin/bash

# Main Data Collector
# Combines all collectors into single response

# Check if jq is available
if ! command -v jq >/dev/null 2>&1; then
    echo '{
        "error": "jq not installed",
        "message": "Please install jq: pkg install jq",
        "timestamp": "'$(date -Iseconds)'"
    }'
    exit 1
fi

# Collect battery data
BATTERY_DATA=$(./battery-collector.sh 2>/dev/null)
if [ $? -ne 0 ]; then
    BATTERY_DATA='{"error": "Battery collection failed"}'
fi

# Collect system data
SYSTEM_DATA=$(./system-collector.sh 2>/dev/null)
if [ $? -ne 0 ]; then
    SYSTEM_DATA='{"error": "System collection failed"}'
fi

# Combine data using jq
echo "$SYSTEM_DATA" | jq --argjson battery "$BATTERY_DATA" '. + {"battery": $battery}'