export type ShopInfo = {
  name: string;
  phone: string;
  address: string;
  logoText: string;
  social: string;
};

const env = (import.meta as any).env || {};

export const SHOP_INFO: ShopInfo = {
  name: (env.VITE_SHOP_NAME as string) || "Shoe Repair Shop",
  phone: (env.VITE_SHOP_PHONE as string) || "",
  address: (env.VITE_SHOP_ADDRESS as string) || "",
  logoText: (env.VITE_SHOP_LOGO_TEXT as string) || "",
  social: (env.VITE_SHOP_SOCIAL as string) || "",
};
