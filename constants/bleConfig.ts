/**
 * BLE Configuration Constants
 * All BLE-related UUIDs and commands are defined here
 */

export const BLE_CONFIG = {
  // Service and Characteristic UUIDs
  SERVICE_UUID: "21111998-0717-1718-1807-0717183699ms",
  CHARACTERISTIC_UUID: "msvk2111-1199-0717-1718-msvkab211111",

  // Connection timeout in milliseconds
  CONNECT_TIMEOUT: 10000,
  SERVICE_DISCOVERY_TIMEOUT: 8000,
  SCAN_TIMEOUT: 1000,
  CONNECTION_CHECK_DELAY: 3000,

  // MTU Request value for Android
  MTU_SIZE: 512,
} as const;

/**
 * BLE Commands mapped to their encoded values
 * These commands are sent as Base64 encoded strings to the device
 */
export const BLE_COMMANDS = {
  // Off/Power commands
  OFF: "L",
  TURN_OFF: "L",

  // Percentage commands
  PERCENT_25: "K",
  PERCENT_50: "Z",
  PERCENT_75: "P",
  PERCENT_100: "E",

  // Pole movement commands
  POLE_UP: "L",
  POLE_DOWN: "T",
} as const;

/**
 * Toast message timeouts and styles
 */
export const TOAST_CONFIG = {
  DURATION: 3000,
  COLORS: {
    success: "#4CAF50",
    error: "#F44336",
    warning: "#FF9800",
    info: "#2196F3",
  },
  TEXT_COLOR: "#010101",
} as const;
