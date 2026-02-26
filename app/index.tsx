import { BLE_COMMANDS, BLE_CONFIG, TOAST_CONFIG } from "@/constants/bleConfig";
import { testID } from "@/constants/testId";
import { useBLEPermissions } from "@/hooks/useBLEPermissions";
import {
  formatBLEError,
  isGATTError,
  isValidBase64,
  validateBLEConfig,
  withTimeout,
} from "@/utils/bleUtils";
import { encode as btoa } from "base-64";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BleManager, Device, State } from "react-native-ble-plx";
import { showToast } from "react-native-nitro-toast";

type DeviceWithDisplayName = Device & { displayName: string };

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Prevent auto hide; swallow errors to avoid unhandled rejection at module load
SplashScreen.preventAutoHideAsync().catch(() => {});

const Index = () => {
  // BLE Manager instance - tied to component lifecycle
  const bleManagerRef = useRef<BleManager | null>(null);

  // Connection lock to prevent race conditions
  const isConnectingRef = useRef<boolean>(false);

  // State hooks
  const [scannedDevices, setScannedDevices] = useState<DeviceWithDisplayName[]>(
    [],
  );
  const [btState, setBtState] = useState<State>(State.Unknown);
  const [btConnectionState, setBtConnectionState] = useState<boolean>(false);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [percentUsed, setPercentUsed] = useState<string>("");
  const [poleUsed, setPoleUsed] = useState<string>("");
  const [offUsed, setOffUsed] = useState<string>("");
  const [appIsReady, setAppIsReady] = useState(false);

  // Timer and lifecycle refs
  const scanTimeoutRef = useRef<any>(null);
  const checkConnTimeoutRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);

  // Get permission handler
  const { requestBluetoothPermission, checkBluetoothConnectPermission } =
    useBLEPermissions();

  // Helper function to get BLE Manager instance
  const getManager = (): BleManager => {
    if (!bleManagerRef.current) {
      bleManagerRef.current = new BleManager();
    }
    return bleManagerRef.current;
  };

  // Memoized state clearing function
  const clearStateData = useCallback(() => {
    setScannedDevices([]);
    setBtConnectionState(false);
    setConnectedDevice(null);
    setModalVisible(false);
    setIsLoading(false);
    setLoadingMessage("");
    setPercentUsed("");
    setPoleUsed("");
    setOffUsed("");
  }, []);

  const checkConnection = async (): Promise<Device | null> => {
    if (isMountedRef.current) setIsLoading(true);
    const manager = getManager();

    try {
      // Check if previously connected device is still connected
      if (connectedDevice) {
        try {
          const isConnected = await manager.isDeviceConnected(
            connectedDevice.id,
          );
          if (isConnected) {
            if (isMountedRef.current) setBtConnectionState(true);
            if (isMountedRef.current) {
              setIsLoading(false);
              setLoadingMessage("");
            }
            return connectedDevice;
          }
        } catch (e) {
          // Device no longer connected
          if (isMountedRef.current) setConnectedDevice(null);
        }
      }

      // Check scanned devices
      for (const dev of scannedDevices) {
        try {
          const isConnected = await manager.isDeviceConnected(dev.id);
          if (isConnected) {
            if (isMountedRef.current) {
              setConnectedDevice(dev);
              setBtConnectionState(true);
              setIsLoading(false);
              setLoadingMessage("");
            }
            return dev;
          }
        } catch {
          // Continue to next device
        }
      }

      // Try to find devices with known service UUIDs
      if (BLE_CONFIG.SERVICE_UUID) {
        try {
          const connected = await manager.connectedDevices([
            BLE_CONFIG.SERVICE_UUID,
          ]);
          if (connected && connected.length > 0) {
            const dev = connected[0];
            if (isMountedRef.current) {
              setConnectedDevice(dev as DeviceWithDisplayName);
              setBtConnectionState(true);
              setIsLoading(false);
              setLoadingMessage("");
            }
            return dev;
          }
        } catch (e) {
          console.warn("Error querying connected devices:", e);
        }
      }

      // No connected device found
      if (isMountedRef.current) {
        setBtConnectionState(false);
        setIsLoading(false);
        setLoadingMessage("");
      }
      return null;
    } catch (error) {
      showToastMessage("Error checking connection status", "error");
      if (isMountedRef.current) {
        setIsLoading(false);
        setLoadingMessage("");
      }
      return null;
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Request BLE permissions first
        await requestBluetoothPermission();

        // Validate BLE configuration
        const configValidation = validateBLEConfig();
        if (!configValidation.isValid) {
          console.warn("BLE Configuration errors:", configValidation.errors);
          // Don't fail completely, but notify user
          if (configValidation.errors.length > 0) {
            showToastMessage(
              "BLE Configuration issue: " + configValidation.errors[0],
              "warning",
            );
          }
        }

        const manager = getManager();

        // Check if Bluetooth is already powered on
        const currentState = await manager.state();
        if (currentState === State.PoweredOn) {
          await handleStartScan();
          // Run connection check after scan
          checkConnTimeoutRef.current = setTimeout(checkConnection, 2000);
        }

        // Increase Splash Screen time
        await SplashScreen.hideAsync();
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            if (isMountedRef.current) {
              setAppIsReady(true);
            }
            resolve();
          }, 1500);
        });
      } catch (error) {
        console.warn("App initialization error:", error);
        if (isMountedRef.current) {
          setAppIsReady(true); // Show UI anyway
        }
      }
    };

    initializeApp();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const initBTStateListener = async () => {
      const manager = getManager();
      let subscription: any = null;

      try {
        setIsLoading(true);
        setLoadingMessage("Initializing Bluetooth...");

        subscription = manager.onStateChange((state) => {
          setBtState(state);

          if (state === State.PoweredOn) {
            // Bluetooth turned on - start scanning
            handleStartScan();
            checkConnTimeoutRef.current = setTimeout(checkConnection, 2000);
          } else {
            // Bluetooth turned off or powering down
            try {
              manager.stopDeviceScan();
            } catch (e) {
              // ignore
            }
            if (isMountedRef.current) {
              setScannedDevices([]);
              setIsLoading(false);
              setLoadingMessage("");
            }
          }
        }, true);

        return () => {
          if (subscription) subscription.remove();
        };
      } catch (error) {
        console.error("BLE state listener error:", error);
        if (isMountedRef.current) {
          setIsLoading(false);
          setLoadingMessage("");
        }
      }
    };

    const cleanup = initBTStateListener();

    return () => {
      const manager = getManager();
      try {
        manager.stopDeviceScan();
      } catch (e) {
        // ignore
      }

      // Clear timeouts
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      if (checkConnTimeoutRef.current) {
        clearTimeout(checkConnTimeoutRef.current);
        checkConnTimeoutRef.current = null;
      }

      // Remove subscription when component unmounts
      cleanup?.then((cleanupFn) => cleanupFn?.());

      isMountedRef.current = false;
    };
  }, []);

  const showToastMessage = (
    message: string,
    type: "success" | "error" | "warning" | "info",
    title?: string,
    position?: "top" | "bottom",
  ) => {
    const bgColor = TOAST_CONFIG.COLORS[type];

    showToast(message, {
      type: type,
      position: position || "top",
      duration: TOAST_CONFIG.DURATION,
      title: title || "",
      backgroundColor: bgColor,
      messageColor: TOAST_CONFIG.TEXT_COLOR,
      haptics: true,
    });
  };

  const handleStartScan = async () => {
    if (isMountedRef.current) setScannedDevices([]);
    if (isMountedRef.current) {
      setIsLoading(true);
      setLoadingMessage("Scanning for BLE devices...");
    }

    const manager = getManager();

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.warn("Scan error:", error.message);
        if (isMountedRef.current) {
          setIsLoading(false);
          setLoadingMessage("");
        }
        return;
      }

      if (device && isMountedRef.current) {
        const displayName =
          device.localName || device.name || `Unnamed (${device.id})`;

        setScannedDevices((prev) => {
          // Avoid duplicates
          if (!prev.some((d) => d.id === device.id)) {
            return [
              ...prev,
              Object.assign(device, { displayName }) as DeviceWithDisplayName,
            ];
          }
          return prev;
        });
      }
    });

    // Set scan timeout
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    scanTimeoutRef.current = setTimeout(stopScan, BLE_CONFIG.SCAN_TIMEOUT);

    // Stop loading immediately
    if (isMountedRef.current) {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };

  const stopScan = () => {
    const manager = getManager();
    try {
      manager.stopDeviceScan();
    } catch (e) {
      console.warn("Error stopping scan:", e);
    }
  };

  const connectToBtDevice = async () => {
    if (btState === State.PoweredOn) {
      await handleStartScan();
      setModalVisible(true);
    } else {
      showToastMessage(
        "Please turn on Bluetooth to connect to devices.",
        "warning",
      );
    }
  };

  const connectToBTDevice = async (device: Device) => {
    // Prevent duplicate connection attempts
    if (isConnectingRef.current) {
      showToastMessage("Connection in progress, please wait...", "warning");
      return;
    }

    try {
      // Validate device
      if (!device || !device.id) {
        showToastMessage("Invalid device selected", "error");
        return;
      }

      isConnectingRef.current = true;

      // Check Android permissions
      if (Platform.OS === "android") {
        const permissionGranted = await checkBluetoothConnectPermission();
        if (!permissionGranted) {
          showToastMessage("Bluetooth permission required to connect", "error");
          return;
        }
      }

      // Stop scanning before connecting
      try {
        stopScan();
      } catch (e) {
        console.warn("Error stopping scan:", e);
      }

      setIsLoading(true);
      setLoadingMessage("Connecting to device...");
      const manager = getManager();

      // Connect with timeout
      const connectedDev = await withTimeout(
        manager.connectToDevice(device.id, {
          timeout: BLE_CONFIG.CONNECT_TIMEOUT,
        }),
        BLE_CONFIG.CONNECT_TIMEOUT,
        "Connection timeout",
      );

      // Discover services and characteristics
      await withTimeout(
        connectedDev.discoverAllServicesAndCharacteristics(),
        BLE_CONFIG.SERVICE_DISCOVERY_TIMEOUT,
        "Service discovery timeout",
      );

      // Request MTU on Android
      if (Platform.OS === "android") {
        try {
          await connectedDev.requestMTU(BLE_CONFIG.MTU_SIZE);
        } catch (e) {
          console.warn("MTU request failed (non-critical):", e);
        }
      }

      // Update state
      if (isMountedRef.current) {
        setConnectedDevice(
          Object.assign(connectedDev, {
            displayName:
              connectedDev.localName ||
              connectedDev.name ||
              `Device (${connectedDev.id})`,
          }) as DeviceWithDisplayName,
        );
        setBtConnectionState(true);
        setIsLoading(false);
        setLoadingMessage("");
      }

      // Close modal and show success
      onClose();
      setOffUsed("");
      showToastMessage("Device connected successfully", "success");
    } catch (error: any) {
      console.error("Connection Error:", error);

      if (isMountedRef.current) {
        setConnectedDevice(null);
        setBtConnectionState(false);
        setIsLoading(false);
        setLoadingMessage("");
      }

      const errorMsg = formatBLEError(error);
      showToastMessage(`Connection failed: ${errorMsg}`, "error");

      // Handle GATT errors
      if (isGATTError(error)) {
        await disconnectDevice();
      }
    } finally {
      isConnectingRef.current = false;
    }
  };

  const disconnectDevice = async () => {
    if (!connectedDevice) {
      showToastMessage("No device currently connected", "warning");
      return;
    }

    try {
      const manager = getManager();
      await manager.cancelDeviceConnection(connectedDevice.id);

      if (isMountedRef.current) {
        setConnectedDevice(null);
        setBtConnectionState(false);
      }

      showToastMessage("Device disconnected successfully", "success");
    } catch (error: any) {
      console.error("Disconnection error:", error);
      showToastMessage("Failed to disconnect device", "error");
    }
  };

  /**
   * Generic BLE command sender
   * Handles all command types (OFF, PERCENT, POLE)
   */
  const sendBLECommand = async (
    command: string,
    commandType: "OFF" | "PERCENT" | "POLE",
    displayLabel: string,
  ) => {
    // Guard: Check connection state
    if (!btConnectionState || !connectedDevice?.id) {
      showToastMessage("Device not connected", "error");
      return;
    }

    // Guard: Validate UUIDs
    const serviceUUID = BLE_CONFIG.SERVICE_UUID;
    const charUUID = BLE_CONFIG.CHARACTERISTIC_UUID;

    if (!serviceUUID || !charUUID) {
      showToastMessage(
        "Service or Characteristic UUID not configured",
        "error",
      );
      return;
    }

    if (commandType === "PERCENT") {
      if (isMountedRef.current) setPercentUsed(displayLabel);
    }
    if (commandType === "POLE") {
      if (isMountedRef.current) setPoleUsed(displayLabel);
    }
    if (commandType === "OFF") {
      if (isMountedRef.current) setOffUsed(displayLabel);
    }

    try {
      // Encode command to Base64
      const base64Value = btoa(command);

      // Validate Base64 encoding
      if (!isValidBase64(base64Value)) {
        throw new Error("Failed to encode command to Base64");
      }

      const manager = getManager();

      // Send command with timeout
      await manager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        serviceUUID,
        charUUID,
        base64Value,
      );

      showToastMessage(
        `Successfully sent ${displayLabel} to device`,
        "success",
      );
    } catch (error: any) {
      console.error("BLE write error:", error);

      const errorMsg = formatBLEError(error);
      showToastMessage(`Failed to send ${displayLabel}: ${errorMsg}`, "error");

      // Handle GATT errors
      if (isGATTError(error)) {
        if (isMountedRef.current) {
          setBtConnectionState(false);
        }
      }
    }
  };

  // Button click handlers
  const onClickOffButtons = async (btnType: string) => {
    await sendBLECommand(BLE_COMMANDS.OFF, "OFF", "Turn Off");
    clearStateData();
  };

  const onClickPercentButtons = async (btnType: string) => {
    const commandMap: Record<string, string> = {
      "25%": BLE_COMMANDS.PERCENT_25,
      "50%": BLE_COMMANDS.PERCENT_50,
      "75%": BLE_COMMANDS.PERCENT_75,
      "100%": BLE_COMMANDS.PERCENT_100,
    };

    const command = commandMap[btnType] || BLE_COMMANDS.PERCENT_100;
    await sendBLECommand(command, "PERCENT", btnType);
  };

  const onClickPoleButtons = async (btnType: string) => {
    const command =
      btnType === "POLE UP" ? BLE_COMMANDS.POLE_UP : BLE_COMMANDS.POLE_DOWN;
    await sendBLECommand(command, "POLE", btnType);
  };

  const getOffButtonStyle = (btnValue: string) => {
    return offUsed === btnValue
      ? styles.buttonRedBgColor
      : styles.buttonGrayBgColor;
  };

  const getPercentButtonStyle = (btnValue: string) => {
    return percentUsed === btnValue
      ? styles.buttonGreenBgColor
      : styles.buttonGrayBgColor;
  };

  const getPoleButtonStyle = (btnValue: string) => {
    return poleUsed === btnValue
      ? styles.buttonOrangeBgColor
      : styles.buttonGrayBgColor;
  };

  /**
   * Check if a device is currently connected
   */
  const isDeviceConnected = (deviceId: string): boolean => {
    return connectedDevice?.id === deviceId && btConnectionState;
  };

  /**
   * Get connection status badge component
   */
  const getConnectionStatusBadge = (deviceId: string) => {
    const connected = isDeviceConnected(deviceId);
    return (
      <View
        style={[
          styles.statusBadge,
          connected
            ? styles.statusBadgeConnected
            : styles.statusBadgeDisconnected,
        ]}
        testID={
          connected ? "device-connected-badge" : "device-disconnected-badge"
        }
      >
        <View
          style={[
            styles.statusDot,
            connected
              ? styles.statusDotConnected
              : styles.statusDotDisconnected,
          ]}
        />
        <Text
          style={[
            styles.statusText,
            connected
              ? styles.statusTextConnected
              : styles.statusTextDisconnected,
          ]}
        >
          {connected ? "Connected" : "Available"}
        </Text>
      </View>
    );
  };

  const onClose = () => {
    setModalVisible(false);
  };

  const BleLoader = ({
    visible,
    message,
  }: {
    visible: boolean;
    message: string;
  }) => (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.loaderOverlay}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loaderText}>{message || "Processing..."}</Text>
        </View>
      </View>
    </Modal>
  );
  if (!appIsReady) {
    // This is your CUSTOM full-screen splash screen
    return (
      <View style={styles.container}>
        <Image
          source={require("../assets/images/splash.png")}
          style={styles.fullScreenImage}
          resizeMode="cover"
        />
      </View>
    );
  } else {
    return (
      <View style={styles.mainContainer} testID={testID.mainContainerTestid}>
        <BleLoader visible={isLoading} message={loadingMessage} />
        <View
          style={styles.imageContainer}
          testID={testID.imageContainerTestid}
        >
          <Image
            source={require("../assets/images/banner.png")}
            style={styles.headerLogo}
            resizeMode="contain"
            testID={testID.imageContainerImageTestid}
          />
          <Text style={styles.headerTitle}>PELT</Text>
        </View>

        <View style={styles.ScrollViewMainContainer}>
          <View
            style={styles.mainButtonsContainer}
            testID={testID.buttonContainerTestid}
          >
            <View style={styles.connectButtonContainer}>
              <Pressable
                onPress={connectToBtDevice}
                style={({ pressed }) => [
                  [
                    styles.pressableButtonStyle,
                    styles.curvedButton,
                    styles.connectButtnBgColor,
                  ],
                  pressed && styles.pressibleCompPressed,
                ]}
                android_ripple={styles.pressableAndroidRipple}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Connect to Bluetooth device"
                testID={testID.pressableConnectTestid}
              >
                <Text
                  style={styles.pressibleText}
                  testID={testID.pressableConnectTextTestid}
                >
                  Connect
                </Text>
              </Pressable>
            </View>

            <View style={styles.statusButtonContainer}>
              <Pressable
                disabled={true}
                style={[
                  styles.pressableButtonStyle,
                  styles.curvedButton,
                  btConnectionState
                    ? styles.statusButtonEnabled
                    : styles.statusButtonDisabled,
                ]}
                android_ripple={styles.pressableAndroidRipple}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Bluetooth status"
                testID={testID.pressableStatusTestid}
              >
                <Text
                  style={styles.pressibleText}
                  testID={testID.pressableStatusTextTestid}
                >
                  {btConnectionState ? "Connected" : "Disconnected"}
                </Text>
              </Pressable>
            </View>
          </View>
          <View
            style={styles.secondButtonsContainer}
            testID={testID.buttonContainerBodyTestid}
          >
            <View style={styles.secondButtonFirstRowContainer}>
              <Pressable
                onPress={() => {
                  onClickOffButtons("OFF");
                }}
                style={({ pressed }) => [
                  styles.pressableButtonStyle,
                  styles.circleButton,
                  getOffButtonStyle("OFF"),
                  pressed && styles.pressibleCompPressed,
                ]}
                android_ripple={styles.pressableAndroidRipple}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Turn off device"
                testID={testID.pressableOffTestid}
              >
                <Text testID={testID.pressableOffTextTestid}>OFF</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onClickPercentButtons("25%");
                }}
                style={({ pressed }) => [
                  styles.pressableButtonStyle,
                  styles.circleButton,
                  getPercentButtonStyle("25%"),
                  pressed && styles.pressibleCompPressed,
                ]}
                android_ripple={styles.pressableAndroidRipple}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Turn 25% device"
                testID={testID.pressable25Testid}
              >
                {percentUsed === "25%" && (
                  <Text testID={testID.pressable25TextTestid}>25%</Text>
                )}
                {percentUsed !== "25%" && (
                  <Text testID={`${testID.pressable25TextTestid}Second`}>
                    25%
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  onClickPercentButtons("50%");
                }}
                style={({ pressed }) => [
                  styles.pressableButtonStyle,
                  styles.circleButton,
                  getPercentButtonStyle("50%"),
                  pressed && styles.pressibleCompPressed,
                ]}
                android_ripple={styles.pressableAndroidRipple}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Turn 50% device"
                testID={testID.pressable50Testid}
              >
                {percentUsed === "50%" && (
                  <Text testID={testID.pressable50TextTestid}>50%</Text>
                )}
                {percentUsed !== "50%" && (
                  <Text testID={`${testID.pressable50TextTestid}Second`}>
                    50%
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  onClickPercentButtons("75%");
                }}
                style={({ pressed }) => [
                  styles.pressableButtonStyle,
                  styles.circleButton,
                  getPercentButtonStyle("75%"),
                  pressed && styles.pressibleCompPressed,
                ]}
                android_ripple={styles.pressableAndroidRipple}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Turn 75% device"
                testID={testID.pressable75Testid}
              >
                {percentUsed === "75%" && (
                  <Text testID={testID.pressable75TextTestid}>75%</Text>
                )}
                {percentUsed !== "75%" && (
                  <Text testID={`${testID.pressable75TextTestid}Second`}>
                    75%
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  onClickPercentButtons("100%");
                }}
                style={({ pressed }) => [
                  styles.pressableButtonStyle,
                  styles.circleButton,
                  getPercentButtonStyle("100%"),
                  pressed && styles.pressibleCompPressed,
                ]}
                android_ripple={styles.pressableAndroidRipple}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Turn 100% device"
                testID={testID.pressable100Testid}
              >
                {percentUsed === "100%" && (
                  <Text testID={testID.pressable100TextTestid}>100%</Text>
                )}
                {percentUsed !== "100%" && (
                  <Text testID={`${testID.pressable100TextTestid}Second`}>
                    100%
                  </Text>
                )}
              </Pressable>
            </View>
            <View style={styles.secondButtonSecondRowContainer}>
              <Pressable
                onPress={() => {
                  onClickPoleButtons("POLE UP");
                }}
                style={({ pressed }) => [
                  styles.pressableButtonStyle,
                  styles.curvedButton,
                  getPoleButtonStyle("POLE UP"),
                  pressed && styles.pressibleCompPressed,
                ]}
                android_ripple={styles.pressableAndroidRipple}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Pole up device"
                testID={testID.pressablePoleupTestid}
              >
                {poleUsed === "POLE UP" && (
                  <Text testID={testID.pressablePoleupTextTestid}>POLE UP</Text>
                )}
                {poleUsed !== "POLE UP" && (
                  <Text testID={`${testID.pressablePoleupTextTestid}Second`}>
                    POLE UP
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  onClickPoleButtons("POLE DOWN");
                }}
                style={({ pressed }) => [
                  styles.pressableButtonStyle,
                  styles.curvedButton,
                  getPoleButtonStyle("POLE DOWN"),
                  pressed && styles.pressibleCompPressed,
                ]}
                android_ripple={styles.pressableAndroidRipple}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Pole down device"
                testID={testID.pressablePoledownTestid}
              >
                {poleUsed === "POLE DOWN" && (
                  <Text testID={testID.pressablePoledownTextTestid}>
                    POLE DOWN
                  </Text>
                )}
                {poleUsed !== "POLE DOWN" && (
                  <Text testID={`${testID.pressablePoledownTextTestid}Second`}>
                    POLE DOWN
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
        <Modal
          visible={modalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={onClose}
          statusBarTranslucent={true}
        >
          <View style={styles.overlay}>
            <View style={styles.modalContainer}>
              <View style={styles.header}>
                <Text style={styles.title}>Available Devices</Text>
                <TouchableOpacity onPress={onClose}>
                  <Text style={styles.closeBtn}>Close</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={scannedDevices}
                keyExtractor={(item) => item.id}
                // This is key: it allows the list to shrink/grow based on items
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.deviceItem,
                      isDeviceConnected(item.id) && styles.deviceItemConnected,
                    ]}
                    onPress={() => connectToBTDevice(item)}
                    disabled={isDeviceConnected(item.id)}
                  >
                    <View style={styles.deviceInfoContainer}>
                      <Text style={styles.deviceName}>
                        {item.localName || item.name || "Unknown Device"}
                      </Text>
                      <Text style={styles.deviceId}>{item.id}</Text>
                    </View>
                    <View style={styles.deviceRightContainer}>
                      <Text style={styles.rssi}>{item.rssi} dBm</Text>
                      {getConnectionStatusBadge(item.id)}
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>Searching for devices...</Text>
                }
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }
};
export default Index;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#ffffffff" },
  fullScreenImage: { width: "100%", height: "100%" },
  mainContainer: {
    flex: 1,
    backgroundColor: "#ffffffff",
  },
  loaderOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  loaderContainer: {
    backgroundColor: "white",
    padding: 30,
    borderRadius: 15,
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  loaderText: {
    marginTop: 15,
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  imageContainer: {
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#ccccccff",
    paddingVertical: 10,
  },
  headerLogo: {
    width: "60%",
    height: 70,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: "semibold",
  },
  ScrollViewMainContainer: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mainButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  connectButtonContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  statusButtonContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  pressableButtonStyle: {
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderWidth: 0.5,
    borderColor: "#000000ff",
    justifyContent: "center",
    alignItems: "center",
  },
  pressibleText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#000000",
  },
  curvedButton: {
    borderRadius: 25,
  },
  circleButton: {
    borderRadius: 999,
    paddingVertical: 18,
  },
  circleButtonMarginVertical: {
    marginVertical: 0,
  },
  curveButtonMarginVertical: {
    marginVertical: 0,
  },
  pressableAndroidRipple: { color: "rgba(0,0,0,0.08)" },
  pressibleCompPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  connectButtnBgColor: {
    backgroundColor: "#b0d1f4ff",
  },
  statusButtonEnabled: {
    backgroundColor: "#28d759ff",
  },
  statusButtonDisabled: {
    backgroundColor: "#c93134ff",
  },
  buttonGrayBgColor: {
    backgroundColor: "#ada9a9ff",
  },
  buttonRedBgColor: {
    backgroundColor: "#c93134ff",
  },
  buttonGreenBgColor: {
    backgroundColor: "#28d759ff",
  },
  buttonOrangeBgColor: {
    backgroundColor: "#ffa500",
  },
  secondButtonsContainer: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 4,
    gap: 4,
  },
  secondButtonFirstRowContainer: {
    flex: 1,
    justifyContent: "space-evenly",
    alignItems: "center",
    gap: 4,
  },
  secondButtonSecondRowContainer: {
    flex: 1,
    justifyContent: "space-evenly",
    alignItems: "center",
    gap: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.7,
    minHeight: 200,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
  },
  closeBtn: {
    color: "#007AFF",
    fontWeight: "600",
  },
  listContent: {
    paddingVertical: 10,
  },
  deviceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  deviceItemConnected: {
    backgroundColor: "#f0f8f0",
    opacity: 0.8,
  },
  deviceInfoContainer: {
    flex: 1,
  },
  deviceRightContainer: {
    alignItems: "flex-end",
    marginLeft: 10,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "500",
  },
  deviceId: {
    fontSize: 12,
    color: "#888",
  },
  rssi: {
    fontSize: 12,
    color: "#4CAF50",
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  statusBadgeConnected: {
    backgroundColor: "#e8f5e9",
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  statusBadgeDisconnected: {
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#cccccc",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotConnected: {
    backgroundColor: "#4CAF50",
  },
  statusDotDisconnected: {
    backgroundColor: "#999999",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  statusTextConnected: {
    color: "#2e7d32",
  },
  statusTextDisconnected: {
    color: "#666666",
  },
  emptyText: {
    textAlign: "center",
    marginTop: 20,
    color: "#999",
  },
});
