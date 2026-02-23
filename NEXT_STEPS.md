# Next Steps & Future Enhancements

## 🔍 First Steps: Verify Everything Works

### 1. **Check UUIDs** (CRITICAL!)

Your current UUIDs in `constants/bleConfig.ts` don't look valid. Standard UUIDs should be:

```
Format: 8-4-4-4-12 hex digits
Example: "6e400001-b5a3-f393-e0a9-e50e24dcca9e"

Your UUIDs:
❌ "21111998-0717-1718-1807-0717183699ms"  (ends with 'ms' not hex!)
❌ "msvk2111-1199-0717-1718-msvkab211111"  (starts with 'msvk'!)
```

**ACTION:** Verify with your device documentation or Nordic nRF app:

```bash
# Search your device's BLE specs or datasheet for:
# - Service UUID
# - Characteristic UUID
```

Then update `constants/bleConfig.ts`:

```typescript
export const BLE_CONFIG = {
  SERVICE_UUID: "YOUR_ACTUAL_UUID_HERE",
  CHARACTERISTIC_UUID: "YOUR_ACTUAL_CHAR_UUID_HERE",
  // ...
};
```

---

### 2. **Test Connection Flow**

Test each scenario sequentially:

```typescript
// 1. Basic connection test
- Turn on Bluetooth
- Click "Connect"
- Select device
- Verify connected state

// 2. Command sending test
- Once connected, click percentage buttons
- Verify device responds

// 3. Race condition test
- Click "Connect" multiple times rapidly
- App should show "Connection in progress" message
- Should not crash or create duplicate connections

// 4. Out-of-range test
- Connect to device
- Move device out of Bluetooth range
- Verify timeout handling
- Should show appropriate error message

// 5. Device re-connection test
- Connect → Disconnect
- Reconnect
- Should work smoothly
```

---

## 🚀 Recommended Enhancements (Priority Order)

### Phase 1: Stability (Do First)

These enhance reliability and user experience.

#### 1.1 **Auto-Reconnection Logic**

```typescript
// hooks/useBLEAutoReconnect.ts
export const useBLEAutoReconnect = (
  connectedDevice: Device | null,
  btConnectionState: boolean,
) => {
  const reconnectAttempts = useRef(0);
  const maxAttempts = 3;
  const backoffDelayRef = useRef(1000);

  const attemptReconnect = async () => {
    if (reconnectAttempts.current >= maxAttempts) {
      showToastMessage("Max reconnection attempts reached", "error");
      return;
    }

    reconnectAttempts.current++;
    backoffDelayRef.current *= 2; // Exponential backoff: 1s, 2s, 4s

    await new Promise((resolve) =>
      setTimeout(resolve, backoffDelayRef.current),
    );

    // Attempt reconnection
    if (connectedDevice) {
      await connectToBTDevice(connectedDevice);
    }
  };

  return { attemptReconnect, reconnectAttempts };
};
```

#### 1.2 **Device Disconnection Monitoring**

```typescript
// Add to useEffect that sets up BT state listener
useEffect(() => {
  const manager = getManager();
  let disconnectionSubscription: any;

  if (connectedDevice) {
    disconnectionSubscription = connectedDevice.onDisconnected(
      (error, device) => {
        console.warn("Device disconnected:", error);
        setBtConnectionState(false);
        showToastMessage(
          "Device disconnected. Attempting to reconnect...",
          "warning",
        );
        // Trigger auto-reconnect
        attemptReconnect();
      },
    );
  }

  return () => {
    disconnectionSubscription?.remove();
  };
}, [connectedDevice]);
```

#### 1.3 **Connection State Persistence**

```typescript
// hooks/useBLEConnectionPersistence.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

export const useBLEConnectionPersistence = () => {
  const saveLastDevice = async (device: Device) => {
    try {
      await AsyncStorage.setItem(
        "@last_ble_device",
        JSON.stringify({
          id: device.id,
          name: device.name,
          timestamp: Date.now(),
        }),
      );
    } catch (error) {
      console.error("Failed to save device:", error);
    }
  };

  const getLastDevice = async (): Promise<{
    id: string;
    name: string;
  } | null> => {
    try {
      const stored = await AsyncStorage.getItem("@last_ble_device");
      if (stored) {
        const device = JSON.parse(stored);
        // Only return if saved within last 7 days
        if (Date.now() - device.timestamp < 7 * 24 * 60 * 60 * 1000) {
          return { id: device.id, name: device.name };
        }
      }
    } catch (error) {
      console.error("Failed to retrieve device:", error);
    }
    return null;
  };

  return { saveLastDevice, getLastDevice };
};
```

---

### Phase 2: Features (Then Add)

These add functionality and polish.

#### 2.1 **Device Scanning with Filters**

```typescript
// Filter by device name or service UUID during scan
const handleStartScanFiltered = async (deviceNameFilter?: string) => {
  const manager = getManager();

  manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
    if (error) return;

    // Filter by name if provided
    if (
      deviceNameFilter &&
      !device.name?.toLowerCase().includes(deviceNameFilter.toLowerCase())
    ) {
      return; // Skip this device
    }

    if (device) {
      setScannedDevices((prev) => {
        if (!prev.some((d) => d.id === device.id)) {
          return [
            ...prev,
            Object.assign(device, {
              displayName: device.localName || device.name || device.id,
            }) as DeviceWithDisplayName,
          ];
        }
        return prev;
      });
    }
  });
};
```

#### 2.2 **Device RSSI Strength Indicator**

```typescript
// Show signal strength in UI
const getRSSIStrength = (
  rssi: number,
): "excellent" | "good" | "fair" | "poor" => {
  if (rssi > -50) return "excellent";
  if (rssi > -70) return "good";
  if (rssi > -85) return "fair";
  return "poor";
};

const getRSSIColor = (rssi: number): string => {
  const strength = getRSSIStrength(rssi);
  return {
    excellent: "#4CAF50",
    good: "#8BC34A",
    fair: "#FF9800",
    poor: "#F44336",
  }[strength];
};
```

#### 2.3 **Command History & Logging**

```typescript
// utils/bleLogger.ts
export interface BLELog {
  timestamp: string;
  command: string;
  deviceId: string;
  success: boolean;
  error?: string;
}

export class BLELogger {
  private logs: BLELog[] = [];

  addLog(log: Omit<BLELog, "timestamp">) {
    this.logs.push({
      ...log,
      timestamp: new Date().toISOString(),
    });
    // Keep only last 100 logs
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(-100);
    }
  }

  getLogs(): BLELog[] {
    return this.logs;
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  clearLogs() {
    this.logs = [];
  }
}

// Usage in app:
const bleLogger = new BLELogger();

// In sendBLECommand:
try {
  // command sending...
  bleLogger.addLog({
    command: displayLabel,
    deviceId: connectedDevice.id,
    success: true,
  });
} catch (error) {
  bleLogger.addLog({
    command: displayLabel,
    deviceId: connectedDevice.id,
    success: false,
    error: String(error),
  });
}
```

---

### Phase 3: Advanced (Polish Later)

These add advanced functionality.

#### 3.1 **Background Service for Monitoring**

```typescript
// For keeping connection alive in background
import BackgroundTimer from "react-native-background-timer";

const useBackgroundBLEMonitor = (connectedDevice: Device | null) => {
  useEffect(() => {
    let backgroundTaskId: NodeJS.Timer | null = null;

    if (connectedDevice) {
      backgroundTaskId = BackgroundTimer.setInterval(async () => {
        const manager = getManager();
        try {
          const isConnected = await manager.isDeviceConnected(
            connectedDevice.id,
          );
          if (!isConnected) {
            console.warn("Background: Lost connection");
            // Trigger reconnect
          }
        } catch (error) {
          console.error("Background check failed:", error);
        }
      }, 5000); // Check every 5 seconds
    }

    return () => {
      if (backgroundTaskId) {
        BackgroundTimer.clearInterval(backgroundTaskId);
      }
    };
  }, [connectedDevice]);
};
```

#### 3.2 **Real-time Characteristic Monitoring**

```typescript
// Listen to device notifications
const monitorCharacteristic = async (device: Device) => {
  try {
    const manager = getManager();
    const services = await device.services();
    const service = services.find((s) => s.uuid === BLE_CONFIG.SERVICE_UUID);

    if (service) {
      const characteristics = await service.characteristics();
      const characteristic = characteristics.find(
        (c) => c.uuid === BLE_CONFIG.CHARACTERISTIC_UUID,
      );

      if (characteristic && characteristic.isNotifiable) {
        characteristic.monitor((error, char) => {
          if (error) {
            console.error("Monitor error:", error);
            return;
          }
          console.log("Received data:", char?.value);
          // Handle incoming data from device
        });
      }
    }
  } catch (error) {
    console.error("Monitor setup failed:", error);
  }
};
```

#### 3.3 **OTA (Over-The-Air) Update Support**

```typescript
// For device firmware updates
export const useBLEOTA = () => {
  const sendFirmwareUpdate = async (
    device: Device,
    firmwareData: Uint8Array,
    onProgress: (progress: number) => void,
  ) => {
    const chunkSize = 20; // Max BLE write size
    const totalChunks = Math.ceil(firmwareData.length / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, firmwareData.length);
      const chunk = firmwareData.slice(start, end);

      // Send chunk to device
      // ... implementation ...

      // Report progress
      onProgress(((i + 1) / totalChunks) * 100);
    }
  };

  return { sendFirmwareUpdate };
};
```

---

## 📱 Testing & Deployment

### Unit Tests to Add

```typescript
// __tests__/bleUtils.test.ts
describe("BLE Utilities", () => {
  test("withTimeout rejects after timeout", async () => {
    const slowPromise = new Promise((resolve) =>
      setTimeout(() => resolve("slow"), 10000),
    );

    await expect(withTimeout(slowPromise, 1000)).rejects.toThrow(
      "Operation timeout",
    );
  });

  test("isValidBase64 validates correctly", () => {
    expect(isValidBase64(btoa("test"))).toBe(true);
    expect(isValidBase64("invalid!!!")).toBe(false);
  });

  test("isValidUUID validates UUID format", () => {
    expect(isValidUUID("6e400001-b5a3-f393-e0a9-e50e24dcca9e")).toBe(true);
    expect(isValidUUID("invalid-uuid")).toBe(false);
  });

  test("isGATTError detects GATT errors", () => {
    expect(isGATTError(new Error("GATT error"))).toBe(true);
    expect(isGATTError(new Error("timeout"))).toBe(false);
  });
});
```

### Manual Testing Checklist

- [ ] Android 11 (API 30) - Permissions
- [ ] Android 12 (API 31) - Permissions
- [ ] Android 13 (API 33) - Permissions
- [ ] iOS 13+ - All features
- [ ] Low battery mode - Connection stability
- [ ] WiFi + BLE concurrent - No conflicts
- [ ] Device out of range - Proper error handling
- [ ] Rapid button clicks - Race condition prevention
- [ ] App backgrounding - Connection persistence
- [ ] Device reboot - Auto-reconnection

---

## 📚 Dependencies to Consider Adding

```json
{
  "dependencies": {
    "react-native-async-storage": "^1.19.0",
    "react-native-background-timer": "^2.4.1"
  },
  "devDependencies": {
    "@testing-library/react-native": "^12.0.0",
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0"
  }
}
```

---

## 🔗 Helpful Resources

1. **Nordic nRF Connect App** - Test BLE devices directly
   - Scan devices
   - Read characteristics
   - Verify UUIDs

2. **React Native BLE PLX Documentation**
   - https://github.com/dotintent/react-native-ble-plx

3. **ESP32 BLE Documentation**
   - https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/bluetooth/

4. **Bluetooth SIG Services**
   - https://www.bluetooth.com/specifications/gatt/services/

---

## 🎯 Final Recommendations

### Do's ✅

- ✅ Validate UUIDs first (CRITICAL!)
- ✅ Test on real devices (not just emulator)
- ✅ Add unit tests before Phase 2
- ✅ Handle all error scenarios
- ✅ Keep logs for debugging

### Don'ts ❌

- ❌ Don't skip UUID validation
- ❌ Don't assume emulator = real device
- ❌ Don't ignore GATT errors
- ❌ Don't forget cleanup in useEffect
- ❌ Don't create global BleManager

---

## 💬 Support

If you encounter issues:

1. **Check UUID format first** - 90% of BLE issues are wrong UUIDs
2. **Use nRF Connect to verify** - Confirm device exposes the correct UUIDs
3. **Check device firmware** - Ensure device firmware matches expected protocol
4. **Review console logs** - All errors are logged with context
5. **Test on real device** - Emulator/simulator behavior differs

---

Good luck with your BLE project! 🚀
