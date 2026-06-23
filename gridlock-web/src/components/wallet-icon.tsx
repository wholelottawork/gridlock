const FALLBACK_ICONS: Record<string, string> = {
  Phantom: "/wallets/phantom.svg",
  Solflare: "/wallets/solflare.svg",
  MetaMask: "/wallets/metamask.svg",
};

export function WalletIcon({
  name,
  icon,
  size = 20,
}: {
  name: string;
  icon?: string;
  size?: number;
}) {
  const src = icon || FALLBACK_ICONS[name];
  if (!src) {
    return (
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: 4,
          background: "rgba(255,255,255,0.08)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.45,
          flexShrink: 0,
        }}
      >
        ◆
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: 4, flexShrink: 0, display: "block" }}
    />
  );
}
