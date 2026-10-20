import { appIcon } from "@/lib/chat/appIcon";

// The sizes an installed app needs (see manifest.ts): served at /icon/192 and /icon/512.
const SIZES = [192, 512];

export function generateImageMetadata() {
  return SIZES.map((size) => ({
    id: String(size),
    contentType: "image/png",
    size: { width: size, height: size },
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const size = Number(await id);
  return appIcon(SIZES.includes(size) ? size : SIZES[0]);
}
