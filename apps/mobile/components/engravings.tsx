import Svg, { Circle, Line, Path, Polyline } from "react-native-svg";
import { color } from "../lib/tokens";

/* Chart-room engravings — line-drawn instrument marks for the weigh-in board
   world. All ornament strokes are mist/ink; brass is reserved for the four
   Brass Ledger meanings, so only the verification SealRing may be brass.
   Square caps throughout (matches the web seal's square-capped check). */

export function CompassRose({
  size,
  stroke = color.mist,
  opacity = 1,
}: {
  size: number;
  stroke?: string;
  opacity?: number;
}) {
  // Cardinal points run long, intercardinals short — a chart compass, not a dial.
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" opacity={opacity}>
      <Circle cx={50} cy={50} r={47} stroke={stroke} strokeWidth={1.5} fill="none" />
      <Circle
        cx={50}
        cy={50}
        r={30}
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray="3 4"
        fill="none"
      />
      {/* cardinals */}
      <Line x1={50} y1={4} x2={50} y2={42} stroke={stroke} strokeWidth={1.5} strokeLinecap="square" />
      <Line x1={50} y1={58} x2={50} y2={96} stroke={stroke} strokeWidth={1.5} strokeLinecap="square" />
      <Line x1={4} y1={50} x2={42} y2={50} stroke={stroke} strokeWidth={1.5} strokeLinecap="square" />
      <Line x1={58} y1={50} x2={96} y2={50} stroke={stroke} strokeWidth={1.5} strokeLinecap="square" />
      {/* intercardinals */}
      <Line x1={26} y1={26} x2={38} y2={38} stroke={stroke} strokeWidth={1} strokeLinecap="square" />
      <Line x1={62} y1={62} x2={74} y2={74} stroke={stroke} strokeWidth={1} strokeLinecap="square" />
      <Line x1={74} y1={26} x2={62} y2={38} stroke={stroke} strokeWidth={1} strokeLinecap="square" />
      <Line x1={38} y1={62} x2={26} y2={74} stroke={stroke} strokeWidth={1} strokeLinecap="square" />
      <Circle cx={50} cy={50} r={4} stroke={stroke} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

export function Anchor({
  size,
  stroke = color.inkSoft,
  opacity = 1,
}: {
  size: number;
  stroke?: string;
  opacity?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" opacity={opacity}>
      <Circle cx={50} cy={16} r={9} stroke={stroke} strokeWidth={6} fill="none" />
      <Line x1={50} y1={25} x2={50} y2={84} stroke={stroke} strokeWidth={6} strokeLinecap="square" />
      <Line x1={30} y1={38} x2={70} y2={38} stroke={stroke} strokeWidth={6} strokeLinecap="square" />
      {/* crown and arms */}
      <Path d="M 20 58 A 30 30 0 0 0 80 58" stroke={stroke} strokeWidth={6} fill="none" strokeLinecap="square" />
      {/* flukes */}
      <Line x1={20} y1={58} x2={13} y2={48} stroke={stroke} strokeWidth={6} strokeLinecap="square" />
      <Line x1={80} y1={58} x2={87} y2={48} stroke={stroke} strokeWidth={6} strokeLinecap="square" />
    </Svg>
  );
}

/* The verification seal — the web profile ring translated to native: solid
   ring, dashed inner ring, square-capped check, in graphic brass (rule V-1:
   rendered only from an admin-set verified flag; a Brass Ledger slot). */
export function SealRing({ size, stroke = color.brass }: { size: number; stroke?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={50} cy={50} r={45} stroke={stroke} strokeWidth={7} fill="none" />
      <Circle
        cx={50}
        cy={50}
        r={32}
        stroke={stroke}
        strokeWidth={3}
        strokeDasharray="7 6"
        fill="none"
      />
      <Polyline
        points="33,52 45,63 67,38"
        stroke={stroke}
        strokeWidth={8}
        fill="none"
        strokeLinecap="square"
      />
    </Svg>
  );
}

/* Latitude hairlines — the navy field's sub-attentional chart texture.
   Rendered by the caller as absolutely-positioned 1px Views; this just
   centralizes the ink so every navy field draws the same latitude. */
export const LATITUDE_LINE = {
  height: 1,
  backgroundColor: color.mist,
  opacity: 0.12,
} as const;
