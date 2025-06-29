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
echo "🔋 Collecting battery data..." >&2
BATTERY_DATA=$(./battery-collector.sh 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$BATTERY_DATA" ]; then
    BATTERY_DATA='{"error": "Battery collection failed", "percentage": null}'
fi

# Validate battery JSON
echo "$BATTERY_DATA" | jq . >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Battery JSON invalid" >&2
    BATTERY_DATA='{"error": "Invalid battery JSON", "percentage": null}'
fi

# Collect system data
echo "💻 Collecting system data..." >&2
SYSTEM_DATA=$(./system-collector.sh 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$SYSTEM_DATA" ]; then
    echo "❌ System collection failed" >&2
    SYSTEM_DATA='{"error": "System collection failed", "timestamp": "'$(date -Iseconds)'"}'
fi

# Validate system JSON
echo "$SYSTEM_DATA" | jq . >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ System JSON invalid" >&2
    SYSTEM_DATA='{"error": "Invalid system JSON", "timestamp": "'$(date -Iseconds)'"}'
fi

# Debug output
echo "🐛 Battery data length: $(echo "$BATTERY_DATA" | wc -c)" >&2
echo "🐛 System data length: $(echo "$SYSTEM_DATA" | wc -c)" >&2

# Combine data using jq
echo "🔧 Combining data..." >&2
RESULT=$(echo "$SYSTEM_DATA" | jq --argjson battery "$BATTERY_DATA" '. + {"battery": $battery}' 2>/dev/null)

if [ $? -eq 0 ] && [ -n "$RESULT" ]; then
    echo "$RESULT"
else
    echo "❌ Failed to combine data" >&2
    echo '{
        "error": "Data combination failed",
        "timestamp": "'$(date -Iseconds)'",
        "battery": '$BATTERY_DATA',
        "system": '$SYSTEM_DATA'
    }'
fi
