/**
 * Custom hook to handle BLE permissions across different Android versions
 * iOS handles permissions automatically
 */

import { PermissionsAndroid, Platform } from "react-native";

export const useBLEPermissions = () => {
  /**
   * Request BLE permissions based on Android version
   * iOS returns true (handles permissions automatically)
   * Android <31 (11): Requests ACCESS_FINE_LOCATION
   * Android >=31 (12+): Requests BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION
   */
  const requestBluetoothPermission = async (): Promise<boolean> => {
    try {
      // iOS handles permissions automatically on scan
      if (Platform.OS === "ios") {
        return true;
      }

      if (Platform.OS === "android") {
        const apiLevel = Platform.Version as number;

        // Android 11 and below need Location
        if (apiLevel < 31) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }

        // Android 12+ permissions
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        return (
          result["android.permission.BLUETOOTH_SCAN"] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          result["android.permission.BLUETOOTH_CONNECT"] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          result["android.permission.ACCESS_FINE_LOCATION"] ===
            PermissionsAndroid.RESULTS.GRANTED
        );
      }

      return false;
    } catch (error) {
      console.error("Permission request failed:", error);
      return false;
    }
  };

  /**
   * Check if BLUETOOTH_CONNECT permission is granted
   * Only relevant for Android 12+
   */
  const checkBluetoothConnectPermission = async (): Promise<boolean> => {
    try {
      if (Platform.OS === "ios") return true;

      const apiLevel = Platform.Version as number;
      if (apiLevel < 31) return true;

      const hasConnect = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );

      if (!hasConnect) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }

      return true;
    } catch (error) {
      console.error("Bluetooth Connect permission check failed:", error);
      return false;
    }
  };

  return {
    requestBluetoothPermission,
    checkBluetoothConnectPermission,
  };
};
