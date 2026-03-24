"use client";

type Suit = "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS";

type Props = {
  suit: Suit;
  size?: number | string;
  className?: string;
  tone?: "default" | "playArea";
};

const suitColor: Record<Suit, string> = {
  SPADES: "#1e3a8a",
  HEARTS: "#dc2626",
  DIAMONDS: "#c026d3",
  CLUBS: "#059669",
};

const suitAsset: Record<Suit, string> = {
  SPADES: "/spade.svg",
  HEARTS: "/heart.svg",
  DIAMONDS: "/diamond.svg",
  CLUBS: "/club.svg",
};

export default function SuitIcon({ suit, size = "1em", className = "", tone = "default" }: Props) {
  return (
    <span
      className={`inline-block align-middle ${className}`}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        backgroundColor: suitColor[suit],
        WebkitMaskImage: `url(${suitAsset[suit]})`,
        maskImage: `url(${suitAsset[suit]})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    >
      <span
        className="block h-full w-full"
        style={{
          backgroundColor: suitColor[suit],
          WebkitMaskImage: `url(${suitAsset[suit]})`,
          maskImage: `url(${suitAsset[suit]})`,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          filter:
            tone === "playArea"
              ? suit === "SPADES"
                ? "drop-shadow(0 0 0.15px rgba(8,47,73,0.95))"
                : suit === "HEARTS"
                  ? "drop-shadow(0 0 0.15px rgba(127,29,29,0.92))"
                  : suit === "DIAMONDS"
                    ? "drop-shadow(0 0 0.15px rgba(112,26,117,0.9))"
                    : "drop-shadow(0 0 0.15px rgba(6,78,59,0.92))"
              : suit === "SPADES"
                ? "drop-shadow(0 0 4px rgba(59,130,246,0.18)) drop-shadow(0 0 0.2px rgba(15,23,42,0.9))"
                : suit === "HEARTS"
                  ? "drop-shadow(0 0 5px rgba(220,38,38,0.2)) drop-shadow(0 0 0.2px rgba(127,29,29,0.85))"
                  : suit === "DIAMONDS"
                    ? "drop-shadow(0 0 5px rgba(192,38,211,0.18)) drop-shadow(0 0 0.2px rgba(112,26,117,0.85))"
                    : "drop-shadow(0 0 5px rgba(5,150,105,0.18)) drop-shadow(0 0 0.2px rgba(6,78,59,0.85))",
          transform: tone === "playArea" ? "scale(1.01)" : "scale(1.04)",
          transformOrigin: "center",
        }}
      />
    </span>
  );
}
