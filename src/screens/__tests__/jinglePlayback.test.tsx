/**
 * C8 RED test — real per-mascot jingle playback on the child timer's
 * Completed/Verified transition (JINGLE_DESIGN §3.2), never on parent/PIN
 * screens (INV-05).
 *
 * RED on the pre-integration tree: `playCelebrationSound` is a guarded no-op
 * stub (no audio module installed) and `TimerScreen` never triggers playback.
 * @jest-environment node
 */
import React from 'react';
import { act, cleanup } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import * as path from 'path';
import { TimerScreen } from '../TimerScreen';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { timerStore } from '../../state/timerStore';
import { useMascotStore } from '../../state/mascotStore';
import { jingleSources } from '../../ui/jingleSources';
import { MASCOTS } from '../../ui/mascotRoster';

jest.setTimeout(30000);

const audio = require('expo-audio') as {
  createAudioPlayer: jest.Mock;
  setAudioModeAsync: jest.Mock;
  __players: Array<{
    volume: number;
    play: jest.Mock;
    remove: jest.Mock;
    listeners: Array<{ event: string; cb: (status: unknown) => void }>;
  }>;
};

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  addListener: jest.fn(() => () => {}),
};

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('C8 - per-mascot jingle playback on timer completion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    audio.__players.length = 0;
    useMascotStore.setState({ mascot: 'Bubblo', hydrated: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('plays the selected mascot jingle exactly once on a LIVE Completed (not Running/Paused) at the settings volume, then unloads', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const screen = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    // Running: silent.
    await act(async () => {
      await timerStore.start(1);
    });
    expect(timerStore.getSnapshot().state.kind).toBe('Running');
    await flush();
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();

    // Paused: still silent.
    await act(async () => {
      await timerStore.pause();
    });
    expect(timerStore.getSnapshot().state.kind).toBe('Paused');
    await flush();
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();

    // Resume, run to Completed: exactly one jingle, default volume 0.5, Bubblo.
    await act(async () => {
      await timerStore.resume();
    });
    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });
    expect(timerStore.getSnapshot().state.kind).toBe('Completed');
    await flush();

    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audio.createAudioPlayer).toHaveBeenCalledWith(jingleSources.Bubblo);
    expect(audio.setAudioModeAsync).toHaveBeenCalled();
    expect(audio.__players[0]?.volume).toBeCloseTo(0.5, 5);
    expect(audio.__players[0]?.play).toHaveBeenCalledTimes(1);

    // A further tick while still Completed must NOT replay.
    await act(async () => {
      await timerStore.tick();
    });
    await flush();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);

    // Unload: the finish status frees the native player (and its listener).
    const player = audio.__players[0];
    if (!player) throw new Error('expected the jingle player to be created');
    const statusListener = player.listeners.find((l) => l.event === 'playbackStatusUpdate');
    if (!statusListener) throw new Error('expected a playbackStatusUpdate listener');
    expect(player.remove).not.toHaveBeenCalled();
    statusListener.cb({ didJustFinish: false });
    expect(player.remove).not.toHaveBeenCalled();
    statusListener.cb({ didJustFinish: true });
    expect(player.remove).toHaveBeenCalledTimes(1);

    screen.unmount();
  });

  it('honours a custom volume + a non-default mascot from the settings store', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    useMascotStore.setState({ mascot: 'Stella', hydrated: true });

    const screen = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );
    await screen.services.settingsRepo.set('@focuskid/jingle_volume', '0.8');

    await act(async () => {
      await timerStore.start(1);
    });
    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });
    await flush();

    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audio.createAudioPlayer).toHaveBeenCalledWith(jingleSources.Stella);
    expect(audio.__players[0]?.volume).toBeCloseTo(0.8, 5);

    screen.unmount();
  });

  it('jingle_enabled=false keeps completion silent', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const screen = await renderWithApp(
      <TimerScreen navigation={mockNavigation} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );
    await screen.services.settingsRepo.set('@focuskid/jingle_enabled', 'false');

    await act(async () => {
      await timerStore.start(1);
    });
    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });
    await flush();

    expect(timerStore.getSnapshot().state.kind).toBe('Completed');
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();

    screen.unmount();
  });

  it('jingle map has exactly the 7 roster entries and each require points at its own INDEX.json file', async () => {
    const index = require('../../../sfx/jingles/INDEX.json') as Array<{
      mascot: string;
      path: string;
    }>;

    expect(index).toHaveLength(7);
    expect(Object.keys(jingleSources)).toHaveLength(7);
    expect(Object.keys(jingleSources).sort()).toEqual([...MASCOTS].sort());
    expect(index.map((entry) => entry.mascot).sort()).toEqual([...MASCOTS].sort());

    // Metro-safe: the source file must hold one literal require per mascot,
    // each naming that mascot's own WAV (a swapped mapping is a silent bug).
    const source = readFileSync(
      path.resolve(__dirname, '../../ui/jingleSources.ts'),
      'utf8'
    );
    for (const entry of index) {
      expect(source).toContain(
        `${entry.mascot}: require('../../${entry.path}')`
      );
      expect(jingleSources[entry.mascot as keyof typeof jingleSources]).toBeDefined();
    }
  });

  it('INV-05: no playback trigger on parent/PIN screens (a completion with the child Timer unmounted stays silent)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const { PinGateScreen } = require('../PinGateScreen');
    const pin = await renderWithApp(
      <PinGateScreen navigation={mockNavigation} route={{ params: { intent: 'enterParent' } } as any} />,
      { db, clock, wall: systemWallClock }
    );
    expect(pin.queryByTestId('jingle-volume')).toBeNull();
    pin.unmount();

    const { ParentHomeScreen } = require('../ParentHomeScreen');
    const parent = await renderWithApp(
      <ParentHomeScreen navigation={mockNavigation} route={{} as any} />,
      { db, clock, wall: systemWallClock }
    );

    // The timer completes while ONLY the parent screen is mounted: the child
    // Timer is the only component allowed to trigger a jingle, so this must
    // stay silent.
    await act(async () => {
      await timerStore.start(1);
    });
    await act(async () => {
      clock.advance(900_000);
      await timerStore.tick();
    });
    expect(timerStore.getSnapshot().state.kind).toBe('Completed');
    await flush();

    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
    expect(parent.queryByTestId('jingle-volume')).toBeNull();

    parent.unmount();
  });
});