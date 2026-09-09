"use client";

import { App, ConfigProvider } from "antd";
import type { ReactNode } from "react";

export function AntdProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#194c70",
          colorInfo: "#194c70",
          colorLink: "#194c70",
          colorLinkHover: "#123a58",
          colorText: "#172b3a",
          colorTextSecondary: "#62717b",
          colorBgLayout: "#f5f5f2",
          colorBgContainer: "#ffffff",
          colorBorder: "#e0e4e6",
          colorBorderSecondary: "#eceeed",
          colorSuccess: "#1e7d43",
          colorWarning: "#b26a00",
          colorError: "#b3261e",
          borderRadius: 8,
          fontFamily: "'Sarabun', sans-serif",
          fontSize: 14,
          controlHeight: 44,
        },
        components: {
          Card: {
            borderRadiusLG: 8,
            colorBorderSecondary: "#e0e4e6",
          },
          Button: {
            borderRadius: 8,
            controlHeight: 44,
            fontWeight: 600,
          },
          Input: {
            borderRadius: 8,
            controlHeight: 44,
          },
          Select: {
            borderRadius: 8,
            controlHeight: 44,
          },
          Table: {
            borderRadius: 8,
            headerBg: "#fafbfa",
            headerColor: "#172b3a",
            rowHoverBg: "#f7f8f7",
          },
          Tag: {
            borderRadiusSM: 6,
          },
          Tabs: {
            itemSelectedColor: "#194c70",
            inkBarColor: "#194c70",
          },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
