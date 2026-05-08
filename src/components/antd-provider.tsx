"use client";

import { App, ConfigProvider } from "antd";
import type { ReactNode } from "react";

export function AntdProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#7c5cd3",
          colorLink: "#7c5cd3",
          borderRadius: 14,
          fontFamily: "'Sarabun', sans-serif",
        },
        components: {
          Card: {
            borderRadiusLG: 14,
          },
          Button: {
            borderRadius: 10,
          },
          Tag: {
            borderRadius: 20,
          },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
