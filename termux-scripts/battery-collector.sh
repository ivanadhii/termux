#!/data/data/com.termux/files/usr/bin/bash

# Battery Data Collector
# Returns clean JSON with battery information

# Get battery data with timeout
BATTERY_DATA=$(timeout 5 termux-battery-status 2>/dev/null)

if [ $? -eq 0 ] && [ -n "$BATTERY_DATA" ]; then
    # Battery data available, parse and enhance
    echo "$BATTERY_DATA" | jq '. + {
        "timestamp": now | strftime("%Y-%m-%dT%H:%M:%S%z"),
        "voltage_v": (.voltage / 1000 | . * 100 | round / 100),
        "current_ma": (.current / 1000 | round),
        "charge_counter_mah": (.charge_counter / 1000 | round),
        "is_charging": (.current > 0),
        "is_plugged": (.plugged != "UNPLUGGED"),
        "temperature_c": (.temperature | . * 10 | round / 10)
    }'
else
    # Fallback when battery API not available
    echo '{
        "timestamp": "'$(date -Iseconds)'",
        "present": false,
        "percentage": null,
        "status": "UNKNOWN",
        "health": "UNKNOWN",
        "plugged": "UNKNOWN",
        "temperature": null,
        "voltage": null,
        "current": null,
        "current_average": null,
        "charge_counter": null,
        "technology": null,
        "voltage_v": null,
        "current_ma": null,
        "charge_counter_mah": null,
        "is_charging": false,
        "is_plugged": false,
        "temperature_c": null,
        "error": "Battery API not available"
    }'
fi
