import { appIcon } from "@/lib/chat/appIcon";

// What iOS shows for "Add to Home Screen".
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(size.width);
}
