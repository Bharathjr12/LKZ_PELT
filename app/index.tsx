import { testID } from "@/constants/testId";
import { SplashScreen } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Linking,
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
const manager = new BleManager();

type DeviceWithDisplayName = Device & { displayName: string };

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const Index = () => {
  const [scannedDevices, setScannedDevices] = useState<DeviceWithDisplayName[]>(
    [],
  );
  const [btState, setBtState] = useState<State>(State.Unknown);
  const [visible, setVisible] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [percentUsed, setPercentUsed] = useState<string>("");
  const [poleUsed, setPoleUsed] = useState<string>("");
  const [offUsed, setOffUsed] = useState<string>("");

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
        // Android 12+ (API 31+) needs SCAN and CONNECT
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);

        return (
          result["android.permission.BLUETOOTH_SCAN"] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          result["android.permission.BLUETOOTH_CONNECT"] ===
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
    setIsLoading(false);
    setLoadingMessage("");
  };

  const stopScan = () => {
    manager.stopDeviceScan();
  };

  useEffect(() => {
    requestBluetoothPermission();
    const prepare = async () => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await SplashScreen.hideAsync();
    };
    prepare();
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setLoadingMessage("Initializing Bluetooth...");
    const subscription = manager.onStateChange((state) => {
      setBtState(state);
      if (state === State.PoweredOn) {
        handleStartScan();
      } else {
        stopScan(); // Safety: Stop scanning if BT is toggled off
        setScannedDevices([]);
        setIsLoading(false);
        setLoadingMessage("");
        // if (Platform.OS === "android") {
        //   Alert.alert("Bluetooth Off", "Would you like to turn on Bluetooth?", [
        //     { text: "Cancel", style: "cancel" },
        //     { text: "Turn On", onPress: async () => await manager.enable() }, // Android only helper
        //   ]);
        // } else {
        //   Alert.alert(
        //     "Bluetooth Required",
        //     "Please enable Bluetooth in your System Settings."
        //   );
        // }
      }
    }, true);

    return () => {
      subscription.remove();
      manager.stopDeviceScan();
    };
  }, [manager]);

  const connectToBtDevice = async () => {
    handleStartScan();
    setVisible(true);
  };

  const onClickPercentButtons = (btnType: string) => {
    setPercentUsed(btnType);
  };
  const onClickPoleButtons = (btnType: string) => {
    setPoleUsed(btnType);
  };
  const onClickOffButtons = (btnType: string) => {
    setOffUsed(btnType);
  };

  // Helper function to get button background color based on selection state
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

  const onConnect = async (device: Device) => {
    try {
      // 1. Stop scanning before connecting (Crucial for stability)
      manager.stopDeviceScan();

      setIsLoading(true); // Show your loader
      setLoadingMessage("Connecting Bluetooth...");

      // 2. Establish Connection
      // timeout: optional milliseconds before failing
      setTimeout(() => {
        setIsLoading(false); // Hide your loader
        setLoadingMessage("");
        onClose();
      }, 1000);
      const connectedDevice = await device.connect({ timeout: 1000 });
      // 3. Discover Services & Characteristics
      // You MUST do this before reading/writing anything
      await connectedDevice.discoverAllServicesAndCharacteristics();

      // 4. Set up Disconnection Listener
      // This ensures your UI updates if the device goes out of range
      connectedDevice.onDisconnected((error, d) => {
        console.log("Device Disconnected");
        // Update your local state here (e.g., setConnectedDevice(null))
      });

      setIsLoading(false); // Hide your loader
      setLoadingMessage("");
      return connectedDevice;
    } catch (error) {
      console.error("Connection Error:", error);
      setIsLoading(false); // Hide your loader
      setLoadingMessage("");
      // Handle specific errors like 'Device is already connected'
    } finally {
      setIsLoading(false); // Hide your loader
      setLoadingMessage("");
    }
  };

  const onClose = () => {
    setVisible(false);
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
  console.log(poleUsed, percentUsed);
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
                disabled={btState === State.PoweredOn ? true : false}
                style={[
                  styles.pressableButtonStyle,
                  styles.curvedButton,
                  btState === State.PoweredOn
                    ? styles.statusButtonEnabled
                    : styles.statusButtonDisabled,
                ]}
                android_ripple={styles.pressableAndroidRipple}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Bluetooth status"
                testID={testID.pressableStatusTestid}
                onPress={async () => {
                  if (btState !== State.PoweredOn) {
                    try {
                      // Modern Android (API 33+) requires sending an Intent for direct toggle request
                      await Linking.sendIntent(
                        "android.bluetooth.adapter.action.REQUEST_ENABLE",
                      );
                    } catch (error) {
                      // Fallback: Open general Bluetooth settings if Intent fails
                      console.warn(
                        "Intent failed, opening settings instead",
                        error,
                      );
                      Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS");
                    }
                  }
                }}
              >
                <Text
                  style={styles.pressibleText}
                  testID={testID.pressableStatusTextTestid}
                >
                  {btState}
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
          visible={visible}
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
                    onPress={() => onConnect(item)}
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
