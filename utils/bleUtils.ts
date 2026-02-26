/**
 * BLE Utility Functions
 * Helper functions for BLE operations
 */

import { BLE_CONFIG } from "@/constants/bleConfig";

/**
 * Wraps a promise with a timeout
 * @param promise - Promise to wrap
 * @param ms - Timeout duration in milliseconds
 * @param timeoutMessage - Custom timeout error message
 * @returns Promise that rejects if it takes longer than ms
 */
export const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string = "Operation timeout",
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), ms),
    ),
  ]);
};

/**
 * Validates if a string is valid Base64
 * @param str - String to validate
 * @returns true if valid Base64, false otherwise
 */
export const isValidBase64 = (str: string): boolean => {
  try {
    // Try to decode the Base64 string
    atob(str);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Validates BLE UUIDs format
 * @param uuid - UUID to validate
 * @returns true if valid UUID format, false otherwise
 */
export const isValidUUID = (uuid: string): boolean => {
  // Standard UUID format: 8-4-4-4-12 hex digits
  const uuidRegex =
    /^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * Validates if the current BLE configuration is valid
 * @returns object with validation result and error messages
 */
export const validateBLEConfig = (): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  // Check Service UUID
  if (!BLE_CONFIG.SERVICE_UUID) {
    errors.push("Service UUID is not configured");
  } else if (!isValidUUID(BLE_CONFIG.SERVICE_UUID)) {
    errors.push(`Service UUID format is invalid: ${BLE_CONFIG.SERVICE_UUID}`);
  }

  // Check Characteristic UUID
  if (!BLE_CONFIG.CHARACTERISTIC_UUID) {
    errors.push("Characteristic UUID is not configured");
  } else if (!isValidUUID(BLE_CONFIG.CHARACTERISTIC_UUID)) {
    errors.push(
      `Characteristic UUID format is invalid: ${BLE_CONFIG.CHARACTERISTIC_UUID}`,
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Checks if a value is a GATT-related error
 * @param error - Error object
 * @returns true if error is GATT-related
 */
export const isGATTError = (error: any): boolean => {
  const errorMessage = String(error?.message || "");
  return (
    errorMessage.includes("GATT") ||
    errorMessage.includes("gatt") ||
    errorMessage.includes("disconnected") ||
    errorMessage.includes("Disconnected")
  );
};

/**
 * Gets a human-readable error message from BLE error
 * @param error - Error object
 * @returns Formatted error message
 */
export const formatBLEError = (error: any): string => {
  if (!error) return "Unknown error occurred";

  const message = error?.message || String(error);

  if (isGATTError(error)) {
    return "Device disconnected or not responding (GATT error)";
  }

  if (message.includes("timeout")) {
    return "Operation timeout - device may be out of range";
  }

  if (message.includes("already connecting")) {
    return "Already attempting to connect to this device";
  }

  return message || "Unknown error occurred";
};
