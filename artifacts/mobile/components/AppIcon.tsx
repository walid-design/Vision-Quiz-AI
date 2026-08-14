import React from 'react';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

export type AppIconName =
  | 'alert-circle'
  | 'camera'
  | 'chart'
  | 'check'
  | 'check-circle'
  | 'clock'
  | 'close'
  | 'image'
  | 'minus'
  | 'pause'
  | 'play'
  | 'plus'
  | 'refresh'
  | 'resize'
  | 'scan'
  | 'settings'
  | 'sparkles'
  | 'warning';

interface Props {
  name: AppIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * Font-independent icons. SVG avoids the missing-glyph boxes that some
 * Android Expo previews show when an icon font is not registered correctly.
 */
export function AppIcon({ name, size = 24, color = '#fff', strokeWidth = 2 }: Props) {
  const glyph = (() => {
    switch (name) {
      case 'camera':
        return (
          <>
            <Path d="M3 7h4l2-3h6l2 3h4v13H3z" />
            <Circle cx="12" cy="13" r="4" />
          </>
        );
      case 'image':
        return (
          <>
            <Rect x="3" y="3" width="18" height="18" rx="2" />
            <Circle cx="8.5" cy="8.5" r="1.5" />
            <Polyline points="21 15 16 10 5 21" />
          </>
        );
      case 'clock':
        return (
          <>
            <Circle cx="12" cy="12" r="9" />
            <Polyline points="12 7 12 12 15.5 14" />
          </>
        );
      case 'settings':
        return (
          <>
            <Circle cx="12" cy="12" r="3" />
            <Path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1v.1h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4h-.1v-4H3A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1v-.1h4V3A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.08.37.29.72.6 1 .28.23.63.37 1 .4h.1v4H21a1.7 1.7 0 0 0-1.6.6z" />
          </>
        );
      case 'warning':
        return (
          <>
            <Path d="M10.3 3.7 2.4 18a2 2 0 0 0 1.75 3h15.7a2 2 0 0 0 1.75-3L13.7 3.7a2 2 0 0 0-3.4 0z" />
            <Line x1="12" y1="9" x2="12" y2="13" />
            <Line x1="12" y1="17" x2="12.01" y2="17" strokeWidth={3} />
          </>
        );
      case 'alert-circle':
        return (
          <>
            <Circle cx="12" cy="12" r="9" />
            <Line x1="12" y1="8" x2="12" y2="13" />
            <Line x1="12" y1="17" x2="12.01" y2="17" strokeWidth={3} />
          </>
        );
      case 'close':
        return (
          <>
            <Line x1="6" y1="6" x2="18" y2="18" />
            <Line x1="18" y1="6" x2="6" y2="18" />
          </>
        );
      case 'check':
        return <Polyline points="5 12.5 9.5 17 19 7" />;
      case 'check-circle':
        return (
          <>
            <Circle cx="12" cy="12" r="9" />
            <Polyline points="7.5 12.5 10.5 15.5 17 9" />
          </>
        );
      case 'chart':
        return (
          <>
            <Path d="M4 20V5" />
            <Path d="M4 20h16" />
            <Path d="m7 15 4-4 3 2 5-6" />
          </>
        );
      case 'sparkles':
        return (
          <>
            <Path d="m12 3 1.1 3.2L16 7.5l-2.9 1.3L12 12l-1.1-3.2L8 7.5l2.9-1.3z" />
            <Path d="m18.5 13 .7 2.1 1.8.9-1.8.9-.7 2.1-.7-2.1L16 16l1.8-.9z" />
            <Path d="m5.5 12 .7 2.1L8 15l-1.8.9L5.5 18l-.7-2.1L3 15l1.8-.9z" />
          </>
        );
      case 'refresh':
        return (
          <>
            <Polyline points="20 6 20 11 15 11" />
            <Path d="M18.2 16a8 8 0 1 1 .8-8.5L20 11" />
          </>
        );
      case 'pause':
        return (
          <>
            <Line x1="9" y1="6" x2="9" y2="18" strokeWidth={3} />
            <Line x1="15" y1="6" x2="15" y2="18" strokeWidth={3} />
          </>
        );
      case 'play':
        return <Polygon points="8 5 19 12 8 19" fill={color} stroke="none" />;
      case 'plus':
        return (
          <>
            <Line x1="12" y1="5" x2="12" y2="19" />
            <Line x1="5" y1="12" x2="19" y2="12" />
          </>
        );
      case 'minus':
        return <Line x1="5" y1="12" x2="19" y2="12" />;
      case 'scan':
        return (
          <>
            <Path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <Path d="M16 3h3a2 2 0 0 1 2 2v3" />
            <Path d="M21 16v3a2 2 0 0 1-2 2h-3" />
            <Path d="M8 21H5a2 2 0 0 1-2-2v-3" />
            <Line x1="7" y1="12" x2="17" y2="12" />
          </>
        );
      case 'resize':
        return (
          <>
            <Polyline points="15 3 21 3 21 9" />
            <Line x1="21" y1="3" x2="14" y2="10" />
            <Polyline points="9 21 3 21 3 15" />
            <Line x1="3" y1="21" x2="10" y2="14" />
          </>
        );
    }
  })();

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {glyph}
    </Svg>
  );
}
