import { testID } from "@/constants/testId";
import { encode as btoa } from "base-64";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BleManager, Device, State } from "react-native-ble-plx";
import { showToast } from "react-native-nitro-toast";

const manager = new BleManager();

// If you know your device's service UUID(s), add them here so we can
// detect devices already connected to the system even when they don't
// appear in the current scan results.
const KNOWN_SERVICE_UUIDS: string[] = ["12345678-1234-1234-1234-1234567890ab"];
const KNOWN_CHARACTERISTIC_UUIDS: string[] = [
  "abcd1234-5678-1234-5678-abcdef123456",
];

type DeviceWithDisplayName = Device & { displayName: string };

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Prevent auto hide; swallow errors to avoid unhandled rejection at module load
SplashScreen.preventAutoHideAsync().catch(() => {});

const Index = () => {
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
  const scanTimeoutRef = useRef<any>(null);
  const checkConnTimeoutRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);

  // Memoized state clearing function
  const clearStateData = () => {
    setScannedDevices([]);
    setBtConnectionState(false);
    setConnectedDevice(null);
    setModalVisible(false);
    setIsLoading(false);
    setLoadingMessage("");
    setPercentUsed("");
    setPoleUsed("");
    setOffUsed("");
  };

  const checkConnection = async (): Promise<Device | null> => {
    if (isMountedRef.current) setIsLoading(true);
    try {
      if (connectedDevice) {
        const isConnected = await manager.isDeviceConnected(connectedDevice.id);
        if (isConnected) {
          if (isMountedRef.current) setBtConnectionState(true);
          if (isMountedRef.current) setIsLoading(false);
          if (isMountedRef.current) setLoadingMessage("");
          return connectedDevice;
        }
        if (isMountedRef.current) setConnectedDevice(null);
      }

      for (const dev of scannedDevices) {
        try {
          const isConnected = await manager.isDeviceConnected(dev.id);
          if (isConnected) {
            if (isMountedRef.current) setConnectedDevice(dev);
            if (isMountedRef.current) setBtConnectionState(true);
            if (isMountedRef.current) setIsLoading(false);
            if (isMountedRef.current) setLoadingMessage("");
            return dev;
          }
        } catch {
          // ignore
        }
      }

      // If the connected device wasn't found in the scan results, try
      // querying the OS for devices already connected that advertise
      // known service UUIDs (if configured).
      if (KNOWN_SERVICE_UUIDS.length > 0) {
        try {
          const connected = await manager.connectedDevices(KNOWN_SERVICE_UUIDS);
          if (connected && connected.length > 0) {
            const dev = connected[0];
            if (isMountedRef.current) setConnectedDevice(dev);
            if (isMountedRef.current) setBtConnectionState(true);
            if (isMountedRef.current) setIsLoading(false);
            if (isMountedRef.current) setLoadingMessage("");
            return dev;
          }
        } catch (e) {
          // ignore errors from connectedDevices
        }
      }
      if (isMountedRef.current) setBtConnectionState(false);
      if (isMountedRef.current) setIsLoading(false);
      if (isMountedRef.current) setLoadingMessage("");
      return null;
    } catch (error) {
      showToastMessage("Error checking connection status", "error");
      if (isMountedRef.current) setIsLoading(false);
      if (isMountedRef.current) setLoadingMessage("");
      return null;
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      await requestBluetoothPermission();

      try {
        // --- YOUR BLE INIT LOGIC HERE ---
        // Pre-load fonts, make API calls, or check BLE permissions

        // If Bluetooth is already powered on, start scanning and verify connection
        const currentState = await manager.state();
        if (currentState === State.PoweredOn) {
          handleStartScan();
          // run an immediate connection check
          await checkConnection();
        }

        // Increase Splash Screen time (e.g., 3 seconds)
        // setTimeout(
        //   () => hideOriginalSplashShowJSSplashScreen().then(resolve),
        //   5000,
        // ),
        SplashScreen.hideAsync();
        await new Promise<void>((resolve) =>
          setTimeout(() => {
            if (isMountedRef.current) {
              setAppIsReady(true);
            }
            resolve();
          }, 1500),
        );
      } catch (error) {
        console.warn("App initialization error:", error);
        if (isMountedRef.current) {
          setAppIsReady(true); // Show UI anyway
        }
      } finally {
        // Note: setAppIsReady and prepare() are called but not defined in this file
        // Make sure these functions exist or remove them if not needed
      }
    };

    initializeApp();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setLoadingMessage("Initializing Bluetooth...");
    const subscription = manager.onStateChange((state) => {
      setBtState(state);
      if (state === State.PoweredOn) {
        handleStartScan();
        checkConnTimeoutRef.current = setTimeout(checkConnection, 3000);
        // checkConnection();
      } else {
        stopScan(); // Safety: Stop scanning if BT is toggled off
        if (isMountedRef.current) setScannedDevices([]);
        if (isMountedRef.current) setIsLoading(false);
        if (isMountedRef.current) setLoadingMessage("");
      }
    }, true);

    return () => {
      subscription.remove();
      // CRITICAL: Stop scanning and destroy manager on unmount
      manager.stopDeviceScan();
      // clear pending timeouts
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      if (checkConnTimeoutRef.current) {
        clearTimeout(checkConnTimeoutRef.current);
        checkConnTimeoutRef.current = null;
      }
      // Only destroy if you aren't using a persistent global manager
      // manager.destroy();
    };
  }, []);

  // const hideOriginalSplashShowJSSplashScreen = async () => {
  //   if (isMountedRef.current) setAppIsReady(true);
  //   return true;
  // };

  const showToastMessage = (
    message: string,
    type: "success" | "error" | "warning" | "info",
    title?: string,
    position?: "top" | "bottom",
  ) => {
    showToast(message, {
      type: type,
      position: position || "top",
      duration: 3000,
      title: title || "",
      backgroundColor:
        type === "success"
          ? "#4CAF50"
          : type === "error"
            ? "#F44336"
            : type === "warning"
              ? "#FF9800"
              : "#2196F3",
      messageColor: "#010101",
      haptics: true,
    });
  };

  const requestBluetoothPermission = async () => {
    if (Platform.OS === "ios") {
      return true; // iOS handles this automatically on scan
    }

    if (Platform.OS === "android") {
      const apiLevel = Platform.Version;

      if (apiLevel < 31) {
        // Android 11 and below need Location
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
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
    }
    return false;
  };

  const handleStartScan = async () => {
    if (isMountedRef.current) {
      setScannedDevices([]);
      setIsLoading(true);
      setLoadingMessage("Initializing Bluetooth...");
    }

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        setIsLoading(false);
        setLoadingMessage("");
        return;
      }
      const displayName =
        device?.localName || device?.name || `Unnamed (${device?.id})`;

      if (device && isMountedRef.current) {
        setScannedDevices((prev) => {
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
    scanTimeoutRef.current = setTimeout(stopScan, 1000);
    checkConnTimeoutRef.current = setTimeout(checkConnection, 3000);
    if (isMountedRef.current) setIsLoading(false);
    if (isMountedRef.current) setLoadingMessage("");
  };

  const stopScan = () => {
    manager.stopDeviceScan();
  };

  // const toggleBluetooth = async (turnOn: boolean) => {
  //   if (Platform.OS === "android") {
  //     // 1. Request the specific permission required to toggle the radio
  //     const hasPermission = await PermissionsAndroid.check(
  //       PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  //     );
  //     const granted = await PermissionsAndroid.request(
  //       PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  //     );

  //     if (!hasPermission) {
  //       const granted = await PermissionsAndroid.request(
  //         PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  //       );
  //       if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
  //         {
  //           showToastMessage(
  //             "Bluetooth Connect permission denied. Cannot enable.",
  //             "error",
  //           );
  //           return;
  //         }
  //       }
  //     }
  //   }

  //   try {
  //     if (Platform.OS === "android") {
  //       if (turnOn) {
  //         // Powers on the radio. Note: Requires BLUETOOTH_CONNECT permission
  //         await manager.enable();
  //         handleStartScan();
  //         showToastMessage("Bluetooth turned on", "success");
  //       } else {
  //         // Powers off the radio.
  //         await manager.disable();
  //         setTimeout(checkConnection, 1000);
  //         showToastMessage("Bluetooth turned off", "success");
  //       }
  //     } else {
  //       showToastMessage(
  //         "iOS does not allow programmatic radio toggling.",
  //         "error",
  //       );
  //     }
  //   } catch (error) {
  //     showToastMessage("Error toggling Bluetooth radio", "error");
  // };

  const connectToBtDevice = async () => {
    if (btState === State.PoweredOn) {
      handleStartScan();
      setModalVisible(true);
    } else {
      // toggleBluetooth(true);
      showToastMessage(
        "Please turn on Bluetooth to connect to devices.",
        "warning",
      );
    }
  };

  const connectToBTDevice = async (device: Device) => {
    try {
      // 1. Stop scanning before connecting (Crucial for stability)
      manager.stopDeviceScan();

      setIsLoading(true);
      setLoadingMessage("Connecting to device...");

      // 2. Connect to device with timeout
      const dev = await manager.connectToDevice(device.id, { timeout: 10000 });

      // 3. Discover services and characteristics
      await dev.discoverAllServicesAndCharacteristics();

      // 4. Request MTU on Android
      if (Platform.OS === "android") {
        try {
          await dev.requestMTU(512);
        } catch (e) {
          console.warn("MTU request failed:", e);
        }
      }

      // 5. Update state
      if (isMountedRef.current) {
        setConnectedDevice(dev);
        setBtConnectionState(true);
        setIsLoading(false);
        setLoadingMessage("");
        setOffUsed("");
        setPercentUsed("");
        setPoleUsed("");
      }

      // 6. Close modal and show success
      onClose();
      showToastMessage("Device connected successfully", "success");
    } catch (error: any) {
      console.error("Connection Error:", error);

      // Reset all state
      onClose();
      if (isMountedRef.current) {
        clearStateData();
      }

      // Show error message
      const errorMsg = error?.message || String(error);
      showToastMessage(`Connection failed: ${errorMsg}`, "error");
    }
  };

  const disconnectDevice = async () => {
    if (!connectedDevice) {
      showToastMessage("No device currently connected", "warning");
      return;
    }
    try {
      // This tells the Android Bluetooth stack to close the GATT server connection
      await manager.cancelDeviceConnection(connectedDevice?.id);
      showToastMessage("Device Disconnected successfully", "success");

      // Reset your local React state here
      if (isMountedRef.current) setConnectedDevice(null);
      if (isMountedRef.current) setBtConnectionState(false);
    } catch (error) {
      // console.error("Disconnection failed:", error);
      showToastMessage("Failed to disconnect device", "error");
    }
  };

  const onClickOffButtons = async (btnType: string) => {
    // Guard and send OFF command before disconnecting
    if (!btConnectionState) {
      showToastMessage("Device not connected!", "error");
      return;
    }

    if (!connectedDevice || !connectedDevice.id) {
      showToastMessage(
        "Please connect to LKZ_PELT Bluetooth device first.",
        "warning",
      );
      return;
    }

    const serviceUUID = KNOWN_SERVICE_UUIDS[0];
    const charUUID = KNOWN_CHARACTERISTIC_UUIDS[0];
    if (!serviceUUID || !charUUID) {
      showToastMessage(
        "Service or Characteristic UUID is not configured.",
        "error",
      );
      return;
    }

    if (
      typeof manager.writeCharacteristicWithResponseForDevice !== "function"
    ) {
      showToastMessage("Bluetooth manager not available.", "error");
      return;
    }

    try {
      const base64Value = btoa("L");

      await manager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        serviceUUID,
        charUUID,
        base64Value,
      );

      if (isMountedRef.current) {
        setOffUsed(btnType);
        if (percentUsed !== "") setPercentUsed("");
      }

      showToastMessage(`Lokozo machine Successfully turned off`, "success");

      // now disconnect cleanly
      // await disconnectDevice();
    } catch (error: any) {
      const msg = error?.message || String(error);
      showToastMessage(`Failed to turn off Lokozo machine: ${msg}`, "error");
    }

    if (Platform.OS === "android") {
      // turnOffBluetooth();
      // toggleBluetooth(false);
    }
  };

  const onClickPercentButtons = async (btnType: string) => {
    // Defensive guards to avoid native crashes
    if (!btConnectionState) {
      showToastMessage("Device not connected!", "error");
      return;
    }

    if (!connectedDevice || !connectedDevice.id) {
      showToastMessage(
        "Please connect to LKZ_PELT Bluetooth device first.",
        "warning",
      );
      return;
    }

    const serviceUUID = KNOWN_SERVICE_UUIDS[0];
    const charUUID = KNOWN_CHARACTERISTIC_UUIDS[0];
    if (!serviceUUID || !charUUID) {
      showToastMessage(
        "Service or Characteristic UUID is not configured.",
        "error",
      );
      return;
    }

    if (
      typeof manager.writeCharacteristicWithResponseForDevice !== "function"
    ) {
      showToastMessage("Bluetooth manager not available.", "error");
      return;
    }

    try {
      // BLE requires data to be sent as Base64 encoded strings
      let valueToSend =
        btnType === "25%"
          ? "K"
          : btnType === "50%"
            ? "Z"
            : btnType === "75%"
              ? "P"
              : "E";

      const base64Value = btoa(valueToSend);

      if (typeof base64Value !== "string") {
        throw new Error("Failed to encode data to Base64");
      }

      // Send the command to the specific characteristic
      await manager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        serviceUUID,
        charUUID,
        base64Value,
      );
      if (isMountedRef.current) {
        setPercentUsed(btnType);
        if (offUsed !== "") setOffUsed("");
      }
      showToastMessage(
        `Successfully sent ${btnType} to Lokozo machine`,
        "success",
      );
    } catch (error: any) {
      const msg = error?.message || String(error);
      showToastMessage(`Failed to send data: ${msg}`, "error");
    }
  };

  const onClickPoleButtons = async (btnType: string) => {
    // Defensive guards
    if (!btConnectionState) {
      showToastMessage("Device not connected!", "error");
      return;
    }

    if (!connectedDevice || !connectedDevice.id) {
      showToastMessage(
        "Please connect to LKZ_PELT Bluetooth device first.",
        "warning",
      );
      return;
    }

    const serviceUUID = KNOWN_SERVICE_UUIDS[0];
    const charUUID = KNOWN_CHARACTERISTIC_UUIDS[0];
    if (!serviceUUID || !charUUID) {
      showToastMessage(
        "Service or Characteristic UUID is not configured.",
        "error",
      );
      return;
    }

    if (
      typeof manager.writeCharacteristicWithResponseForDevice !== "function"
    ) {
      showToastMessage("Bluetooth manager not available.", "error");
      return;
    }

    try {
      let valueToSend = btnType === "POLE UP" ? "O" : "T";
      const base64Value = btoa(valueToSend);

      await manager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        serviceUUID,
        charUUID,
        base64Value,
      );

      if (isMountedRef.current) setPoleUsed(btnType);

      showToastMessage(
        `Successfully sent ${btnType} to Lokozo machine`,
        "success",
      );
    } catch (error: any) {
      const msg = error?.message || String(error);
      showToastMessage(`Failed to send data: ${msg}`, "error");
    }
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
                  style={styles.pressibleBoldText}
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
                  style={styles.pressibleBoldText}
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
                {offUsed === "OFF" && (
                  <Text
                    style={styles.pressibleNormalText}
                    testID={testID.pressableOffTextTestid}
                  >
                    OFF
                  </Text>
                )}
                {offUsed !== "OFF" && (
                  <Text
                    style={styles.pressibleNormalText}
                    testID={`${testID.pressableOffTextTestid}Second`}
                  >
                    OFF
                  </Text>
                )}
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
                  <Text
                    style={styles.pressibleNormalText}
                    testID={testID.pressable25TextTestid}
                  >
                    25%
                  </Text>
                )}
                {percentUsed !== "25%" && (
                  <Text
                    style={styles.pressibleNormalText}
                    testID={`${testID.pressable25TextTestid}Second`}
                  >
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
                  <Text
                    style={styles.pressibleNormalText}
                    testID={testID.pressable50TextTestid}
                  >
                    50%
                  </Text>
                )}
                {percentUsed !== "50%" && (
                  <Text
                    style={styles.pressibleNormalText}
                    testID={`${testID.pressable50TextTestid}Second`}
                  >
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
                  <Text
                    style={styles.pressibleNormalText}
                    testID={testID.pressable75TextTestid}
                  >
                    75%
                  </Text>
                )}
                {percentUsed !== "75%" && (
                  <Text
                    style={styles.pressibleNormalText}
                    testID={`${testID.pressable75TextTestid}Second`}
                  >
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
                  <Text
                    style={styles.pressibleNormalText}
                    testID={testID.pressable100TextTestid}
                  >
                    100%
                  </Text>
                )}
                {percentUsed !== "100%" && (
                  <Text
                    style={styles.pressibleNormalText}
                    testID={`${testID.pressable100TextTestid}Second`}
                  >
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
                  <Text
                    style={styles.pressibleNormalText}
                    testID={testID.pressablePoleupTextTestid}
                  >
                    POLE UP
                  </Text>
                )}
                {poleUsed !== "POLE UP" && (
                  <Text
                    style={styles.pressibleNormalText}
                    testID={`${testID.pressablePoleupTextTestid}Second`}
                  >
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
                  <Text
                    style={styles.pressibleNormalText}
                    testID={testID.pressablePoledownTextTestid}
                  >
                    POLE DOWN
                  </Text>
                )}
                {poleUsed !== "POLE DOWN" && (
                  <Text
                    style={styles.pressibleNormalText}
                    testID={`${testID.pressablePoledownTextTestid}Second`}
                  >
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
  pressibleBoldText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#000000",
  },
  pressibleNormalText: {
    fontSize: 12,
    fontWeight: "400",
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
    fontWeight: "400",
  },
  rssi: {
    fontSize: 12,
    color: "#4CAF50",
    marginBottom: 8,
    fontWeight: "400",
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
    fontWeight: "400",
  },
});
