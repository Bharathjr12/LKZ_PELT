import { testID } from "@/constants/testId";
// import { SplashScreen } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
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

type DeviceWithDisplayName = Device & { displayName: string };

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

SplashScreen.preventAutoHideAsync();

const Index = () => {
  const MY_TARGET_ID = "94:51:DC:58:55:6A";
  const [scannedDevices, setScannedDevices] = useState<DeviceWithDisplayName[]>(
    [],
  );
  const [btState, setBtState] = useState<State>(State.Unknown);
  const [btConnectionState, setBtConnectionState] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [percentUsed, setPercentUsed] = useState<string>("");
  const [poleUsed, setPoleUsed] = useState<string>("");
  const [offUsed, setOffUsed] = useState<string>("");

  useEffect(() => {
    const initializeApp = async () => {
      requestBluetoothPermission();

      try {
        // --- YOUR BLE INIT LOGIC HERE ---
        // Pre-load fonts, make API calls, or check BLE permissions

        // Increase Splash Screen time (e.g., 3 seconds)
        await new Promise((resolve) => setTimeout(resolve, 5000));
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
        setTimeout(checkConnection, 13000);
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
      // Only destroy if you aren't using a persistent global manager
      // manager.destroy();
    };
  }, [manager]);

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
    setTimeout(stopScan, 10000);
    setTimeout(checkConnection, 13000);
    setIsLoading(false);
    setLoadingMessage("");
  };

  const checkConnection = async () => {
    setIsLoading(true);
    const deviceId = MY_TARGET_ID;
    try {
      const isConnected = await manager.isDeviceConnected(deviceId);
      if (isConnected) {
        setBtConnectionState(true);
      } else {
        setBtConnectionState(false);
      }
      setIsLoading(false);
      setLoadingMessage("");
      return isConnected;
    } catch (error) {
      showToastMessage("Error checking connection status", "error");
      setIsLoading(false);
      setLoadingMessage("");
      return false;
    }
  };

  const stopScan = () => {
    manager.stopDeviceScan();
  };

  const toggleBluetooth = async (turnOn: boolean) => {
    if (Platform.OS === "android") {
      // 1. Request the specific permission required to toggle the radio
      const hasPermission = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );

      if (!hasPermission) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          {
            showToastMessage(
              "Bluetooth Connect permission denied. Cannot enable.",
              "error",
            );
            return;
          }
        }
      }
    }

    try {
      if (Platform.OS === "android") {
        if (turnOn) {
          // Powers on the radio. Note: Requires BLUETOOTH_CONNECT permission
          await manager.enable();
          handleStartScan();
          showToastMessage("Bluetooth turned on", "success");
        } else {
          // Powers off the radio.
          await manager.disable();
          setTimeout(checkConnection, 1000);
          showToastMessage("Bluetooth turned off", "success");
        }
      } else {
        showToastMessage(
          "iOS does not allow programmatic radio toggling.",
          "error",
        );
      }
    } catch (error) {
      showToastMessage("Error toggling Bluetooth radio", "error");
    }
  };

  const connectToBtDevice = async () => {
    if (btState === State.PoweredOn) {
      handleStartScan();
      setModalVisible(true);
    } else {
      toggleBluetooth(true);
      showToastMessage(
        "Please turn on Bluetooth to connect to devices.",
        "warning",
      );
    }
  };

  const connectToDevice = async (device: Device) => {
    if (device.id !== MY_TARGET_ID) {
      showToastMessage(
        "Access Denied: This app is restricted to LKZ_PELT hardware.",
        "error",
      );
      return;
    }

    try {
      // 1. Stop scanning before connecting (Crucial for stability)
      manager.stopDeviceScan();

      setIsLoading(true); // Show your loader
      setLoadingMessage("Connecting Bluetooth...");

      // 2. Establish Connection
      // timeout: optional milliseconds before failing
      const connectedDevice = await device.connect({ timeout: 1000 });

      // 4. Set up Disconnection Listener
      // This ensures your UI updates if the device goes out of range
      connectedDevice.onDisconnected((error, disconnectedDevice) => {
        console.warn("Device disconnected!", error);

        // 1. Reset your React State (e.g., setConnectedDevice(null))
        // 2. Stop any active monitoring/intervals
        // 3. Optionally: Trigger a re-scan or show a "Reconnect" button
      });
      // 3. Discover Services & Characteristics
      // You MUST do this before reading/writing anything
      await connectedDevice.discoverAllServicesAndCharacteristics();
      if (Platform.OS === "android") {
        await connectedDevice.requestMTU(512);
      }
      // setIsLoading(false); // Hide your loader
      // setLoadingMessage("");
      setTimeout(() => {
        checkConnection();
        setIsLoading(false); // Hide your loader
        setLoadingMessage("");
        onClose();
      }, 1500);
    } catch (error) {
      console.error("Connection Error:", error);
      setIsLoading(false); // Hide your loader
      setLoadingMessage("");
      checkConnection();
      // Handle specific errors like 'Device is already connected'
    } finally {
      setIsLoading(false); // Hide your loader
      setLoadingMessage("");
      checkConnection();
    }
  };

  const disconnectDevice = async () => {
    const deviceId = MY_TARGET_ID;
    try {
      // This tells the Android Bluetooth stack to close the GATT server connection
      await manager.cancelDeviceConnection(deviceId);
      showToastMessage("Device Disconnected successfully", "success");

      // Reset your local React state here
      // setConnectedDevice(null);
    } catch (error) {
      // console.error("Disconnection failed:", error);
      showToastMessage("Failed to disconnect device", "error");
    }
  };

  const onClickOffButtons = (btnType: string) => {
    setOffUsed(btnType);
    disconnectDevice();

    if (Platform.OS === "android") {
      // turnOffBluetooth();
      toggleBluetooth(false);
    }
  };

  const onClickPercentButtons = (btnType: string) => {
    if (btConnectionState) {
      setPercentUsed(btnType);
    } else {
      showToastMessage(
        "Please connect to LKZ_PELT Bluetooth device first.",
        "warning",
      );
    }
  };

  const onClickPoleButtons = (btnType: string) => {
    if (btConnectionState) {
      setPoleUsed(btnType);
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

  return (
    <View style={styles.mainContainer} testID={testID.mainContainerTestid}>
      <BleLoader visible={isLoading} message={loadingMessage} />
      <View style={styles.imageContainer} testID={testID.imageContainerTestid}>
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
                    style={styles.deviceItem}
                    onPress={() => connectToDevice(item)}
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
      </ScrollView>
    </View>
  );
};
export default Index;

const styles = StyleSheet.create({
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
    borderRadius: "50%",
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
