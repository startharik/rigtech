import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rigtech.operations",
  appName: "Rigtech",
  webDir: "public",
  backgroundColor: "#f4f7f5",
  server: {
    url: "https://rigtech-two.vercel.app",
    cleartext: false,
    allowNavigation: ["rigtech-two.vercel.app"],
    errorPath: "offline.html",
  },
};

export default config;
