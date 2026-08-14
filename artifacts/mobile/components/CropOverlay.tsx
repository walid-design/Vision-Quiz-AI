import React, { useRef } from 'react';
import { View, StyleSheet, PanResponder, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CropRegion } from '@/types';

interface Props {
  region: CropRegion;
  onRegionChange: (region: CropRegion) => void;
  containerWidth: number;
  containerHeight: number;
}

const MIN_SIZE = 80;
const HANDLE_SIZE = 32;

export function CropOverlay({ region, onRegionChange, containerWidth, containerHeight }: Props) {
  // Store last region in ref to avoid stale closures in PanResponder
  const regionRef = useRef(region);
  regionRef.current = region;

  const dragResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const r = regionRef.current;
        const newX = Math.max(0, Math.min(containerWidth - r.width, r.x + g.dx));
        const newY = Math.max(0, Math.min(containerHeight - r.height, r.y + g.dy));
        onRegionChange({ ...r, x: newX, y: newY });
      },
    }),
  ).current;

  const resizeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        // Stop event propagation so drag doesn't also trigger
        e.stopPropagation?.();
      },
      onPanResponderMove: (_, g) => {
        const r = regionRef.current;
        const newW = Math.max(MIN_SIZE, Math.min(containerWidth - r.x, r.width + g.dx));
        const newH = Math.max(MIN_SIZE, Math.min(containerHeight - r.y, r.height + g.dy));
        onRegionChange({ ...r, width: newW, height: newH });
      },
    }),
  ).current;

  const ELECTRIC_BLUE = '#0ea5e9';

  return (
    <View
      style={[
        styles.overlay,
        { left: region.x, top: region.y, width: region.width, height: region.height },
      ]}
    >
      {/* Drag handle covers the interior */}
      <View {...dragResponder.panHandlers} style={styles.dragArea}>
        {/* Corners */}
        <View style={[styles.corner, styles.cornerTL, { borderColor: ELECTRIC_BLUE }]} />
        <View style={[styles.corner, styles.cornerTR, { borderColor: ELECTRIC_BLUE }]} />
        <View style={[styles.corner, styles.cornerBL, { borderColor: ELECTRIC_BLUE }]} />
        {/* Center label */}
        <View style={styles.centerLabel}>
          <Text style={styles.labelText}>Detection Region</Text>
        </View>
      </View>

      {/* Resize handle — bottom-right corner, separate from drag */}
      <View
        {...resizeResponder.panHandlers}
        style={[styles.resizeHandle, { backgroundColor: ELECTRIC_BLUE }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="resize" size={16} color="#fff" />
      </View>

      {/* Border */}
      <View style={[StyleSheet.absoluteFill, styles.border, { borderColor: ELECTRIC_BLUE }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
  },
  border: {
    borderWidth: 2,
    borderRadius: 4,
  },
  dragArea: {
    flex: 1,
    backgroundColor: 'rgba(14,165,233,0.06)',
  },
  corner: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderWidth: 3,
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 4,
  },
  centerLabel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.5,
  },
  resizeHandle: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderTopLeftRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
