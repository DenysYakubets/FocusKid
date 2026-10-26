/** @jest-environment node */
import React from 'react';
import * as RN from 'react-native';
import { act } from '@testing-library/react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { systemWallClock } from '../../services/clock/wallClock';
import { MascotFloating, mascotOffset, mascotSize } from '../components/MascotFloating';
import { useMascotStore } from '../../state/mascotStore';

// No jest.requireActual: the real RNCSafeAreaProvider renders nothing in the
// node test environment. Provide a passthrough provider + fixed insets.
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 8, right: 12 }),
}));

const INSETS = { top: 24, bottom: 20, left: 8, right: 12 };

let timestamp = 990;

/** A realistic RN touchHistory so PanResponder's centroid math works. */
const makeTouchHistory = (pageX: number, pageY: number, previousPageX = pageX, previousPageY = pageY, time = timestamp += 10) => ({
  touchBank: [
    {
      touchActive: true,
      currentPageX: pageX,
      currentPageY: pageY,
      previousPageX,
      previousPageY,
      currentTimeStamp: time,
      previousTimeStamp: time - 10,
    },
  ],
  indexOfSingleActiveTouch: 0,
  numberActiveTouches: 1,
  mostRecentTimeStamp: time,
});

/** Build a synthetic GestureResponderEvent PanResponder's handlers accept. */
const ev = (pageX: number, pageY: number, previousPageX = pageX, previousPageY = pageY) => {
  const touchHistory = makeTouchHistory(pageX, pageY, previousPageX, previousPageY);
  return {
    touchHistory,
    nativeEvent: {
      touches: [{ pageX, pageY, timestamp: touchHistory.mostRecentTimeStamp }],
      changedTouches: [{ pageX, pageY, timestamp: touchHistory.mostRecentTimeStamp }],
    },
  } as any;
};

const renderMascot = async (corner: 'bottom-right' | 'top-right' = 'bottom-right') => {
  const screen = await renderWithApp(<MascotFloating corner={corner} />, {
    db: createNodeDb(),
    clock: createFakeClock(1000),
    wall: systemWallClock,
  });
  await act(async () => {});
  return screen;
};

/** The mascot wrapper exposes the component's PanResponder as RN responder props. */
const responderProps = (node: any) => ({
  onStartShouldSetResponder: node.props.onStartShouldSetResponder as () => boolean,
  onMoveShouldSetResponder: node.props.onMoveShouldSetResponder as
    (e: any) => boolean,
  onResponderGrant: node.props.onResponderGrant as (e: any) => void,
  onResponderMove: node.props.onResponderMove as (e: any) => void,
  onResponderRelease: node.props.onResponderRelease as (e: any) => void,
  onResponderTerminate: node.props.onResponderTerminate as (e: any) => void,
});

const position = () => (useMascotStore.getState() as any).position;

describe('mascot drag: PanResponder callbacks, clamping, persistence across screens', () => {
  beforeEach(() => {
    useMascotStore.setState({ position: null } as any);
  });

  for (const width of [320, 366, 413]) {
    it(`claims only on movement, clamps release/terminate, restores on another screen at ${width}dp`, async () => {
      jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width, height: 800, scale: 1, fontScale: 1 });
      const first = await renderMascot();
      const p = responderProps(first.getByTestId('mascot-floating'));

      // A stationary touch must not claim the responder (the tap still cycles moods).
      expect(p.onStartShouldSetResponder()).toBe(false);
      // PanResponder ignores gestureState arguments passed to responder handlers:
      // it derives dx/dy from touchHistory's currentPage - previousPage coordinates.
      // Synthetic moves therefore need differing coordinates and fresh timestamps.
      expect(p.onMoveShouldSetResponder(emptyEvent())).toBe(false);

      // Drag far past the bottom-left corner: release clamps to the window.
      await act(async () => {
        p.onResponderGrant(ev(0, 0));
        p.onResponderMove(ev(-10000, 10000, 0, 0));
        p.onResponderRelease(ev(-10000, 10000));
      });
      expect(position()).toEqual({ x: INSETS.left, y: 800 - INSETS.bottom - mascotSize(width) });

      // Navigate: unmount, remount on another corner -> the saved point wins.
      first.unmount();
      const second = await renderMascot('top-right');
      const style = RN.StyleSheet.flatten(second.getByTestId('mascot-floating').props.style);
      expect(Number(style.left)).toBe(INSETS.left);
      expect(Number(style.top)).toBe(800 - INSETS.bottom - mascotSize(width));
      expect(style.right).toBeUndefined();
      expect(style.bottom).toBeUndefined();

      // Terminate (app backgrounded) mid-drag also clamps and persists.
      const q = responderProps(second.getByTestId('mascot-floating'));
      await act(async () => {
        q.onResponderGrant(ev(0, 0));
        q.onResponderMove(ev(10000, -10000, 0, 0));
        q.onResponderTerminate(ev(10000, -10000));
      });
      expect(position()).toEqual({ x: width - INSETS.right - mascotSize(width), y: INSETS.top });
      second.unmount();
    });
  }

  it('keeps a mid-screen drag exactly where it was released', async () => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width: 366, height: 800, scale: 1, fontScale: 1 });
    const screen = await renderMascot();
    const p = responderProps(screen.getByTestId('mascot-floating'));
    await act(async () => {
      p.onResponderGrant(ev(0, 0));
      p.onResponderMove(ev(-70, -300, 0, 0));
      p.onResponderRelease(ev(-70, -300));
    });
    const size = mascotSize(366);
    const pos = position()!;
    expect(pos).toEqual({
      x: 366 - mascotOffset(366) - INSETS.right - size - 70,
      y: 800 - mascotOffset(366) - INSETS.bottom - size - 300,
    });
    expect(pos.x).toBeGreaterThanOrEqual(INSETS.left);
    expect(pos.x).toBeLessThanOrEqual(366 - INSETS.right - size);
    expect(pos.y).toBeGreaterThanOrEqual(INSETS.top);
    expect(pos.y).toBeLessThanOrEqual(800 - INSETS.bottom - size);
    screen.unmount();
  });
});

function emptyEvent() {
  return { touchHistory: makeTouchHistory(0, 0), nativeEvent: { touches: [], changedTouches: [] } } as any;
}
