import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#ffffffff" }}>
      <StatusBar style="dark" backgroundColor="#f0f0f0" translucent={false} />
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
            // headerTitleAlign: "center",
            // headerTitle: () => (
            //   <Image
            //     source={require("../assets/images/banner.png")}
            //     style={styles.headerLogo}
            //     resizeMode="contain"
            //   />
            // ),
            // headerStyle: {
            //   backgroundColor: "#ffffffff",
            // },
          }}
        />
      </Stack>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  // headerLogo: {
  //   width: 200,
  //   height: 100,
  // },
});
