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
  ScrollView,
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

SplashScreen.preventAutoHideAsync();

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

  const checkConnection = async (): Promise<Device | null> => {
    setIsLoading(true);
    try {
      if (connectedDevice) {
        const isConnected = await manager.isDeviceConnected(connectedDevice.id);
        if (isConnected) {
          setBtConnectionState(true);
          setIsLoading(false);
          setLoadingMessage("");
          return connectedDevice;
        }
        setConnectedDevice(null);
      }

      for (const dev of scannedDevices) {
        try {
          const isConnected = await manager.isDeviceConnected(dev.id);
          if (isConnected) {
            setConnectedDevice(dev);
            setBtConnectionState(true);
            setIsLoading(false);
            setLoadingMessage("");
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
            setConnectedDevice(dev);
            setBtConnectionState(true);
            setIsLoading(false);
            setLoadingMessage("");
            return dev;
          }
        } catch (e) {
          // ignore errors from connectedDevices
        }
      }

      setBtConnectionState(false);
      setIsLoading(false);
      setLoadingMessage("");
      return null;
    } catch (error) {
      showToastMessage("Error checking connection status", "error");
      setIsLoading(false);
      setLoadingMessage("");
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
        SplashScreen.hideAsync();
        await new Promise(async (resolve) =>
          setTimeout(
            () => hideOriginalSplashShowJSSplashScreen().then(resolve),
            5000,
          ),
        );
      } catch (e) {
        console.warn(e);
      } finally {
        // Note: setAppIsReady and prepare() are called but not defined in this file
        // Make sure these functions exist or remove them if not needed
      }
    };

    initializeApp();
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
        setScannedDevices([]);
        setIsLoading(false);
        setLoadingMessage("");
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

  const hideOriginalSplashShowJSSplashScreen = async () => {
    setAppIsReady(true);
    return true;
  };

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
    setScannedDevices([]);
    setIsLoading(true);
    setLoadingMessage("Initializing Bluetooth...");

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        setIsLoading(false);
        setLoadingMessage("");
        return;
      }
      const displayName =
        device?.localName || device?.name || `Unnamed (${device?.id})`;

      if (device) {
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
    setIsLoading(false);
    setLoadingMessage("");
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
  //   }
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
      setConnectedDevice(dev);
      setBtConnectionState(true);
      setIsLoading(false);
      setLoadingMessage("");

      // 6. Close modal and show success
      onClose();
      showToastMessage("Device connected successfully", "success");
    } catch (error: any) {
      console.error("Connection Error:", error);

      // Reset all state
      setConnectedDevice(null);
      setBtConnectionState(false);
      setIsLoading(false);
      setLoadingMessage("");

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
      setConnectedDevice(null);
      setBtConnectionState(false);
    } catch (error) {
      // console.error("Disconnection failed:", error);
      showToastMessage("Failed to disconnect device", "error");
    }
  };

  const onClickOffButtons = async (btnType: string) => {
    setOffUsed(btnType);
    disconnectDevice();
    if (connectedDevice) {
      try {
        const base64Value = btoa("L");

        // 3. Send the command to the specific characteristic
        // Replace SERVICE_UUID and CHARACTERISTIC_UUID with your Lokozo machine's IDs
        await manager.writeCharacteristicWithResponseForDevice(
          connectedDevice.id,
          KNOWN_SERVICE_UUIDS[0], // or your specific service UUID
          KNOWN_CHARACTERISTIC_UUIDS[0], // or your specific characteristic UUID
          base64Value,
        );

        showToastMessage(
          `Lokozo machine Successfully disconnected and turned off`,
          "success",
        );
      } catch (error) {
        showToastMessage(`Failed to turn off Lokozo machine`, "error");
      }
    }
    if (Platform.OS === "android") {
      // turnOffBluetooth();
      // toggleBluetooth(false);
    }
  };

  const onClickPercentButtons = async (btnType: string) => {
    if (!btConnectionState) {
      showToastMessage("Device not connected!", "error");
      return;
    }
    if (connectedDevice) {
      setPercentUsed(btnType);
      try {
        // BLE requires data to be sent as Base64 encoded strings
        let valueToSend =
          btnType === "25%"
            ? "K"
            : btnType === "50%"
              ? "Z"
              : btnType === "75%"
                ? "P"
                : "E"; // This should be the actual command/data you want to send
        const base64Value = btoa(valueToSend);

        // 3. Send the command to the specific characteristic
        // Replace SERVICE_UUID and CHARACTERISTIC_UUID with your Lokozo machine's IDs
        await manager.writeCharacteristicWithResponseForDevice(
          connectedDevice.id,
          KNOWN_SERVICE_UUIDS[0], // or your specific service UUID
          KNOWN_CHARACTERISTIC_UUIDS[0], // or your specific characteristic UUID
          base64Value,
        );

        showToastMessage(
          `Successfully sent ${btnType}% to Lokozo machine`,
          "success",
        );
      } catch (error) {
        showToastMessage(`Failed to send data:, ${error}`, "error");
      }
    } else {
      showToastMessage(
        "Please connect to LKZ_PELT Bluetooth device first.",
        "warning",
      );
    }
  };

  const onClickPoleButtons = async (btnType: string) => {
    if (!btConnectionState) {
      showToastMessage("Device not connected!", "error");
      return;
    }
    if (connectedDevice) {
      setPoleUsed(btnType);
      try {
        // BLE requires data to be sent as Base64 encoded strings
        let valueToSend = btnType === "POLE UP" ? "L" : "T"; // This should be the actual command/data you want to send
        const base64Value = btoa(valueToSend);

        // 3. Send the command to the specific characteristic
        // Replace SERVICE_UUID and CHARACTERISTIC_UUID with your Lokozo machine's IDs
        await manager.writeCharacteristicWithResponseForDevice(
          connectedDevice.id,
          KNOWN_SERVICE_UUIDS[0], // or your specific service UUID
          KNOWN_CHARACTERISTIC_UUIDS[0], // or your specific characteristic UUID
          base64Value,
        );

        showToastMessage(
          `Successfully sent ${btnType}% to Lokozo machine`,
          "success",
        );
      } catch (error) {
        showToastMessage(`Failed to send data:, ${error}`, "error");
      }
    } else {
      showToastMessage(
        "Please connect to LKZ_PELT Bluetooth device first.",
        "warning",
      );
    }
  };

  const getPercentButtonStyle = (btnValue: string) => {
    return percentUsed === btnValue
      ? styles.buttonGreenBgColor
      : styles.buttonGrayBgColor;
  };

  const getPoleButtonStyle = (btnValue: string) => {
    return poleUsed === btnValue
      ? styles.buttonYellowBgColor
      : styles.buttonGrayBgColor;
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
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          testID={testID.scrollViewTestid}
        >
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
                    styles.circleButtonMarginVertical,
                    offUsed === "OFF"
                      ? styles.buttonRedBgColor
                      : styles.buttonRedBgColor,
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
                    styles.circleButtonMarginVertical,
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
                    styles.circleButtonMarginVertical,
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
                    styles.circleButtonMarginVertical,
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
                    styles.circleButtonMarginVertical,
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
                    styles.curveButtonMarginVertical,
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
                    <Text testID={testID.pressablePoleupTextTestid}>
                      POLE UP
                    </Text>
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
                    styles.curveButtonMarginVertical,
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
                    <Text
                      testID={`${testID.pressablePoledownTextTestid}Second`}
                    >
                      POLE DOWN
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
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
                    style={styles.deviceItem}
                    onPress={() => connectToBTDevice(item)}
                  >
                    <View>
                      <Text style={styles.deviceName}>
                        {item.localName || item.name || "Unknown Device"}
                      </Text>
                      <Text style={styles.deviceId}>{item.id}</Text>
                    </View>
                    <Text style={styles.rssi}>{item.rssi} dBm</Text>
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
    backgroundColor: "rgba(0,0,0,0.4)", // Dimmed background
    justifyContent: "center",
    alignItems: "center",
  },
  loaderContainer: {
    backgroundColor: "white",
    padding: 30,
    borderRadius: 15,
    alignItems: "center",
    elevation: 5, // Android shadow
    shadowColor: "#000", // iOS shadow
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
  },
  headerLogo: {
    width: "50%",
    height: 110,
  },
  ScrollViewMainContainer: {
    paddingVertical: 20,
  },
  mainButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
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
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderWidth: 0.5,
    borderColor: "#000000ff",
    justifyContent: "center",
    alignItems: "center",
  },
  pressibleText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#000000",
  },
  curvedButton: {
    borderRadius: 25,
  },
  circleButton: {
    borderRadius: 999,
    paddingVertical: 28,
  },
  circleButtonMarginVertical: {
    marginVertical: 25,
  },
  curveButtonMarginVertical: {
    marginVertical: 55,
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
  buttonYellowBgColor: {
    backgroundColor: "#fffb23",
  },
  secondButtonsContainer: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 15,
  },
  secondButtonFirstRowContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  secondButtonSecondRowContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end", // Aligns modal to bottom like a sheet
  },
  modalContainer: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    // Set a MAX height so it doesn't cover the status bar
    maxHeight: SCREEN_HEIGHT * 0.7,
    // This allows it to shrink if the list is small
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
  },
  emptyText: {
    textAlign: "center",
    marginTop: 20,
    color: "#999",
  },
});
